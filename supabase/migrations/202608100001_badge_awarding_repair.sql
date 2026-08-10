-- Make badge awards reliable even when the browser-side follow-up RPC fails.
-- Existing badge evaluation stays the central source for all thirty rules.

create or replace function public.evaluate_badges_after_work_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The first saved day is important enough to award directly. This also
  -- repairs accounts when a later, more complex badge rule cannot be checked.
  insert into public.user_badges (user_id, badge_id)
  select new.user_id, b.id
  from public.badges b
  where b.key = 'eerste_draaidag' and b.active
  on conflict do nothing;

  -- PostgREST keeps auth.uid() available inside this trigger for user writes.
  -- Never let a badge evaluation error roll back the actual workday save.
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

drop trigger if exists workdays_evaluate_badges on public.workdays;
create trigger workdays_evaluate_badges
after insert or update of work_date, calculation_data
on public.workdays
for each row execute function public.evaluate_badges_after_work_record_change();

drop trigger if exists project_days_evaluate_badges on public.project_days;
create trigger project_days_evaluate_badges
after insert or update of work_date, calculation_data
on public.project_days
for each row execute function public.evaluate_badges_after_work_record_change();

create or replace function public.evaluate_badges_after_share_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.accepted_at is not null
     and (tg_op = 'INSERT' or old.accepted_at is null) then
    -- The recipient accepted a shared day; the owner successfully brought a
    -- colleague into that day. Award both deterministic share badges here.
    insert into public.user_badges (user_id, badge_id)
    select new.recipient_id, b.id
    from public.badges b
    where b.key = 'teamspeler' and b.active and new.recipient_id is not null
    on conflict do nothing;

    insert into public.user_badges (user_id, badge_id)
    select new.owner_id, b.id
    from public.badges b
    where b.key = 'crew_builder' and b.active and new.owner_id is not null
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists workday_shares_evaluate_badges on public.workday_shares;
create trigger workday_shares_evaluate_badges
after insert or update of accepted_at
on public.workday_shares
for each row execute function public.evaluate_badges_after_share_acceptance();

-- Reinstall the notification trigger before backfilling so restored awards
-- appear in the notification inbox exactly once.
drop trigger if exists user_badges_notify_earned on public.user_badges;
create trigger user_badges_notify_earned
after insert on public.user_badges
for each row execute function public.notify_badge_earned();

-- Backfill the guaranteed first-workday badge for existing users. The unique
-- key on user_badges makes this safe to rerun.
insert into public.user_badges (user_id, badge_id)
select records.user_id, badge.id
from (
  select distinct user_id from public.workdays
  union
  select distinct user_id from public.project_days
) records
cross join lateral (
  select id from public.badges
  where key = 'eerste_draaidag' and active
  limit 1
) badge
where records.user_id is not null
on conflict do nothing;

revoke all on function public.evaluate_badges_after_work_record_change() from public;
revoke all on function public.evaluate_badges_after_share_acceptance() from public;

comment on function public.evaluate_badges_after_work_record_change() is
  'Awards data-backed badges in the same database transaction as a saved workday.';
comment on function public.evaluate_badges_after_share_acceptance() is
  'Awards the recipient and owner share badges when an invitation is accepted.';
