-- Keep participant visibility and Crew Cards symmetrical for owners and
-- accepted recipients of a shared workday or project day.

create or replace function public.get_crew_member_card(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Log eerst in.';
  end if;

  if p_user_id <> auth.uid() and not exists (
    select 1
    from public.workday_shares s
    where s.accepted_at is not null
      and (
        (s.owner_id = auth.uid() and s.recipient_id = p_user_id)
        or (s.owner_id = p_user_id and s.recipient_id = auth.uid())
      )
  ) then
    raise exception 'Deze Crew Card is niet beschikbaar.';
  end if;

  return public.crew_card_json(p_user_id, auth.uid());
end;
$$;

drop function if exists public.get_workday_share_participants(text, uuid);
create function public.get_workday_share_participants(
  p_source_type text,
  p_source_id uuid
)
returns table(
  user_id uuid,
  first_name text,
  is_owner boolean,
  is_current_user boolean,
  has_account boolean,
  avatar_url text,
  selected_badge_icon text,
  selected_badge_name text,
  joint_workdays bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with source_owner as (
    select w.user_id as owner_id
    from public.workdays w
    where p_source_type = 'workday' and w.id = p_source_id

    union all

    select pd.user_id
    from public.project_days pd
    where p_source_type = 'project_day' and pd.id = p_source_id
  ), authorized_source as (
    select so.owner_id
    from source_owner so
    where so.owner_id = auth.uid()
       or exists (
         select 1
         from public.workday_shares s
         where s.owner_id = so.owner_id
           and s.recipient_id = auth.uid()
           and s.accepted_at is not null
           and (
             (p_source_type = 'workday' and s.workday_id = p_source_id)
             or (p_source_type = 'project_day' and s.project_day_id = p_source_id)
           )
       )
  ), participant_ids as (
    select a.owner_id as participant_id, true as owner
    from authorized_source a

    union

    select s.recipient_id, false
    from public.workday_shares s
    join authorized_source a on a.owner_id = s.owner_id
    where s.accepted_at is not null
      and (
        (p_source_type = 'workday' and s.workday_id = p_source_id)
        or (p_source_type = 'project_day' and s.project_day_id = p_source_id)
      )
  )
  select
    pi.participant_id,
    coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega'),
    pi.owner,
    pi.participant_id = auth.uid(),
    true,
    coalesce(p.avatar_url, ''),
    b.icon,
    b.name,
    (
      select count(distinct coalesce(s.workday_id, s.project_day_id))
      from public.workday_shares s
      where s.accepted_at is not null
        and (
          (s.owner_id = pi.participant_id and s.recipient_id = auth.uid())
          or (s.owner_id = auth.uid() and s.recipient_id = pi.participant_id)
        )
    )
  from participant_ids pi
  join public.profiles p on p.id = pi.participant_id
  left join public.badges b on b.id = p.selected_badge_id
  order by pi.owner desc, 2;
$$;

revoke all on function public.get_crew_member_card(uuid) from public;
revoke all on function public.get_workday_share_participants(text, uuid) from public;
grant execute on function public.get_crew_member_card(uuid) to authenticated;
grant execute on function public.get_workday_share_participants(text, uuid) to authenticated;

comment on function public.get_workday_share_participants(text, uuid) is
  'Returns the owner and every accepted account participant for an authorized shared workday.';
