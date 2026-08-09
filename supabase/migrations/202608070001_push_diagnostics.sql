-- Authenticated users can enqueue one real Web Push test for their own account.
create or replace function public.create_push_test_notification()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Je moet ingelogd zijn.';
  end if;

  insert into public.notifications (recipient_id, actor_id, notification_type)
  values (auth.uid(), auth.uid(), 'push_test')
  returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function public.create_push_test_notification() from public;
grant execute on function public.create_push_test_notification() to authenticated;
