-- Crew Cards and badges. All badge checks are server-side so a browser cannot award itself badges.

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  icon text not null,
  hidden boolean not null default false,
  active boolean not null default true,
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_events_user_event_idx
  on public.user_activity_events(user_id, event_key, created_at desc);

alter table public.profiles
  add column if not exists selected_badge_id uuid references public.badges(id) on delete set null;

insert into public.badges (key, name, description, icon, hidden, sort_order) values
  ('eerste_draaidag', 'Eerste Draaidag', 'Je eerste werkdag is geregistreerd.', '🎬', false, 1),
  ('productieveteraan', 'Productieveteraan', '100 werkdagen geregistreerd.', '🎥', false, 2),
  ('nachtraaf', 'Nachtraaf', 'Je eerste werkdag eindigde na middernacht.', '🌙', false, 3),
  ('drukke_maand', 'Drukke Maand', '20 werkdagen in één kalendermaand.', '🔥', false, 4),
  ('road_warrior', 'Road Warrior', '10.000 zakelijke kilometers geregistreerd.', '🚗', false, 5),
  ('first_call', 'First Call', 'Je eerste call was vóór 06:00.', '⏰', false, 6),
  ('teamspeler', 'Teamspeler', 'Je eerste gedeelde werkdag is geaccepteerd.', '🤝', false, 7),
  ('crew_builder', 'Crew Builder', 'Een uitgenodigde collega deed mee.', '📤', false, 8),
  ('eerste_productie', 'Eerste Productie', 'Je eerste project is afgerond.', '📂', false, 9),
  ('buitenlandklus', 'Buitenlandklus', 'Je eerste reisdag buiten Europa.', '🌍', false, 10),
  ('setlegende', 'Setlegende', '500 werkdagen geregistreerd.', '🏆', true, 11),
  ('sunrise_crew', 'Sunrise Crew', 'Je begon vóór 05:00.', '🌅', true, 12),
  ('vroege_vogel', 'Vroege Vogel', '25 werkdagen begonnen vóór 07:00.', '☕', true, 13),
  ('nachtuil', 'Nachtuil', '25 werkdagen eindigden na middernacht.', '🦉', true, 14),
  ('frequent_flyer', 'Frequent Flyer', '10 reisdagen buiten Europa.', '✈️', true, 15),
  ('thats_a_wrap', 'That''s a Wrap', '100 werkdagen volledig afgerond.', '🎬', true, 16),
  ('volle_week', 'Volle Week', '5 werkdagen in één maandag-zondagweek.', '🗓️', true, 17),
  ('iedereen_kent_iedereen', 'Iedereen Kent Iedereen', 'Met 10 verschillende collega''s samengewerkt.', '👥', true, 18),
  ('vaste_crew', 'Vaste Crew', '25 gedeelde werkdagen met dezelfde collega.', '🫂', true, 19),
  ('long_runner', 'Long Runner', 'Een project met minimaal 10 werkdagen afgerond.', '🎞️', true, 20),
  ('paperwork_hero', 'Paperwork Hero', 'Je eerste uitgebreide PDF is gemaakt.', '📄', true, 21),
  ('back_to_back', 'Back to Back', 'Minder dan 8 uur tussen twee werkdagen.', '🏃', true, 22),
  ('kerstcrew', 'Kerstcrew', 'Gewerkt op eerste of tweede kerstdag.', '🎄', true, 23),
  ('new_years_crew', 'New Year''s Crew', 'Gewerkt over de jaarwisseling.', '🎆', true, 24),
  ('langste_dag', 'Langste Dag', 'Gewerkt op 21 juni.', '☀️', true, 25),
  ('kortste_dag', 'Kortste Dag', 'Gewerkt op 21 december.', '🌑', true, 26),
  ('jubileum', 'Jubileum', 'Je account bestaat één jaar.', '🎂', true, 27),
  ('launch_crew', 'Launch Crew', 'Je was erbij in het eerste jaar.', '🚀', true, 28),
  ('reken_check_klaar', 'Reken, check, klaar.', '100 berekeningen gemaakt.', '🧮', true, 29),
  ('geen_negen_tot_vijf', 'Geen 9-tot-5', 'Begonnen vóór 09:00 en geëindigd na 17:00.', '🧳', true, 30)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, icon = excluded.icon,
  hidden = excluded.hidden, sort_order = excluded.sort_order;

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_activity_events enable row level security;

drop policy if exists "badges visible when earned or public" on public.badges;
create policy "badges visible when earned or public" on public.badges for select to authenticated
  using (not hidden or exists (
    select 1 from public.user_badges ub where ub.badge_id = badges.id and ub.user_id = auth.uid()
  ));
drop policy if exists "users read own badges" on public.user_badges;
create policy "users read own badges" on public.user_badges for select to authenticated using (user_id = auth.uid());
drop policy if exists "users read own badge activity" on public.user_activity_events;
create policy "users read own badge activity" on public.user_activity_events for select to authenticated using (user_id = auth.uid());

create or replace function public.crew_records(p_user_id uuid)
returns table(record_id uuid, work_date date, calculation_data jsonb)
language sql stable security definer set search_path = public
as $$
  select w.id, w.work_date, w.calculation_data from public.workdays w where w.user_id = p_user_id
  union all
  select pd.id, pd.work_date, pd.calculation_data from public.project_days pd where pd.user_id = p_user_id;
$$;

create or replace function public.evaluate_my_badges()
returns table(key text, name text, description text, icon text, earned_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_saved bigint := 0; v_completed bigint := 0; v_km numeric := 0;
  v_early6 bigint := 0; v_early7 bigint := 0; v_early5 bigint := 0; v_after_midnight bigint := 0;
  v_outside_travel bigint := 0; v_max_month bigint := 0; v_max_week bigint := 0;
  v_crewmates bigint := 0; v_pair_max bigint := 0; v_calculations bigint := 0; v_pdfs bigint := 0;
  v_project_done boolean := false; v_long_project boolean := false; v_back_to_back boolean := false;
  v_keys text[] := '{}';
begin
  if v_user is null then return; end if;

  select count(*),
    count(*) filter (where coalesce(calculation_data ->> 'endTime', '') <> ''),
    coalesce(sum(nullif(calculation_data -> 'extras' ->> 'kilometers', '')::numeric), 0),
    count(*) filter (where coalesce(calculation_data ->> 'startTime', '') <> '' and calculation_data ->> 'startTime' < '06:00'),
    count(*) filter (where coalesce(calculation_data ->> 'startTime', '') <> '' and calculation_data ->> 'startTime' < '07:00'),
    count(*) filter (where coalesce(calculation_data ->> 'startTime', '') <> '' and calculation_data ->> 'startTime' < '05:00'),
    count(*) filter (where coalesce(calculation_data ->> 'endTime', '') <> '' and calculation_data ->> 'endTime' < coalesce(calculation_data ->> 'startTime', '00:00')),
    count(*) filter (where coalesce(calculation_data -> 'extras' ->> 'enableTravelDay', 'false') = 'true' and coalesce(calculation_data -> 'extras' ->> 'travelRegion', '') = 'outside_europe')
  into v_saved, v_completed, v_km, v_early6, v_early7, v_early5, v_after_midnight, v_outside_travel
  from public.crew_records(v_user);

  select coalesce(max(total), 0) into v_max_month from (
    select count(*) total from public.crew_records(v_user) group by date_trunc('month', work_date)
  ) months;
  select coalesce(max(total), 0) into v_max_week from (
    select count(*) total from public.crew_records(v_user) group by date_trunc('week', work_date)
  ) weeks;
  select count(distinct case when owner_id = v_user then recipient_id else owner_id end), coalesce(max(total), 0)
  into v_crewmates, v_pair_max
  from public.workday_shares s
  left join lateral (
    select count(*) total from public.workday_shares sx
    where sx.accepted_at is not null and (sx.owner_id = v_user or sx.recipient_id = v_user)
      and (case when sx.owner_id = v_user then sx.recipient_id else sx.owner_id end) =
          (case when s.owner_id = v_user then s.recipient_id else s.owner_id end)
  ) pairs on true
  where s.accepted_at is not null and (s.owner_id = v_user or s.recipient_id = v_user);
  select count(*) filter (where event_key = 'calculator_calculated'), count(*) filter (where event_key = 'project_pdf_generated')
    into v_calculations, v_pdfs from public.user_activity_events where user_id = v_user;

  select exists (
    select 1 from public.projects p
    where p.user_id = v_user
      and exists (select 1 from public.project_days d where d.project_id = p.id)
      and not exists (select 1 from public.project_days d where d.project_id = p.id and coalesce(d.calculation_data ->> 'endTime', '') = '')
  ), exists (
    select 1 from public.projects p
    where p.user_id = v_user and (select count(*) from public.project_days d where d.project_id = p.id) >= 10
      and not exists (select 1 from public.project_days d where d.project_id = p.id and coalesce(d.calculation_data ->> 'endTime', '') = '')
  ) into v_project_done, v_long_project;

  select exists (
    with timeline as (
      select work_date + (calculation_data ->> 'startTime')::time as start_at,
        work_date + (calculation_data ->> 'endTime')::time + case when calculation_data ->> 'endTime' < calculation_data ->> 'startTime' then interval '1 day' else interval '0 day' end as end_at
      from public.crew_records(v_user)
      where coalesce(calculation_data ->> 'startTime', '') ~ '^[0-9]{2}:[0-9]{2}$'
        and coalesce(calculation_data ->> 'endTime', '') ~ '^[0-9]{2}:[0-9]{2}$'
    ), ordered as (select *, lag(end_at) over (order by start_at) as previous_end from timeline)
    select 1 from ordered where previous_end is not null and start_at >= previous_end and start_at - previous_end < interval '8 hours'
  ) into v_back_to_back;

  if v_saved >= 1 then v_keys := array_append(v_keys, 'eerste_draaidag'); end if;
  if v_saved >= 100 then v_keys := array_append(v_keys, 'productieveteraan'); end if;
  if v_after_midnight >= 1 then v_keys := array_append(v_keys, 'nachtraaf'); end if;
  if v_max_month >= 20 then v_keys := array_append(v_keys, 'drukke_maand'); end if;
  if v_km >= 10000 then v_keys := array_append(v_keys, 'road_warrior'); end if;
  if v_early6 >= 1 then v_keys := array_append(v_keys, 'first_call'); end if;
  if exists (select 1 from public.workday_shares where recipient_id = v_user and accepted_at is not null) then v_keys := array_append(v_keys, 'teamspeler'); end if;
  if exists (select 1 from public.workday_shares where owner_id = v_user and accepted_at is not null) then v_keys := array_append(v_keys, 'crew_builder'); end if;
  if v_project_done then v_keys := array_append(v_keys, 'eerste_productie'); end if;
  if v_outside_travel >= 1 then v_keys := array_append(v_keys, 'buitenlandklus'); end if;
  if v_saved >= 500 then v_keys := array_append(v_keys, 'setlegende'); end if;
  if v_early5 >= 1 then v_keys := array_append(v_keys, 'sunrise_crew'); end if;
  if v_early7 >= 25 then v_keys := array_append(v_keys, 'vroege_vogel'); end if;
  if v_after_midnight >= 25 then v_keys := array_append(v_keys, 'nachtuil'); end if;
  if v_outside_travel >= 10 then v_keys := array_append(v_keys, 'frequent_flyer'); end if;
  if v_completed >= 100 then v_keys := array_append(v_keys, 'thats_a_wrap'); end if;
  if v_max_week >= 5 then v_keys := array_append(v_keys, 'volle_week'); end if;
  if v_crewmates >= 10 then v_keys := array_append(v_keys, 'iedereen_kent_iedereen'); end if;
  if v_pair_max >= 25 then v_keys := array_append(v_keys, 'vaste_crew'); end if;
  if v_long_project then v_keys := array_append(v_keys, 'long_runner'); end if;
  if v_pdfs >= 1 then v_keys := array_append(v_keys, 'paperwork_hero'); end if;
  if v_back_to_back then v_keys := array_append(v_keys, 'back_to_back'); end if;
  if exists (select 1 from public.crew_records(v_user) where extract(month from work_date) = 12 and extract(day from work_date) in (25, 26)) then v_keys := array_append(v_keys, 'kerstcrew'); end if;
  if exists (select 1 from public.crew_records(v_user) where extract(month from work_date) = 12 and extract(day from work_date) = 31 and coalesce(calculation_data ->> 'endTime', '') < coalesce(calculation_data ->> 'startTime', '00:00')) then v_keys := array_append(v_keys, 'new_years_crew'); end if;
  if exists (select 1 from public.crew_records(v_user) where extract(month from work_date) = 6 and extract(day from work_date) = 21) then v_keys := array_append(v_keys, 'langste_dag'); end if;
  if exists (select 1 from public.crew_records(v_user) where extract(month from work_date) = 12 and extract(day from work_date) = 21) then v_keys := array_append(v_keys, 'kortste_dag'); end if;
  if exists (select 1 from public.profiles where id = v_user and created_at <= now() - interval '1 year') then v_keys := array_append(v_keys, 'jubileum'); end if;
  if exists (select 1 from public.profiles where id = v_user and created_at < date '2027-07-01') then v_keys := array_append(v_keys, 'launch_crew'); end if;
  if v_calculations >= 100 then v_keys := array_append(v_keys, 'reken_check_klaar'); end if;
  if exists (select 1 from public.crew_records(v_user) where coalesce(calculation_data ->> 'startTime', '') < '09:00' and coalesce(calculation_data ->> 'endTime', '') >= '17:00') then v_keys := array_append(v_keys, 'geen_negen_tot_vijf'); end if;

  return query
  with inserted as (
    insert into public.user_badges(user_id, badge_id)
    select v_user, b.id from public.badges b where b.active and b.key = any(v_keys)
    on conflict do nothing returning badge_id, earned_at
  ) select b.key, b.name, b.description, b.icon, inserted.earned_at from inserted join public.badges b on b.id = inserted.badge_id;
end;
$$;

create or replace function public.record_badge_activity(p_event_key text, p_source_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns table(key text, name text, description text, icon text, earned_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_activity_events(user_id, event_key, source_id, metadata)
  values (auth.uid(), left(coalesce(p_event_key, ''), 80), p_source_id, coalesce(p_metadata, '{}'::jsonb));
  return query select * from public.evaluate_my_badges();
end;
$$;

create or replace function public.get_my_crew_card()
returns jsonb language sql stable security definer set search_path = public
as $$
  with me as (select auth.uid() as user_id),
  counts as (
    select (select count(*) from public.crew_records(me.user_id)) as workdays,
      (select count(*) from public.user_badges ub where ub.user_id = me.user_id) as badges,
      (select count(distinct case when s.owner_id = me.user_id then s.recipient_id else s.owner_id end) from public.workday_shares s where s.accepted_at is not null and (s.owner_id = me.user_id or s.recipient_id = me.user_id)) as crew from me
  ), selected as (
    select b.key, b.name, b.icon from public.profiles p left join public.badges b on b.id = p.selected_badge_id where p.id = (select user_id from me)
  ), recent as (
    select jsonb_agg(jsonb_build_object('key', b.key, 'name', b.name, 'description', b.description, 'icon', b.icon, 'earnedAt', ub.earned_at) order by ub.earned_at desc) as items
    from (select * from public.user_badges where user_id = (select user_id from me) order by earned_at desc limit 4) ub join public.badges b on b.id = ub.badge_id
  )
  select jsonb_build_object('displayName', coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Crewlid'), 'registeredWorkdays', counts.workdays, 'badgeCount', counts.badges, 'crewCount', counts.crew, 'memberSince', extract(year from p.created_at)::integer, 'selectedBadge', (select jsonb_build_object('key', key, 'name', name, 'icon', icon) from selected where key is not null), 'recentBadges', coalesce(recent.items, '[]'::jsonb))
  from public.profiles p cross join counts cross join recent where p.id = (select user_id from me);
$$;

create or replace function public.list_my_badges()
returns table(key text, name text, description text, icon text, hidden boolean, earned_at timestamptz, is_selected boolean)
language sql stable security definer set search_path = public
as $$
  select b.key, b.name, b.description, b.icon, b.hidden, ub.earned_at, p.selected_badge_id = b.id
  from public.badges b left join public.user_badges ub on ub.badge_id = b.id and ub.user_id = auth.uid()
  join public.profiles p on p.id = auth.uid()
  where b.active and (not b.hidden or ub.user_id is not null)
  order by b.sort_order;
$$;

create or replace function public.select_my_crew_badge(p_badge_key text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_badge_id uuid;
begin
  select b.id into v_badge_id from public.badges b join public.user_badges ub on ub.badge_id = b.id where b.key = p_badge_key and ub.user_id = auth.uid();
  if v_badge_id is null then raise exception 'Deze badge is nog niet behaald.'; end if;
  update public.profiles set selected_badge_id = v_badge_id where id = auth.uid();
end;
$$;

drop function if exists public.get_workday_share_participants(text, uuid);
create function public.get_workday_share_participants(p_source_type text, p_source_id uuid)
returns table(user_id uuid, first_name text, is_owner boolean, is_current_user boolean, has_account boolean, selected_badge_icon text, selected_badge_name text, joint_workdays bigint)
language sql stable security definer set search_path = public
as $$
  with source_owner as (
    select user_id as owner_id from public.workdays where p_source_type = 'workday' and id = p_source_id
    union all select user_id from public.project_days where p_source_type = 'project_day' and id = p_source_id
  ), authorized as (
    select owner_id from source_owner so where so.owner_id = auth.uid() or exists (
      select 1 from public.workday_shares s where s.recipient_id = auth.uid() and ((p_source_type = 'workday' and s.workday_id = p_source_id) or (p_source_type = 'project_day' and s.project_day_id = p_source_id))
    )
  ), participant_ids as (
    select owner_id as participant_id, true as owner from authorized
    union select s.recipient_id, false from public.workday_shares s join authorized a on a.owner_id = s.owner_id where ((p_source_type = 'workday' and s.workday_id = p_source_id) or (p_source_type = 'project_day' and s.project_day_id = p_source_id)) and s.accepted_at is not null
  )
  select pi.participant_id, coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Collega'), pi.owner, pi.participant_id = auth.uid(), true,
    b.icon, b.name,
    (select count(distinct coalesce(s.workday_id, s.project_day_id)) from public.workday_shares s where s.accepted_at is not null and ((s.owner_id = pi.participant_id and s.recipient_id = auth.uid()) or (s.owner_id = auth.uid() and s.recipient_id = pi.participant_id)))
  from participant_ids pi join public.profiles p on p.id = pi.participant_id left join public.badges b on b.id = p.selected_badge_id
  order by pi.owner desc, 2;
$$;

revoke all on function public.crew_records(uuid) from public;
revoke all on function public.evaluate_my_badges() from public;
revoke all on function public.record_badge_activity(text, uuid, jsonb) from public;
revoke all on function public.get_my_crew_card() from public;
revoke all on function public.list_my_badges() from public;
revoke all on function public.select_my_crew_badge(text) from public;
revoke all on function public.get_workday_share_participants(text, uuid) from public;
grant execute on function public.evaluate_my_badges() to authenticated;
grant execute on function public.record_badge_activity(text, uuid, jsonb) to authenticated;
grant execute on function public.get_my_crew_card() to authenticated;
grant execute on function public.list_my_badges() to authenticated;
grant execute on function public.select_my_crew_badge(text) to authenticated;
grant execute on function public.get_workday_share_participants(text, uuid) to authenticated;
