-- Notify the owner and accepted participants when a workday that was saved
-- beforehand starts. A workday created at or after its start is deliberately
-- ignored: starting a day inside the calculator must not create this reminder.
-- Run after 202607280003_shared_workday_live_updates.sql.

create extension if not exists pg_cron with schema pg_catalog;

alter table public.notifications
  add column if not exists source_type text,
  add column if not exists source_id uuid;

alter table public.notifications
  drop constraint if exists notifications_source_type_check;
alter table public.notifications
  add constraint notifications_source_type_check
  check (source_type is null or source_type in ('workday', 'project_day'));

create unique index if not exists notifications_owner_workday_start_idx
  on public.notifications (recipient_id, notification_type, source_type, source_id)
  where notification_type = 'workday_start_owner' and source_id is not null;

create unique index if not exists notifications_participant_workday_start_idx
  on public.notifications (recipient_id, notification_type, share_id)
  where notification_type = 'workday_started' and share_id is not null;

create or replace function public.dispatch_workday_start_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  with sources as (
    select
      'workday'::text as source_type,
      w.id as source_id,
      w.user_id as owner_id,
      w.updated_at as configured_at,
      (
        w.work_date::text || ' ' || nullif(w.calculation_data ->> 'startTime', '')
      )::timestamp at time zone 'Europe/Amsterdam' as starts_at
    from public.workdays w
    where nullif(w.calculation_data ->> 'startTime', '') is not null

    union all

    select
      'project_day'::text,
      pd.id,
      pd.user_id,
      pd.updated_at,
      (
        pd.work_date::text || ' ' || nullif(pd.calculation_data ->> 'startTime', '')
      )::timestamp at time zone 'Europe/Amsterdam'
    from public.project_days pd
    where nullif(pd.calculation_data ->> 'startTime', '') is not null
  ),
  due_sources as (
    select *
    from sources
    where starts_at <= now()
      and starts_at > now() - interval '5 minutes'
      and configured_at <= starts_at - interval '1 minute'
  ),
  recipients as (
    select
      due.owner_id as recipient_id,
      due.owner_id as actor_id,
      'workday_start_owner'::text as notification_type,
      null::uuid as share_id,
      due.source_type,
      due.source_id
    from due_sources due

    union all

    select
      share.recipient_id,
      share.owner_id,
      'workday_started'::text,
      share.id,
      due.source_type,
      due.source_id
    from due_sources due
    join public.workday_shares share
      on (due.source_type = 'workday' and share.workday_id = due.source_id)
      or (due.source_type = 'project_day' and share.project_day_id = due.source_id)
    where share.accepted_at is not null
      and share.delivered_at is not null
  ),
  inserted as (
    insert into public.notifications (
      recipient_id,
      actor_id,
      notification_type,
      share_id,
      source_type,
      source_id
    )
    select
      recipient_id,
      actor_id,
      notification_type,
      share_id,
      source_type,
      source_id
    from recipients
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;

  return inserted_count;
end;
$$;

revoke all on function public.dispatch_workday_start_notifications() from public;

drop function if exists public.list_overuurtje_notifications();
create function public.list_overuurtje_notifications()
returns table (
  id uuid,
  notification_type text,
  share_id uuid,
  source_type text,
  source_id uuid,
  actor_name text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.notification_type,
    n.share_id,
    n.source_type,
    n.source_id,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Een collega'),
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  where n.recipient_id = (select auth.uid())
  order by n.created_at desc
  limit 50;
$$;

revoke all on function public.list_overuurtje_notifications() from public;
grant execute on function public.list_overuurtje_notifications() to authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'overuurtje-workday-start-notifications'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'overuurtje-workday-start-notifications',
  '* * * * *',
  'select public.dispatch_workday_start_notifications();'
);

comment on function public.dispatch_workday_start_notifications() is
  'Notifies owners and accepted participants when a workday saved at least one minute before its start begins.';
