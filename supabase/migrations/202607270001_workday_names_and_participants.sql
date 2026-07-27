-- Optional standalone workday names and privacy-safe participant names.
-- Run after 202607250003_workday_share_invites.sql.

alter table public.workdays
  add column if not exists name text;

alter table public.workdays
  drop constraint if exists workdays_name_length_check;
alter table public.workdays
  add constraint workdays_name_length_check
  check (name is null or char_length(name) <= 100);

comment on column public.workdays.name is
  'Optional user-facing label for a standalone workday. Shared alongside date and times.';

drop function if exists public.get_received_workday_shares();
create function public.get_received_workday_shares()
returns table (
  id uuid, source_type text, source_id uuid, owner_id uuid, owner_name text,
  work_date date, start_time text, end_time text, project_name text,
  workday_name text, optional_message text, share_mode text,
  accepted_at timestamptz, source_updated_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    s.id,
    case when s.workday_id is not null then 'workday' else 'project_day' end,
    coalesce(s.workday_id, s.project_day_id),
    s.owner_id,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Een collega'),
    coalesce(w.work_date, pd.work_date),
    coalesce(w.calculation_data ->> 'startTime', pd.calculation_data ->> 'startTime', ''),
    coalesce(w.calculation_data ->> 'endTime', pd.calculation_data ->> 'endTime', ''),
    coalesce(pr.name, ''),
    coalesce(w.name, ''),
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

drop function if exists public.preview_workday_share_invite(text);
create function public.preview_workday_share_invite(p_token text)
returns table (
  token text, owner_name text, source_type text, source_id uuid,
  work_date date, start_time text, end_time text, project_name text,
  workday_name text, optional_message text, share_mode text, available boolean
)
language sql stable security definer set search_path = public
as $$
  select
    i.token::text,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Een collega'),
    case when i.workday_id is not null then 'workday' else 'project_day' end,
    coalesce(i.workday_id, i.project_day_id),
    coalesce(w.work_date, pd.work_date),
    coalesce(w.calculation_data ->> 'startTime', pd.calculation_data ->> 'startTime', ''),
    coalesce(w.calculation_data ->> 'endTime', pd.calculation_data ->> 'endTime', ''),
    coalesce(pr.name, ''),
    coalesce(w.name, ''),
    coalesce(i.optional_message, ''),
    i.share_mode,
    i.revoked_at is null and (w.id is not null or pd.id is not null)
  from public.workday_share_invites i
  join public.profiles p on p.id = i.owner_id
  left join public.workdays w on w.id = i.workday_id
  left join public.project_days pd on pd.id = i.project_day_id
  left join public.projects pr on pr.id = pd.project_id
  where i.token::text = p_token
  limit 1;
$$;

create or replace function public.get_sent_workday_shares(p_source_type text, p_source_id uuid)
returns table (
  id uuid, recipient_id uuid, recipient_name text, recipient_email text,
  optional_message text, share_mode text, delivered_at timestamptz, accepted_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.recipient_id,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega'),
    '', coalesce(s.optional_message, ''), s.share_mode, s.delivered_at, s.accepted_at
  from public.workday_shares s
  join public.profiles p on p.id = s.recipient_id
  where s.owner_id = (select auth.uid())
    and public.current_user_is_pro()
    and (
      (p_source_type = 'workday' and s.workday_id = p_source_id)
      or (p_source_type = 'project_day' and s.project_day_id = p_source_id)
    )
  order by coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega');
$$;

create or replace function public.get_workday_share_participants(
  p_source_type text,
  p_source_id uuid
)
returns table (
  user_id uuid,
  first_name text,
  is_owner boolean,
  is_current_user boolean
)
language sql stable security definer set search_path = public
as $$
  with source_owner as (
    select w.user_id as owner_id
    from public.workdays w
    where p_source_type = 'workday' and w.id = p_source_id
    union all
    select pd.user_id
    from public.project_days pd
    where p_source_type = 'project_day' and pd.id = p_source_id
  ),
  authorized as (
    select so.owner_id
    from source_owner so
    where so.owner_id = (select auth.uid())
       or exists (
         select 1
         from public.workday_shares s
         where s.recipient_id = (select auth.uid())
           and (
             (p_source_type = 'workday' and s.workday_id = p_source_id)
             or (p_source_type = 'project_day' and s.project_day_id = p_source_id)
           )
       )
  ),
  participant_ids as (
    select a.owner_id as participant_id, true as owner
    from authorized a
    union
    select s.recipient_id, false
    from public.workday_shares s
    join authorized a on a.owner_id = s.owner_id
    where (p_source_type = 'workday' and s.workday_id = p_source_id)
       or (p_source_type = 'project_day' and s.project_day_id = p_source_id)
  )
  select
    pi.participant_id,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega'),
    pi.owner,
    pi.participant_id = (select auth.uid())
  from participant_ids pi
  join public.profiles p on p.id = pi.participant_id
  order by pi.owner desc, 2;
$$;

create or replace function public.list_overuurtje_notifications()
returns table (
  id uuid, notification_type text, share_id uuid, actor_name text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select n.id, n.notification_type, n.share_id,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Een collega'),
    n.read_at, n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  where n.recipient_id = (select auth.uid())
  order by n.created_at desc
  limit 50;
$$;

revoke all on function public.get_received_workday_shares() from public;
revoke all on function public.preview_workday_share_invite(text) from public;
revoke all on function public.get_workday_share_participants(text, uuid) from public;
grant execute on function public.get_received_workday_shares() to authenticated;
grant execute on function public.preview_workday_share_invite(text) to anon, authenticated;
grant execute on function public.get_workday_share_participants(text, uuid) to authenticated;
