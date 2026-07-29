-- General Web Push foundation for every Overuurtje notification type.
-- Run after 202607290001_workday_start_notifications.sql.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, enabled);

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, subscription_id)
);

create index if not exists push_deliveries_queue_idx
  on public.push_deliveries(status, next_attempt_at, created_at);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists push_deliveries_set_updated_at on public.push_deliveries;
create trigger push_deliveries_set_updated_at
before update on public.push_deliveries
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

-- Subscription writes go through the RPCs below. Delivery data is intentionally
-- backend-only because it contains infrastructure and retry information.
revoke all on table public.push_subscriptions from anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
revoke all on table public.push_deliveries from anon, authenticated;

create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  subscription_id uuid;
begin
  if current_user_id is null then
    raise exception 'Je moet ingelogd zijn om meldingen in te schakelen.';
  end if;
  if nullif(trim(p_endpoint), '') is null
    or nullif(trim(p_p256dh), '') is null
    or nullif(trim(p_auth), '') is null then
    raise exception 'De pushsubscription is niet compleet.';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    enabled,
    last_seen_at
  )
  values (
    current_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    left(p_user_agent, 500),
    true,
    now()
  )
  on conflict (endpoint) do update
  set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    enabled = true,
    last_seen_at = now()
  returning id into subscription_id;

  return subscription_id;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions
  where endpoint = p_endpoint
    and user_id = (select auth.uid());
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, text) from public;
grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;
revoke all on function public.remove_push_subscription(text) from public;
grant execute on function public.remove_push_subscription(text) to authenticated;

create or replace function public.queue_notification_push_deliveries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_deliveries (notification_id, subscription_id)
  select new.id, subscription.id
  from public.push_subscriptions subscription
  where subscription.user_id = new.recipient_id
    and subscription.enabled = true
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists notifications_queue_push_deliveries on public.notifications;
create trigger notifications_queue_push_deliveries
after insert on public.notifications
for each row execute function public.queue_notification_push_deliveries();

create or replace function public.claim_push_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  notification_id uuid,
  notification_type text,
  share_id uuid,
  source_type text,
  source_id uuid,
  actor_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select delivery.id
    from public.push_deliveries delivery
    where (
        delivery.status in ('queued', 'failed')
        or (
          delivery.status = 'processing'
          and delivery.updated_at <= now() - interval '10 minutes'
        )
      )
      and delivery.next_attempt_at <= now()
      and delivery.attempts < 4
    order by delivery.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 250))
  ),
  updated as (
    update public.push_deliveries delivery
    set status = 'processing',
        attempts = delivery.attempts + 1,
        updated_at = now()
    from claimed
    where delivery.id = claimed.id
    returning delivery.*
  )
  select
    updated.id,
    subscription.id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth,
    notification.id,
    notification.notification_type,
    notification.share_id,
    notification.source_type,
    notification.source_id,
    coalesce(nullif(split_part(trim(profile.display_name), ' ', 1), ''), 'Een collega')
  from updated
  join public.push_subscriptions subscription on subscription.id = updated.subscription_id
  join public.notifications notification on notification.id = updated.notification_id
  left join public.profiles profile on profile.id = notification.actor_id;
end;
$$;

revoke all on function public.claim_push_deliveries(integer) from public;
grant execute on function public.claim_push_deliveries(integer) to service_role;

comment on table public.push_subscriptions is
  'One Web Push subscription per browser/device. Endpoints and keys are private to the owning user and backend.';
comment on table public.push_deliveries is
  'Backend-only delivery queue for all in-app notifications.';
