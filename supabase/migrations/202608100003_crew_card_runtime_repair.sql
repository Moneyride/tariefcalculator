-- Repair Crew Card counters from their canonical records.
-- Safe to run after the Crew Card migrations. Existing badges and selections
-- remain untouched.

create or replace function public.crew_card_json(p_user_id uuid, p_joint_user_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select
      (
        select count(*)
        from (
          select w.id
          from public.workdays w
          where w.user_id = p_user_id
          union all
          select d.id
          from public.project_days d
          where d.user_id = p_user_id
        ) records
      ) as workdays,
      (select count(*) from public.user_badges ub where ub.user_id = p_user_id) as badges,
      (
        select count(distinct case when s.owner_id = p_user_id then s.recipient_id else s.owner_id end)
        from public.workday_shares s
        where s.accepted_at is not null
          and (s.owner_id = p_user_id or s.recipient_id = p_user_id)
      ) as crew,
      (
        select count(distinct coalesce(s.workday_id, s.project_day_id))
        from public.workday_shares s
        where p_joint_user_id is not null
          and s.accepted_at is not null
          and (
            (s.owner_id = p_user_id and s.recipient_id = p_joint_user_id)
            or (s.owner_id = p_joint_user_id and s.recipient_id = p_user_id)
          )
      ) as joint
  ), featured as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('key', b.key, 'name', b.name, 'description', b.description, 'icon', b.icon)
        order by fb.position
      ),
      '[]'::jsonb
    ) as items
    from public.user_featured_badges fb
    join public.user_badges ub on ub.user_id = fb.user_id and ub.badge_id = fb.badge_id
    join public.badges b on b.id = fb.badge_id
    where fb.user_id = p_user_id
  ), title_badge as (
    select b.id, b.key, b.name, b.icon
    from public.profiles p
    join public.user_badges ub on ub.user_id = p.id
    join public.badges b on b.id = ub.badge_id
    left join public.user_featured_badges fb on fb.user_id = p.id and fb.badge_id = b.id
    where p.id = p_user_id
      and (b.id = p.selected_badge_id or fb.position = 1)
    order by (b.id = p.selected_badge_id) desc, fb.position nulls last
    limit 1
  )
  select jsonb_build_object(
    'displayName', coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Crewlid'),
    'avatarUrl', coalesce(p.avatar_url, ''),
    'registeredWorkdays', counts.workdays,
    'badgeCount', counts.badges,
    'crewCount', counts.crew,
    'jointWorkdays', counts.joint,
    'memberSince', to_char(p.created_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    'selectedBadge', case when title.id is null then null else jsonb_build_object('key', title.key, 'name', title.name, 'icon', title.icon) end,
    'featuredBadges', featured.items
  )
  from public.profiles p
  cross join counts
  cross join featured
  left join title_badge title on true
  where p.id = p_user_id;
$$;

create or replace function public.get_my_crew_card()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.crew_card_json(auth.uid(), null);
$$;

revoke all on function public.crew_card_json(uuid, uuid) from public;
revoke all on function public.get_my_crew_card() from public;
grant execute on function public.get_my_crew_card() to authenticated;

comment on function public.crew_card_json(uuid, uuid) is
  'Builds a Crew Card directly from saved workdays, project days, badges and accepted shares.';
