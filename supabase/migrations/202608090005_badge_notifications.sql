-- Create exactly one in-app/push notification when a badge is first earned.
-- The existing notifications trigger automatically queues Web Push deliveries.

create unique index if not exists notifications_badge_earned_once_idx
  on public.notifications (recipient_id, notification_type, source_id)
  where notification_type = 'badge_earned';

create or replace function public.notify_badge_earned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    recipient_id,
    actor_id,
    notification_type,
    source_id
  ) values (
    new.user_id,
    new.user_id,
    'badge_earned',
    new.badge_id
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists user_badges_notify_earned on public.user_badges;
create trigger user_badges_notify_earned
after insert on public.user_badges
for each row execute function public.notify_badge_earned();

comment on function public.notify_badge_earned() is
  'Creates one notification when evaluate_my_badges first inserts a user_badges row.';
