-- Crew Card profile photos and three public featured badges.
-- Keeps profiles.selected_badge_id as the single title/status badge.

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crew-avatars', 'crew-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Crew avatars are publicly readable" on storage.objects;
create policy "Crew avatars are publicly readable"
on storage.objects for select to public
using (bucket_id = 'crew-avatars');

drop policy if exists "Users manage their own crew avatar" on storage.objects;
create policy "Users manage their own crew avatar"
on storage.objects for all to authenticated
using (bucket_id = 'crew-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'crew-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.user_featured_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (user_id, badge_id),
  unique (user_id, position)
);

insert into public.user_featured_badges (user_id, badge_id, position)
select p.id, p.selected_badge_id, 1
from public.profiles p
join public.user_badges ub on ub.user_id = p.id and ub.badge_id = p.selected_badge_id
where p.selected_badge_id is not null
on conflict do nothing;

alter table public.user_featured_badges enable row level security;
drop policy if exists "Users read their featured badges" on public.user_featured_badges;
create policy "Users read their featured badges"
on public.user_featured_badges for select to authenticated
using (user_id = auth.uid());

revoke all on table public.user_featured_badges from public;
grant select on table public.user_featured_badges to authenticated;

drop function if exists public.list_my_badges();
create function public.list_my_badges()
returns table(
  key text,
  name text,
  description text,
  icon text,
  hidden boolean,
  earned_at timestamptz,
  is_featured boolean,
  featured_position smallint,
  is_title boolean
)
language sql stable security definer set search_path = public
as $$
  select b.key, b.name, b.description, b.icon, b.hidden, ub.earned_at,
    fb.badge_id is not null, fb.position, p.selected_badge_id = b.id
  from public.badges b
  left join public.user_badges ub on ub.badge_id = b.id and ub.user_id = auth.uid()
  left join public.user_featured_badges fb on fb.badge_id = b.id and fb.user_id = auth.uid()
  join public.profiles p on p.id = auth.uid()
  where b.active and (not b.hidden or ub.user_id is not null)
  order by b.sort_order;
$$;

create or replace function public.set_my_crew_badges(p_badge_keys text[], p_title_badge_key text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_keys text[] := array(
    select distinct item.key
    from unnest(coalesce(p_badge_keys, array[]::text[])) as item(key)
    where nullif(trim(item.key), '') is not null
    limit 4
  );
  v_title_key text;
  v_title_id uuid;
  v_valid_count integer;
begin
  if auth.uid() is null then raise exception 'Log eerst in.'; end if;
  if coalesce(array_length(v_keys, 1), 0) > 3 then raise exception 'Kies maximaal drie badges.'; end if;

  select count(*) into v_valid_count
  from public.badges b join public.user_badges ub on ub.badge_id = b.id
  where ub.user_id = auth.uid() and b.key = any(v_keys);
  if v_valid_count <> coalesce(array_length(v_keys, 1), 0) then
    raise exception 'Je kunt alleen behaalde badges kiezen.';
  end if;

  v_title_key := coalesce(nullif(trim(p_title_badge_key), ''), v_keys[1]);
  if v_title_key is not null and not (v_title_key = any(v_keys)) then
    raise exception 'De titelbadge moet op je Crew Card staan.';
  end if;

  delete from public.user_featured_badges where user_id = auth.uid();
  insert into public.user_featured_badges(user_id, badge_id, position)
  select auth.uid(), b.id, picked.ordinality::smallint
  from unnest(v_keys) with ordinality picked(key, ordinality)
  join public.badges b on b.key = picked.key;

  select b.id into v_title_id from public.badges b where b.key = v_title_key;
  update public.profiles set selected_badge_id = v_title_id where id = auth.uid();
end;
$$;

create or replace function public.crew_card_json(p_user_id uuid, p_joint_user_id uuid default null)
returns jsonb language sql stable security definer set search_path = public
as $$
  with counts as (
    select
      (select count(*) from public.crew_records(p_user_id)) as workdays,
      (select count(*) from public.user_badges ub where ub.user_id = p_user_id) as badges,
      (select count(distinct case when s.owner_id = p_user_id then s.recipient_id else s.owner_id end)
       from public.workday_shares s where s.accepted_at is not null and (s.owner_id = p_user_id or s.recipient_id = p_user_id)) as crew,
      (select count(distinct coalesce(s.workday_id, s.project_day_id))
       from public.workday_shares s where p_joint_user_id is not null and s.accepted_at is not null
       and ((s.owner_id = p_user_id and s.recipient_id = p_joint_user_id) or (s.owner_id = p_joint_user_id and s.recipient_id = p_user_id))) as joint
  ), featured as (
    select coalesce(jsonb_agg(jsonb_build_object('key', b.key, 'name', b.name, 'description', b.description, 'icon', b.icon) order by fb.position), '[]'::jsonb) items
    from public.user_featured_badges fb join public.badges b on b.id = fb.badge_id where fb.user_id = p_user_id
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
  from public.profiles p cross join counts cross join featured
  left join public.badges title on title.id = p.selected_badge_id
  where p.id = p_user_id;
$$;

create or replace function public.get_my_crew_card()
returns jsonb language sql stable security definer set search_path = public
as $$ select public.crew_card_json(auth.uid(), null); $$;

create or replace function public.get_crew_member_card(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Log eerst in.'; end if;
  if p_user_id <> auth.uid() and not exists (
    select 1 from public.workday_shares s
    where s.accepted_at is not null
      and ((s.owner_id = auth.uid() and s.recipient_id = p_user_id)
        or (s.owner_id = p_user_id and s.recipient_id = auth.uid()))
  ) then raise exception 'Deze Crew Card is niet beschikbaar.'; end if;
  return public.crew_card_json(p_user_id, auth.uid());
end;
$$;

drop function if exists public.get_workday_share_participants(text, uuid);
create function public.get_workday_share_participants(p_source_type text, p_source_id uuid)
returns table(user_id uuid, first_name text, is_owner boolean, is_current_user boolean, has_account boolean, avatar_url text, selected_badge_icon text, selected_badge_name text, joint_workdays bigint)
language sql stable security definer set search_path = public
as $$
  with source_owner as (
    select user_id owner_id from public.workdays where p_source_type = 'workday' and id = p_source_id
    union all select user_id from public.project_days where p_source_type = 'project_day' and id = p_source_id
  ), authorized as (
    select owner_id from source_owner so where so.owner_id = auth.uid() or exists (
      select 1 from public.workday_shares s where s.recipient_id = auth.uid()
      and ((p_source_type = 'workday' and s.workday_id = p_source_id) or (p_source_type = 'project_day' and s.project_day_id = p_source_id))
    )
  ), participant_ids as (
    select owner_id participant_id, true owner from authorized
    union select s.recipient_id, false from public.workday_shares s join authorized a on a.owner_id = s.owner_id
    where ((p_source_type = 'workday' and s.workday_id = p_source_id) or (p_source_type = 'project_day' and s.project_day_id = p_source_id)) and s.accepted_at is not null
  )
  select pi.participant_id, coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega'), pi.owner,
    pi.participant_id = auth.uid(), true, coalesce(p.avatar_url, ''), b.icon, b.name,
    (select count(distinct coalesce(s.workday_id, s.project_day_id)) from public.workday_shares s where s.accepted_at is not null
      and ((s.owner_id = pi.participant_id and s.recipient_id = auth.uid()) or (s.owner_id = auth.uid() and s.recipient_id = pi.participant_id)))
  from participant_ids pi join public.profiles p on p.id = pi.participant_id left join public.badges b on b.id = p.selected_badge_id
  order by pi.owner desc, 2;
$$;

revoke all on function public.crew_card_json(uuid, uuid) from public;
revoke all on function public.set_my_crew_badges(text[], text) from public;
revoke all on function public.get_my_crew_card() from public;
revoke all on function public.get_crew_member_card(uuid) from public;
revoke all on function public.list_my_badges() from public;
revoke all on function public.get_workday_share_participants(text, uuid) from public;
grant execute on function public.set_my_crew_badges(text[], text) to authenticated;
grant execute on function public.get_my_crew_card() to authenticated;
grant execute on function public.get_crew_member_card(uuid) to authenticated;
grant execute on function public.list_my_badges() to authenticated;
grant execute on function public.get_workday_share_participants(text, uuid) to authenticated;
