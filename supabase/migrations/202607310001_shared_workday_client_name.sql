-- Include the opdrachtgever in privacy-safe shared workday responses.
-- Run after 202607270001_workday_names_and_participants.sql.

drop function if exists public.get_received_workday_shares();
create function public.get_received_workday_shares()
returns table (
  id uuid, source_type text, source_id uuid, owner_id uuid, owner_name text,
  work_date date, start_time text, end_time text, project_name text,
  workday_name text, client_name text, optional_message text, share_mode text,
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
    coalesce(
      w.calculation_data ->> 'clientName',
      pd.calculation_data ->> 'clientName',
      pr.client_name,
      ''
    ),
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
  workday_name text, client_name text, optional_message text, share_mode text,
  available boolean
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
    coalesce(
      w.calculation_data ->> 'clientName',
      pd.calculation_data ->> 'clientName',
      pr.client_name,
      ''
    ),
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

revoke all on function public.get_received_workday_shares() from public;
revoke all on function public.preview_workday_share_invite(text) from public;
grant execute on function public.get_received_workday_shares() to authenticated;
grant execute on function public.preview_workday_share_invite(text) to anon, authenticated;
