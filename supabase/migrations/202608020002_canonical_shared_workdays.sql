-- Keep one canonical shared workday while storing each recipient's private
-- calculator state separately. Run after 202608020001_pro_trials.sql.

create table if not exists public.workday_share_recipient_data (
  share_id uuid primary key references public.workday_shares(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  calculation_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workday_share_recipient_data_recipient_idx
  on public.workday_share_recipient_data(recipient_id, updated_at desc);

alter table public.workday_share_recipient_data enable row level security;

drop policy if exists "Recipients read own shared calculation" on public.workday_share_recipient_data;
create policy "Recipients read own shared calculation"
on public.workday_share_recipient_data for select
using (recipient_id = (select auth.uid()));

drop policy if exists "Recipients insert own shared calculation" on public.workday_share_recipient_data;
create policy "Recipients insert own shared calculation"
on public.workday_share_recipient_data for insert
with check (recipient_id = (select auth.uid()));

drop policy if exists "Recipients update own shared calculation" on public.workday_share_recipient_data;
create policy "Recipients update own shared calculation"
on public.workday_share_recipient_data for update
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

-- Migrate earlier recipient copies without deleting them. The UI hides these
-- legacy copies; keeping them makes this migration non-destructive.
insert into public.workday_share_recipient_data (
  share_id,
  recipient_id,
  calculation_data,
  created_at,
  updated_at
)
select distinct on (s.id)
  s.id,
  s.recipient_id,
  w.calculation_data,
  w.created_at,
  w.updated_at
from public.workday_shares s
join public.workdays w
  on w.user_id = s.recipient_id
 and w.calculation_data ->> 'importedFromShare' = s.id::text
order by s.id, w.updated_at desc
on conflict (share_id) do nothing;

drop function if exists public.save_received_workday_calculation(uuid, jsonb);
create function public.save_received_workday_calculation(
  p_share_id uuid,
  p_calculation_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
begin
  select s.recipient_id
    into v_recipient_id
  from public.workday_shares s
  where s.id = p_share_id
    and s.recipient_id = (select auth.uid())
    and s.delivered_at is not null;

  if v_recipient_id is null then
    raise exception 'Gedeelde werkdag niet gevonden';
  end if;

  insert into public.workday_share_recipient_data (
    share_id,
    recipient_id,
    calculation_data,
    updated_at
  ) values (
    p_share_id,
    v_recipient_id,
    coalesce(p_calculation_data, '{}'::jsonb),
    now()
  )
  on conflict (share_id) do update
    set calculation_data = excluded.calculation_data,
        updated_at = now();
end;
$$;

drop function if exists public.get_received_workday_shares();
create function public.get_received_workday_shares()
returns table (
  id uuid, source_type text, source_id uuid, owner_id uuid, owner_name text,
  work_date date, start_time text, end_time text, project_name text,
  workday_name text, client_name text, optional_message text, share_mode text,
  accepted_at timestamptz, source_updated_at timestamptz, created_at timestamptz,
  recipient_calculation_data jsonb
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
    s.created_at,
    coalesce(rd.calculation_data, '{}'::jsonb)
  from public.workday_shares s
  left join public.profiles p on p.id = s.owner_id
  left join public.workdays w on w.id = s.workday_id
  left join public.project_days pd on pd.id = s.project_day_id
  left join public.projects pr on pr.id = pd.project_id
  left join public.workday_share_recipient_data rd
    on rd.share_id = s.id
   and rd.recipient_id = (select auth.uid())
  where s.recipient_id = (select auth.uid())
    and s.delivered_at is not null
  order by s.created_at desc;
$$;

revoke all on table public.workday_share_recipient_data from anon, authenticated;
revoke all on function public.save_received_workday_calculation(uuid, jsonb) from public;
revoke all on function public.get_received_workday_shares() from public;
grant execute on function public.save_received_workday_calculation(uuid, jsonb) to authenticated;
grant execute on function public.get_received_workday_shares() to authenticated;

comment on table public.workday_share_recipient_data is
  'Private calculator state per recipient. Owners only see canonical shared times, never recipient rates.';
