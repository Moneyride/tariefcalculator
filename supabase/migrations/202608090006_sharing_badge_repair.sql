-- Repair invitations claimed before acceptance became an explicit client step,
-- and make new invite claims immediately visible to both participants.

update public.workday_shares
set accepted_at = coalesce(accepted_at, delivered_at, created_at, now())
where accepted_at is null
  and recipient_id is not null
  and invite_id is not null;

create or replace function public.mark_claimed_workday_share_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_id is not null
     and new.invite_id is not null
     and new.accepted_at is null then
    new.accepted_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists mark_claimed_workday_share_accepted on public.workday_shares;
create trigger mark_claimed_workday_share_accepted
before insert or update of recipient_id, invite_id, delivered_at
on public.workday_shares
for each row execute function public.mark_claimed_workday_share_accepted();

-- Return the same participant list to the owner and every accepted recipient.
-- Keeping this definition in the repair migration also repairs installations
-- where the earlier Crew Card migration was only partially applied.
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
    where s.recipient_id is not null
      and s.accepted_at is not null
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

revoke all on function public.get_workday_share_participants(text, uuid) from public;
grant execute on function public.get_workday_share_participants(text, uuid) to authenticated;

comment on function public.mark_claimed_workday_share_accepted() is
  'Marks a claimed personal invite as accepted so active-workday and participant queries agree.';
