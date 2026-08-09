-- Server-side overtime and night-tariff reminders for saved workdays.
-- The existing local reminder remains a foreground convenience; this function
-- is the source used by Web Push while the PWA is closed.

create unique index if not exists notifications_workday_rule_owner_once_idx
  on public.notifications (recipient_id, notification_type, source_type, source_id)
  where notification_type in ('workday_overtime_soon', 'workday_night_soon')
    and source_id is not null;

create unique index if not exists notifications_workday_rule_participant_once_idx
  on public.notifications (recipient_id, notification_type, share_id)
  where notification_type in ('workday_overtime_soon', 'workday_night_soon')
    and share_id is not null;

create or replace function public.dispatch_workday_rule_notifications()
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
      w.work_date,
      w.calculation_data ->> 'startTime' as start_time,
      coalesce(nullif(w.calculation_data ->> 'breakMinutes', '')::numeric, 0) as break_minutes,
      coalesce(nullif(w.calculation_data -> 'settings' ->> 'normalDayHours', '')::numeric, 10) as normal_hours,
      coalesce((w.calculation_data -> 'settings' ->> 'enableOvertime10To12')::boolean, false)
        or coalesce((w.calculation_data -> 'settings' ->> 'enableOvertimeFrom12')::boolean, false)
        or coalesce((w.calculation_data -> 'settings' ->> 'enableOvertimeFrom14')::boolean, false) as overtime_enabled,
      coalesce((w.calculation_data -> 'settings' ->> 'enableNightTariff')::boolean, false) as night_enabled,
      coalesce(nullif(w.calculation_data -> 'settings' ->> 'nightStart', ''), '00:00') as night_start,
      coalesce(nullif(w.calculation_data -> 'settings' ->> 'nightEnd', ''), '06:00') as night_end,
      coalesce((w.calculation_data -> 'extras' ->> 'enableTravelDay')::boolean, false) as travel_day
    from public.workdays w
    where nullif(w.calculation_data ->> 'startTime', '') is not null
      and nullif(w.calculation_data ->> 'endTime', '') is null

    union all

    select
      'project_day'::text,
      pd.id,
      pd.user_id,
      pd.work_date,
      pd.calculation_data ->> 'startTime',
      coalesce(nullif(pd.calculation_data ->> 'breakMinutes', '')::numeric, 0),
      coalesce(nullif(pd.calculation_data ->> 'normalDayHours', '')::numeric, 10),
      coalesce((pd.calculation_data ->> 'enableOvertime10To12')::boolean, false)
        or coalesce((pd.calculation_data ->> 'enableOvertimeFrom12')::boolean, false)
        or coalesce((pd.calculation_data ->> 'enableOvertimeFrom14')::boolean, false),
      coalesce((pd.calculation_data ->> 'enableNightTariff')::boolean, false),
      coalesce(nullif(pd.calculation_data ->> 'nightStart', ''), '00:00'),
      coalesce(nullif(pd.calculation_data ->> 'nightEnd', ''), '06:00'),
      coalesce((pd.calculation_data ->> 'enableTravelDay')::boolean, false)
    from public.project_days pd
    where nullif(pd.calculation_data ->> 'startTime', '') is not null
      and nullif(pd.calculation_data ->> 'endTime', '') is null
  ),
  moments as (
    select
      source.*,
      (source.work_date::text || ' ' || source.start_time)::timestamp
        at time zone 'Europe/Amsterdam' as starts_at,
      ((source.work_date::text || ' ' || source.start_time)::timestamp
        + make_interval(mins => (source.normal_hours * 60 + source.break_minutes)::integer))
        at time zone 'Europe/Amsterdam' as overtime_at,
      case
        -- A same-day window (for example 00:00-06:00) is only upcoming
        -- when work starts before the window. Starting inside it means the
        -- surcharge is already active, so no reminder is needed.
        when source.night_start::time < source.night_end::time
          and source.start_time::time < source.night_start::time then
          (source.work_date::text || ' ' || source.night_start)::timestamp
            at time zone 'Europe/Amsterdam'
        -- For an overnight window (for example 22:00-06:00), only the gap
        -- between the morning end and evening start has an upcoming boundary.
        when source.night_start::time > source.night_end::time
          and source.start_time::time >= source.night_end::time
          and source.start_time::time < source.night_start::time then
          (source.work_date::text || ' ' || source.night_start)::timestamp
            at time zone 'Europe/Amsterdam'
        else null
      end as night_at
    from sources source
  ),
  due as (
    select moments.*, 'workday_overtime_soon'::text as notification_type
    from moments
    where moments.overtime_enabled
      and not moments.travel_day
      and moments.overtime_at - interval '15 minutes' <= now()
      and moments.overtime_at - interval '15 minutes' > now() - interval '5 minutes'

    union all

    select moments.*, 'workday_night_soon'::text
    from moments
    where moments.night_enabled
      and not moments.travel_day
      and moments.night_at is not null
      and moments.night_at - interval '15 minutes' <= now()
      and moments.night_at - interval '15 minutes' > now() - interval '5 minutes'
  ),
  recipients as (
    select
      due.owner_id as recipient_id,
      due.owner_id as actor_id,
      due.notification_type,
      null::uuid as share_id,
      due.source_type,
      due.source_id
    from due

    union all

    select
      share.recipient_id,
      share.owner_id,
      due.notification_type,
      share.id,
      due.source_type,
      due.source_id
    from due
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

revoke all on function public.dispatch_workday_rule_notifications() from public;
grant execute on function public.dispatch_workday_rule_notifications() to service_role;

comment on function public.dispatch_workday_rule_notifications() is
  'Creates idempotent 15-minute overtime and night reminders for saved active workdays and accepted participants.';
