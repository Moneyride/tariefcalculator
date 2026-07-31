-- Allow recipients to remove a shared workday from their own overview.
-- Deleting the share also removes the recipient from the owner's participant list.

create or replace function public.remove_workday_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workday_shares s
  where s.id = p_share_id
    and (
      s.recipient_id = auth.uid()
      or (
        s.owner_id = auth.uid()
        and (
          s.workday_id is not null
          or (s.project_day_id is not null and public.current_user_is_pro())
        )
      )
    );

  if not found then
    raise exception 'Share not found or not removable';
  end if;
end;
$$;

revoke all on function public.remove_workday_share(uuid) from public;
grant execute on function public.remove_workday_share(uuid) to authenticated;
