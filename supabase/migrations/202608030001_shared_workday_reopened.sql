-- Distinguish a resumed live workday from an ordinary time correction.
-- Run after 202607280003_shared_workday_live_updates.sql.

create or replace function public.sync_shared_workday_times()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  share_row record;
  old_start text := coalesce(old.calculation_data ->> 'startTime', '');
  old_end text := coalesce(old.calculation_data ->> 'endTime', '');
  new_start text := coalesce(new.calculation_data ->> 'startTime', '');
  new_end text := coalesce(new.calculation_data ->> 'endTime', '');
  source_is_workday boolean := tg_table_name = 'workdays';
begin
  if old_start = new_start and old_end = new_end then return new; end if;

  for share_row in
    select s.*
    from public.workday_shares s
    where (source_is_workday and s.workday_id = new.id)
       or (not source_is_workday and s.project_day_id = new.id)
  loop
    if share_row.delivered_at is null
       and share_row.share_mode = 'on_completion'
       and new_end <> '' then
      update public.workday_shares
      set delivered_at = now()
      where id = share_row.id;

      insert into public.notifications (recipient_id, actor_id, notification_type, share_id)
      values (share_row.recipient_id, share_row.owner_id, 'workday_shared', share_row.id);
    elsif share_row.delivered_at is not null then
      insert into public.notifications (recipient_id, actor_id, notification_type, share_id)
      values (
        share_row.recipient_id,
        share_row.owner_id,
        case
          when old_end = '' and new_end <> '' then 'workday_completed'
          when old_end <> '' and new_end = '' then 'workday_resumed'
          else 'workday_times_updated'
        end,
        share_row.id
      );
    end if;
  end loop;
  return new;
end;
$$;

comment on function public.sync_shared_workday_times() is
  'Delivers completion shares and distinguishes completed, resumed, and corrected shared times.';
