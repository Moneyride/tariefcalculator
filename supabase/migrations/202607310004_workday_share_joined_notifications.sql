-- Notify every signed-in workday owner, Free or Pro, when a colleague joins
-- through a sharing link. Run after 202607290004_expand_notification_types.sql.

create unique index if not exists notifications_workday_share_joined_idx
  on public.notifications (recipient_id, notification_type, share_id)
  where notification_type = 'workday_share_joined' and share_id is not null;

create or replace function public.notify_workday_share_joined()
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
    share_id,
    source_type,
    source_id
  ) values (
    new.owner_id,
    new.recipient_id,
    'workday_share_joined',
    new.id,
    case when new.workday_id is not null then 'workday' else 'project_day' end,
    coalesce(new.workday_id, new.project_day_id)
  )
  on conflict (recipient_id, notification_type, share_id)
    where notification_type = 'workday_share_joined' and share_id is not null
    do nothing;

  return new;
end;
$$;

drop trigger if exists workday_share_joined_notification on public.workday_shares;
create trigger workday_share_joined_notification
after insert on public.workday_shares
for each row execute function public.notify_workday_share_joined();

comment on function public.notify_workday_share_joined() is
  'Creates an in-app notification for the owner when an authenticated recipient joins a shared workday.';
