-- One normalized source for all badges, including flat project-day data.
-- Existing awards are intentionally never revoked. Missing awards are repaired
-- on the next authenticated evaluation (calculator or Crew Card).
begin;

create or replace function public.badge_day_facts(p_date date, p_data jsonb)
returns table(registered boolean, completed boolean, start_at timestamp, end_at timestamp,
  kilometers numeric, outside_travel boolean, after_midnight boolean)
language sql stable set search_path = public
as $$
  with data as (
    select coalesce(p_data, '{}'::jsonb) as d,
      coalesce(p_data -> 'extras', p_data, '{}'::jsonb) as extras,
      now() at time zone 'Europe/Amsterdam' as local_now
  ), parsed as (
    select *,
      case when d ->> 'startTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then (d ->> 'startTime')::time end as start_time,
      case when d ->> 'endTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then (d ->> 'endTime')::time end as end_time,
      coalesce(extras ->> 'enableTravelDay' = 'true', false) as travel
    from data
  ), times as (
    select *, p_date + start_time as starts,
      p_date + end_time + case when end_time < start_time then interval '1 day' else interval '0 day' end as ends
    from parsed
  )
  select
    coalesce((travel and p_date <= local_now::date) or starts <= local_now, false),
    coalesce((travel and p_date <= local_now::date) or (starts is not null and ends <= local_now), false),
    starts, ends,
    case when extras ->> 'enableKilometers' = 'true'
      and extras ->> 'kilometers' ~ '^[0-9]+([.][0-9]+)?$'
      then (extras ->> 'kilometers')::numeric else 0 end,
    travel and coalesce(extras ->> 'travelRegion' = 'outside_europe', false),
    coalesce(end_time < start_time and end_time > time '00:00' and ends <= local_now, false)
  from times;
$$;

create or replace function public.badge_eligible_keys(p_user uuid)
returns table(key text)
language sql stable security definer set search_path = public
as $$
  with raw_records as (
    select r.*, coalesce(nullif(r.calculation_data ->> 'sharedSourceId', ''), r.record_id::text) as source_key
    from public.crew_records(p_user) r
  ), records as (
    -- A saved personal copy of the same shared day must not count twice.
    select distinct on (source_key) * from raw_records
    order by source_key, (record_id::text = source_key) desc, record_id
  ), facts as (
    select r.*, f.* from records r
    cross join lateral public.badge_day_facts(r.work_date, r.calculation_data) f
    where f.registered
  ), stats as (
    select count(*) as saved,
      count(*) filter (where completed) as completed,
      coalesce(sum(kilometers), 0) as km,
      count(*) filter (where start_at::time < time '06:00') as early6,
      count(*) filter (where start_at::time < time '05:00') as early5,
      count(*) filter (where start_at::time < time '07:00') as early7,
      count(*) filter (where after_midnight) as nights,
      count(*) filter (where outside_travel and completed) as travel
    from facts
  ), months as (
    select count(distinct work_date) as days from facts group by date_trunc('month', work_date)
  ), weeks as (
    select count(distinct work_date) as days from facts group by date_trunc('week', work_date)
  ), memberships as (
    select distinct coalesce(workday_id, project_day_id) as source_id, owner_id as member_id
    from public.workday_shares where accepted_at is not null
    union
    select distinct coalesce(workday_id, project_day_id), recipient_id
    from public.workday_shares where accepted_at is not null and recipient_id is not null
  ), crew as (
    -- Colleagues on the same day also count when neither is the owner.
    select other.member_id, count(distinct other.source_id) as days
    from memberships mine join memberships other using (source_id)
    where mine.member_id = p_user and other.member_id <> p_user
    group by other.member_id
  ), finished_projects as (
    select p.id, count(*) as days
    from public.projects p join public.project_days d on d.project_id = p.id
    cross join lateral public.badge_day_facts(d.work_date, d.calculation_data) f
    where p.user_id = p_user
    group by p.id having bool_and(f.completed)
  ), events as (
    select count(*) filter (where event_key = 'calculator_calculated') as calculations,
      count(*) filter (where event_key in ('pdf_generated', 'project_pdf_generated')) as pdfs
    from public.user_activity_events where user_id = p_user
  ), timeline as (
    select start_at, lag(end_at) over (order by start_at, record_id) as previous_end
    from facts where completed and start_at is not null and end_at is not null
  ), account as (
    select created_at from public.profiles where id = p_user
  )
  select rule.key from stats s cross join events e
  cross join lateral (values
    ('eerste_draaidag', s.saved >= 1),
    ('productieveteraan', s.saved >= 100),
    ('nachtraaf', s.nights >= 1),
    ('drukke_maand', exists(select 1 from months where days >= 20)),
    ('road_warrior', s.km >= 10000),
    ('first_call', s.early6 >= 1),
    ('teamspeler', exists(select 1 from public.workday_shares where recipient_id = p_user and accepted_at is not null)),
    ('crew_builder', exists(select 1 from public.workday_shares where owner_id = p_user and accepted_at is not null)),
    ('eerste_productie', exists(select 1 from finished_projects)),
    ('buitenlandklus', s.travel >= 1),
    ('setlegende', s.saved >= 500),
    ('sunrise_crew', s.early5 >= 1),
    ('vroege_vogel', s.early7 >= 25),
    ('nachtuil', s.nights >= 25),
    ('frequent_flyer', s.travel >= 10),
    ('thats_a_wrap', s.completed >= 100),
    ('volle_week', exists(select 1 from weeks where days >= 5)),
    ('iedereen_kent_iedereen', (select count(*) from crew) >= 10),
    ('vaste_crew', exists(select 1 from crew where days >= 25)),
    ('long_runner', exists(select 1 from finished_projects where days >= 10)),
    ('paperwork_hero', e.pdfs >= 1),
    ('back_to_back', exists(select 1 from timeline where start_at >= previous_end and start_at - previous_end < interval '8 hours')),
    ('kerstcrew', exists(select 1 from facts where extract(month from work_date) = 12 and extract(day from work_date) in (25,26))),
    ('new_years_crew', exists(select 1 from facts where completed and extract(month from start_at) = 12 and extract(day from start_at) = 31 and end_at > date_trunc('year', start_at) + interval '1 year')),
    ('langste_dag', exists(select 1 from facts where extract(month from work_date) = 6 and extract(day from work_date) = 21)),
    ('kortste_dag', exists(select 1 from facts where extract(month from work_date) = 12 and extract(day from work_date) = 21)),
    ('jubileum', exists(select 1 from account where created_at <= now() - interval '1 year')),
    ('launch_crew', exists(select 1 from account where created_at >= timestamptz '2026-07-01 00:00:00 Europe/Amsterdam' and created_at < timestamptz '2027-07-01 00:00:00 Europe/Amsterdam')),
    ('reken_check_klaar', e.calculations >= 100),
    ('geen_negen_tot_vijf', exists(select 1 from facts where completed and start_at::time < time '09:00' and end_at > work_date + time '17:00'))
  ) as rule(key, earned) where rule.earned;
$$;

create or replace function public.evaluate_my_badges()
returns table(key text, name text, description text, icon text, earned_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  return query
  with inserted as (
    insert into public.user_badges(user_id, badge_id)
    select auth.uid(), b.id from public.badges b
    join public.badge_eligible_keys(auth.uid()) eligible on eligible.key = b.key
    where b.active on conflict do nothing returning badge_id, user_badges.earned_at
  ) select b.key, b.name, b.description, b.icon, i.earned_at
    from inserted i join public.badges b on b.id = i.badge_id;
end;
$$;

create or replace function public.evaluate_badges_after_work_record_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- Preserve the independent first-day fallback without awarding planned days.
  insert into public.user_badges(user_id, badge_id)
  select new.user_id, b.id from public.badges b
  cross join lateral public.badge_day_facts(new.work_date, new.calculation_data) f
  where b.key = 'eerste_draaidag' and b.active and f.registered
  on conflict do nothing;
  if auth.uid() = new.user_id then
    begin
      perform * from public.evaluate_my_badges();
    exception when others then
      raise warning 'Badge evaluation failed for user %: %', new.user_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

-- Serialization caps accidental repeated event requests without affecting saves.
create or replace function public.record_badge_activity(p_event_key text, p_source_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns table(key text, name text, description text, icon text, earned_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_event_key not in ('calculator_calculated', 'pdf_generated', 'project_pdf_generated', 'workday_saved', 'project_day_saved') then
    raise exception 'Onbekende badge-activiteit.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  -- Save events are already represented by workday/project rows and triggers.
  if p_event_key in ('calculator_calculated', 'pdf_generated', 'project_pdf_generated')
    and not exists(select 1 from public.user_activity_events where user_id = auth.uid()
      and event_key = p_event_key and created_at > now() - interval '5 seconds') then
    insert into public.user_activity_events(user_id, event_key, source_id)
    values(auth.uid(), p_event_key, p_source_id);
  end if;
  return query select * from public.evaluate_my_badges();
end;
$$;

update public.badges set description = 'Alle dagen van je eerste project zijn afgelopen en hebben een eindtijd, of zijn reisdagen.' where key = 'eerste_productie';
update public.badges set description = 'Een project met minimaal 10 dagen: alle dagen zijn afgelopen en hebben een eindtijd, of zijn reisdagen.' where key = 'long_runner';
update public.badges set description = 'Je eerste werkdag- of project-PDF is gemaakt.' where key = 'paperwork_hero';
update public.badges set description = 'Account aangemaakt van 1 juli 2026 tot 1 juli 2027.' where key = 'launch_crew';

revoke all on function public.badge_day_facts(date,jsonb) from public, anon, authenticated;
revoke all on function public.badge_eligible_keys(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_my_badges() from public, anon;
revoke all on function public.record_badge_activity(text,uuid,jsonb) from public, anon;
revoke all on function public.evaluate_badges_after_work_record_change() from public, anon, authenticated;
grant execute on function public.evaluate_my_badges() to authenticated;
grant execute on function public.record_badge_activity(text,uuid,jsonb) to authenticated;
commit;
