-- Share manually entered participant names without exposing calculation details.
-- Account participants remain first; names without an account are returned last.

drop function if exists public.get_workday_share_participants(text, uuid);
create function public.get_workday_share_participants(
  p_source_type text,
  p_source_id uuid
)
returns table (
  user_id uuid,
  first_name text,
  is_owner boolean,
  is_current_user boolean,
  has_account boolean
)
language sql stable security definer set search_path = public
as $$
  with source_data as (
    select
      w.user_id as owner_id,
      coalesce(w.calculation_data -> 'privateParticipants', '[]'::jsonb) as private_participants
    from public.workdays w
    where p_source_type = 'workday' and w.id = p_source_id

    union all

    select
      pd.user_id,
      coalesce(pd.calculation_data -> 'privateParticipants', '[]'::jsonb)
    from public.project_days pd
    where p_source_type = 'project_day' and pd.id = p_source_id
  ),
  authorized as (
    select sd.owner_id, sd.private_participants
    from source_data sd
    where sd.owner_id = (select auth.uid())
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
  account_participants as (
    select a.owner_id as participant_id, true as owner
    from authorized a

    union

    select s.recipient_id, false
    from public.workday_shares s
    join authorized a on a.owner_id = s.owner_id
    where (p_source_type = 'workday' and s.workday_id = p_source_id)
       or (p_source_type = 'project_day' and s.project_day_id = p_source_id)
  ),
  visible_participants as (
    select
      ap.participant_id as user_id,
      coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega') as first_name,
      ap.owner as is_owner,
      ap.participant_id = (select auth.uid()) as is_current_user,
      true as has_account
    from account_participants ap
    join public.profiles p on p.id = ap.participant_id

    union all

    select
      null::uuid,
      trim(private_name.value),
      false,
      false,
      false
    from authorized a
    cross join lateral jsonb_array_elements_text(a.private_participants) as private_name(value)
    where nullif(trim(private_name.value), '') is not null
  )
  select
    vp.user_id,
    vp.first_name,
    vp.is_owner,
    vp.is_current_user,
    vp.has_account
  from visible_participants vp
  order by vp.has_account desc, vp.is_owner desc, vp.first_name;
$$;

revoke all on function public.get_workday_share_participants(text, uuid) from public;
grant execute on function public.get_workday_share_participants(text, uuid) to authenticated;

comment on function public.get_workday_share_participants(text, uuid) is
  'Returns account participants plus manually entered names to authorized workday-share members. No financial calculation data is exposed.';
