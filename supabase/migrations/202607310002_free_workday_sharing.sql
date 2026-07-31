-- Make standalone workday sharing available to every authenticated account.
-- Regular cloud workday storage and project sharing remain Pro-only.

alter table public.workdays
  add column if not exists sharing_only boolean not null default false;

comment on column public.workdays.sharing_only is
  'Privacy-safe source used only for sharing. Hidden from the regular Pro workday archive.';

create or replace function public.prepare_shared_workday_source(
  p_workday_id uuid default null,
  p_name text default '',
  p_work_date date default null,
  p_calculation_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workday_id uuid;
  v_start_time text := trim(coalesce(p_calculation_data ->> 'startTime', ''));
  v_safe_data jsonb;
begin
  if v_user_id is null then
    raise exception 'Maak eerst een account aan of log in.';
  end if;
  if p_work_date is null or v_start_time = '' then
    raise exception 'Vul eerst een datum en starttijd in.';
  end if;

  v_safe_data := jsonb_build_object(
    'schemaVersion', coalesce(p_calculation_data -> 'schemaVersion', '1'::jsonb),
    'workdayName', left(trim(coalesce(p_calculation_data ->> 'workdayName', p_name, '')), 100),
    'clientName', left(trim(coalesce(p_calculation_data ->> 'clientName', '')), 120),
    'date', p_work_date::text,
    'startTime', v_start_time,
    'endTime', trim(coalesce(p_calculation_data ->> 'endTime', '')),
    'privateParticipants', coalesce(p_calculation_data -> 'privateParticipants', '[]'::jsonb)
  );

  if p_workday_id is not null then
    update public.workdays
    set
      name = nullif(left(trim(coalesce(p_name, '')), 100), ''),
      work_date = p_work_date,
      calculation_data = v_safe_data,
      sharing_only = true
    where id = p_workday_id
      and user_id = v_user_id
      and sharing_only = true
    returning id into v_workday_id;
  end if;

  if v_workday_id is null then
    insert into public.workdays (
      user_id,
      name,
      work_date,
      calculation_data,
      sharing_only
    ) values (
      v_user_id,
      nullif(left(trim(coalesce(p_name, '')), 100), ''),
      p_work_date,
      v_safe_data,
      true
    )
    returning id into v_workday_id;
  end if;

  return v_workday_id;
end;
$$;

create or replace function public.create_workday_share_invite(
  p_source_type text,
  p_source_id uuid,
  p_message text default '',
  p_share_mode text default 'direct'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  invite_token uuid;
begin
  if v_user_id is null then
    raise exception 'Maak eerst een account aan of log in.';
  end if;
  if p_source_type not in ('workday', 'project_day') then
    raise exception 'Ongeldig type werkdag.';
  end if;
  if p_share_mode not in ('direct', 'on_completion') then
    raise exception 'Ongeldig deelmoment.';
  end if;
  if p_source_type = 'project_day' and not public.current_user_is_pro() then
    raise exception 'Overuurtje Pro is vereist voor het delen van projecten.';
  end if;
  if p_source_type = 'workday' and not exists (
    select 1
    from public.workdays
    where id = p_source_id and user_id = v_user_id
  ) then
    raise exception 'Werkdag niet gevonden.';
  end if;
  if p_source_type = 'project_day' and not exists (
    select 1
    from public.project_days
    where id = p_source_id and user_id = v_user_id
  ) then
    raise exception 'Projectdag niet gevonden.';
  end if;

  insert into public.workday_share_invites (
    workday_id,
    project_day_id,
    owner_id,
    optional_message,
    share_mode
  ) values (
    case when p_source_type = 'workday' then p_source_id end,
    case when p_source_type = 'project_day' then p_source_id end,
    v_user_id,
    nullif(trim(p_message), ''),
    p_share_mode
  )
  returning token into invite_token;

  return invite_token;
end;
$$;

create or replace function public.get_sent_workday_shares(
  p_source_type text,
  p_source_id uuid
)
returns table (
  id uuid,
  recipient_id uuid,
  recipient_name text,
  recipient_email text,
  optional_message text,
  share_mode text,
  delivered_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.recipient_id,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega'),
    '',
    coalesce(s.optional_message, ''),
    s.share_mode,
    s.delivered_at,
    s.accepted_at
  from public.workday_shares s
  join public.profiles p on p.id = s.recipient_id
  where s.owner_id = (select auth.uid())
    and (
      (p_source_type = 'workday' and s.workday_id = p_source_id)
      or (
        p_source_type = 'project_day'
        and public.current_user_is_pro()
        and s.project_day_id = p_source_id
      )
    )
  order by coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega');
$$;

create or replace function public.remove_workday_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workday_shares s
  where s.id = p_share_id
    and s.owner_id = (select auth.uid())
    and (
      s.workday_id is not null
      or (s.project_day_id is not null and public.current_user_is_pro())
    );

  if not found then
    raise exception 'Gedeelde werkdag niet gevonden.';
  end if;
end;
$$;

revoke all on function public.prepare_shared_workday_source(uuid, text, date, jsonb) from public;
revoke all on function public.create_workday_share_invite(text, uuid, text, text) from public;
revoke all on function public.get_sent_workday_shares(text, uuid) from public;
revoke all on function public.remove_workday_share(uuid) from public;

grant execute on function public.prepare_shared_workday_source(uuid, text, date, jsonb) to authenticated;
grant execute on function public.create_workday_share_invite(text, uuid, text, text) to authenticated;
grant execute on function public.get_sent_workday_shares(text, uuid) to authenticated;
grant execute on function public.remove_workday_share(uuid) to authenticated;

