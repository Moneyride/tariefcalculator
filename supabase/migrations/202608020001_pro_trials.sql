-- Automatic 30-day Overuurtje Pro trial for accounts created after this migration.
-- Existing Free and paid Pro profiles intentionally keep all trial fields NULL.

alter table public.profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_reminder_sent_at timestamptz,
  add column if not exists trial_reminder_email_sent_at timestamptz,
  add column if not exists trial_reminder_email_error text,
  add column if not exists trial_expired_at timestamptz,
  add column if not exists trial_expired_notice_shown_at timestamptz,
  add column if not exists trial_converted_at timestamptz;

comment on column public.profiles.trial_started_at is
  'Start of the one-time free Pro trial. NULL means no trial was granted.';
comment on column public.profiles.trial_ends_at is
  'Exact server-side end timestamp of the one-time free Pro trial.';
comment on column public.profiles.trial_converted_at is
  'Set when paid Shopify Pro takes over before or after trial expiry.';

-- Only accounts created after this migration receive a trial. The ON CONFLICT
-- clause also prevents an existing auth account from receiving a second trial.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trial_start timestamptz := now();
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    trial_started_at,
    trial_ends_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'display_name',
    trial_start,
    trial_start + interval '30 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Paid Pro and an unexpired, unconverted trial both unlock the existing Pro
-- policies. Checking now() here means a missed cron run cannot extend access.
create or replace function public.current_user_is_pro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      p.is_pro
      or (
        p.trial_started_at is not null
        and p.trial_ends_at > now()
        and p.trial_expired_at is null
        and p.trial_converted_at is null
      )
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$$;

revoke all on function public.current_user_is_pro() from public;
grant execute on function public.current_user_is_pro() to authenticated;

create unique index if not exists notifications_trial_ending_once_idx
  on public.notifications(recipient_id, notification_type)
  where notification_type = 'trial_ending';

create unique index if not exists notifications_trial_expired_once_idx
  on public.notifications(recipient_id, notification_type)
  where notification_type = 'trial_expired';

-- Idempotent transition processor. It can safely be run by cron, manually, or
-- repeatedly after a temporary failure without duplicating notifications.
create or replace function public.process_pro_trial_transitions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  converted_count integer := 0;
  reminder_count integer := 0;
  expired_count integer := 0;
begin
  update public.profiles
  set
    trial_converted_at = coalesce(trial_converted_at, now()),
    updated_at = now()
  where is_pro = true
    and trial_started_at is not null
    and trial_converted_at is null;
  get diagnostics converted_count = row_count;

  with due as (
    update public.profiles p
    set
      trial_reminder_sent_at = now(),
      updated_at = now()
    where p.is_pro = false
      and p.trial_started_at is not null
      and p.trial_ends_at > now()
      and p.trial_ends_at <= now() + interval '7 days'
      and p.trial_reminder_sent_at is null
      and p.trial_converted_at is null
      and p.trial_expired_at is null
    returning p.id
  )
  insert into public.notifications (
    recipient_id,
    actor_id,
    notification_type,
    source_type,
    source_id
  )
  select id, id, 'trial_ending', null, null
  from due
  on conflict (recipient_id, notification_type)
    where notification_type = 'trial_ending'
  do nothing;
  get diagnostics reminder_count = row_count;

  with due as (
    update public.profiles p
    set
      trial_expired_at = coalesce(trial_expired_at, now()),
      updated_at = now()
    where p.is_pro = false
      and p.trial_started_at is not null
      and p.trial_ends_at <= now()
      and p.trial_converted_at is null
      and p.trial_expired_at is null
    returning p.id
  )
  insert into public.notifications (
    recipient_id,
    actor_id,
    notification_type,
    source_type,
    source_id
  )
  select id, id, 'trial_expired', null, null
  from due
  on conflict (recipient_id, notification_type)
    where notification_type = 'trial_expired'
  do nothing;
  get diagnostics expired_count = row_count;

  return jsonb_build_object(
    'converted', converted_count,
    'reminders_created', reminder_count,
    'expired', expired_count
  );
end;
$$;

revoke all on function public.process_pro_trial_transitions() from public;
grant execute on function public.process_pro_trial_transitions() to service_role;

-- Called after the one-time in-app expiry notice has actually been shown.
create or replace function public.mark_trial_expired_notice_shown()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  shown_at timestamptz;
begin
  update public.profiles
  set
    trial_expired_at = coalesce(trial_expired_at, now()),
    trial_expired_notice_shown_at = coalesce(trial_expired_notice_shown_at, now()),
    updated_at = now()
  where id = (select auth.uid())
    and is_pro = false
    and trial_started_at is not null
    and trial_ends_at <= now()
    and trial_converted_at is null
  returning trial_expired_notice_shown_at into shown_at;

  return shown_at;
end;
$$;

revoke all on function public.mark_trial_expired_notice_shown() from public;
grant execute on function public.mark_trial_expired_notice_shown() to authenticated;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'overuurtje-pro-trials'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'overuurtje-pro-trials',
    '0 * * * *',
    'select public.process_pro_trial_transitions();'
  );
end;
$$;

-- Apply any transitions that are already due when the migration is installed.
select public.process_pro_trial_transitions();
