-- Private sharing foundation for standalone and project workdays.
-- Run after 202607250001_work_functions.sql.

create table if not exists public.workday_shares (
  id uuid primary key default gen_random_uuid(),
  workday_id uuid references public.workdays(id) on delete cascade,
  project_day_id uuid references public.project_days(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  optional_message text check (optional_message is null or char_length(optional_message) <= 500),
  share_mode text not null default 'direct' check (share_mode in ('direct', 'on_completion')),
  delivered_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workday_shares_one_source check (
    (workday_id is not null and project_day_id is null)
    or (workday_id is null and project_day_id is not null)
  ),
  constraint workday_shares_different_users check (owner_id <> recipient_id)
);

create unique index if not exists workday_shares_workday_recipient_idx
  on public.workday_shares(workday_id, recipient_id) where workday_id is not null;
create unique index if not exists workday_shares_project_day_recipient_idx
  on public.workday_shares(project_day_id, recipient_id) where project_day_id is not null;
create index if not exists workday_shares_recipient_idx
  on public.workday_shares(recipient_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null,
  share_id uuid references public.workday_shares(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, created_at desc);

drop trigger if exists workday_shares_set_updated_at on public.workday_shares;
create trigger workday_shares_set_updated_at before update on public.workday_shares
for each row execute function public.set_updated_at();

alter table public.workday_shares enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Owners can read sent workday shares" on public.workday_shares;
create policy "Owners can read sent workday shares"
on public.workday_shares for select to authenticated
using ((select auth.uid()) = owner_id and public.current_user_is_pro());

drop policy if exists "Recipients can read received workday shares" on public.workday_shares;
create policy "Recipients can read received workday shares"
on public.workday_shares for select to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "Owners can create workday shares" on public.workday_shares;
create policy "Owners can create workday shares"
on public.workday_shares for insert to authenticated
with check ((select auth.uid()) = owner_id and public.current_user_is_pro());

drop policy if exists "Participants can update workday shares" on public.workday_shares;
create policy "Participants can update workday shares"
on public.workday_shares for update to authenticated
using ((select auth.uid()) in (owner_id, recipient_id))
with check ((select auth.uid()) in (owner_id, recipient_id));

drop policy if exists "Owners can delete workday shares" on public.workday_shares;
create policy "Owners can delete workday shares"
on public.workday_shares for delete to authenticated
using ((select auth.uid()) = owner_id and public.current_user_is_pro());

drop policy if exists "Recipients can read their notifications" on public.notifications;
create policy "Recipients can read their notifications"
on public.notifications for select to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "Recipients can update their notifications" on public.notifications;
create policy "Recipients can update their notifications"
on public.notifications for update to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

grant select, insert, update, delete on table public.workday_shares to authenticated;
grant select, update on table public.notifications to authenticated;

create or replace function public.get_received_workday_shares()
returns table (
  id uuid, source_type text, source_id uuid, owner_id uuid, owner_name text,
  work_date date, start_time text, end_time text, project_name text,
  optional_message text, share_mode text, accepted_at timestamptz,
  source_updated_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    s.id,
    case when s.workday_id is not null then 'workday' else 'project_day' end,
    coalesce(s.workday_id, s.project_day_id),
    s.owner_id,
    coalesce(nullif(trim(p.display_name), ''), 'Een collega'),
    coalesce(w.work_date, pd.work_date),
    coalesce(w.calculation_data ->> 'startTime', pd.calculation_data ->> 'startTime', ''),
    coalesce(w.calculation_data ->> 'endTime', pd.calculation_data ->> 'endTime', ''),
    coalesce(pr.name, ''),
    coalesce(s.optional_message, ''),
    s.share_mode,
    s.accepted_at,
    coalesce(w.updated_at, pd.updated_at),
    s.created_at
  from public.workday_shares s
  left join public.profiles p on p.id = s.owner_id
  left join public.workdays w on w.id = s.workday_id
  left join public.project_days pd on pd.id = s.project_day_id
  left join public.projects pr on pr.id = pd.project_id
  where s.recipient_id = (select auth.uid())
    and s.delivered_at is not null
  order by s.created_at desc;
$$;

create or replace function public.get_sent_workday_shares(p_source_type text, p_source_id uuid)
returns table (
  id uuid, recipient_id uuid, recipient_name text, recipient_email text,
  optional_message text, share_mode text, delivered_at timestamptz, accepted_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.recipient_id,
    coalesce(nullif(trim(p.display_name), ''), split_part(p.email, '@', 1)),
    p.email, coalesce(s.optional_message, ''), s.share_mode, s.delivered_at, s.accepted_at
  from public.workday_shares s
  join public.profiles p on p.id = s.recipient_id
  where s.owner_id = (select auth.uid())
    and public.current_user_is_pro()
    and (
      (p_source_type = 'workday' and s.workday_id = p_source_id)
      or (p_source_type = 'project_day' and s.project_day_id = p_source_id)
    )
  order by coalesce(nullif(trim(p.display_name), ''), split_part(p.email, '@', 1));
$$;

create or replace function public.accept_workday_share(p_share_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.workday_shares
  set accepted_at = coalesce(accepted_at, now())
  where id = p_share_id and recipient_id = (select auth.uid());
  if not found then raise exception 'Gedeelde werkdag niet gevonden.'; end if;
end;
$$;

create or replace function public.remove_workday_share(p_share_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from public.workday_shares
  where id = p_share_id and owner_id = (select auth.uid()) and public.current_user_is_pro();
  if not found then raise exception 'Gedeelde werkdag niet gevonden.'; end if;
end;
$$;

create or replace function public.list_overuurtje_notifications()
returns table (
  id uuid, notification_type text, share_id uuid, actor_name text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select n.id, n.notification_type, n.share_id,
    coalesce(nullif(trim(p.display_name), ''), 'Een collega'),
    n.read_at, n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  where n.recipient_id = (select auth.uid())
  order by n.created_at desc
  limit 50;
$$;

create or replace function public.mark_overuurtje_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = (select auth.uid())
    and (p_ids is null or id = any(p_ids));
$$;

revoke all on function public.get_received_workday_shares() from public;
revoke all on function public.get_sent_workday_shares(text, uuid) from public;
revoke all on function public.accept_workday_share(uuid) from public;
revoke all on function public.remove_workday_share(uuid) from public;
revoke all on function public.list_overuurtje_notifications() from public;
revoke all on function public.mark_overuurtje_notifications_read(uuid[]) from public;
grant execute on function public.get_received_workday_shares() to authenticated;
grant execute on function public.get_sent_workday_shares(text, uuid) to authenticated;
grant execute on function public.accept_workday_share(uuid) to authenticated;
grant execute on function public.remove_workday_share(uuid) to authenticated;
grant execute on function public.list_overuurtje_notifications() to authenticated;
grant execute on function public.mark_overuurtje_notifications_read(uuid[]) to authenticated;

comment on table public.workday_shares is
  'References a private standalone or project workday. Recipients use redacted RPCs and never read calculation_data.';
comment on table public.notifications is
  'Reusable in-app notification inbox for collaboration events.';
