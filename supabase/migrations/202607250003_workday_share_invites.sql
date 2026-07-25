-- Link-based invitations replace public user search.
-- Run after 202607250002_workday_sharing.sql.

create table if not exists public.workday_share_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  workday_id uuid references public.workdays(id) on delete cascade,
  project_day_id uuid references public.project_days(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  optional_message text check (optional_message is null or char_length(optional_message) <= 500),
  share_mode text not null default 'direct' check (share_mode in ('direct', 'on_completion')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workday_share_invites_one_source check (
    (workday_id is not null and project_day_id is null)
    or (workday_id is null and project_day_id is not null)
  )
);

alter table public.workday_shares
  add column if not exists invite_id uuid references public.workday_share_invites(id) on delete set null;

create unique index if not exists workday_shares_invite_recipient_idx
  on public.workday_shares(invite_id, recipient_id) where invite_id is not null;

drop trigger if exists workday_share_invites_set_updated_at on public.workday_share_invites;
create trigger workday_share_invites_set_updated_at before update on public.workday_share_invites
for each row execute function public.set_updated_at();

alter table public.workday_share_invites enable row level security;

drop policy if exists "Owners can manage their workday share invites" on public.workday_share_invites;
create policy "Owners can manage their workday share invites"
on public.workday_share_invites for all to authenticated
using ((select auth.uid()) = owner_id and public.current_user_is_pro())
with check ((select auth.uid()) = owner_id and public.current_user_is_pro());

grant select, insert, update, delete on table public.workday_share_invites to authenticated;

create or replace function public.create_workday_share_invite(
  p_source_type text,
  p_source_id uuid,
  p_message text default '',
  p_share_mode text default 'direct'
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  invite_token uuid;
begin
  if (select auth.uid()) is null or not public.current_user_is_pro() then
    raise exception 'Overuurtje Pro is vereist.';
  end if;
  if p_source_type not in ('workday', 'project_day') then
    raise exception 'Ongeldig type werkdag.';
  end if;
  if p_share_mode not in ('direct', 'on_completion') then
    raise exception 'Ongeldig deelmoment.';
  end if;
  if p_source_type = 'workday' and not exists (
    select 1 from public.workdays where id = p_source_id and user_id = (select auth.uid())
  ) then raise exception 'Werkdag niet gevonden.'; end if;
  if p_source_type = 'project_day' and not exists (
    select 1 from public.project_days where id = p_source_id and user_id = (select auth.uid())
  ) then raise exception 'Projectdag niet gevonden.'; end if;

  insert into public.workday_share_invites (
    workday_id, project_day_id, owner_id, optional_message, share_mode
  ) values (
    case when p_source_type = 'workday' then p_source_id end,
    case when p_source_type = 'project_day' then p_source_id end,
    (select auth.uid()), nullif(trim(p_message), ''), p_share_mode
  )
  returning token into invite_token;
  return invite_token;
end;
$$;

create or replace function public.preview_workday_share_invite(p_token text)
returns table (
  token text, owner_name text, source_type text, source_id uuid,
  work_date date, start_time text, end_time text, project_name text,
  optional_message text, share_mode text, available boolean
)
language sql stable security definer set search_path = public
as $$
  select
    i.token::text,
    coalesce(nullif(trim(p.display_name), ''), 'Een collega'),
    case when i.workday_id is not null then 'workday' else 'project_day' end,
    coalesce(i.workday_id, i.project_day_id),
    coalesce(w.work_date, pd.work_date),
    coalesce(w.calculation_data ->> 'startTime', pd.calculation_data ->> 'startTime', ''),
    coalesce(w.calculation_data ->> 'endTime', pd.calculation_data ->> 'endTime', ''),
    coalesce(pr.name, ''),
    coalesce(i.optional_message, ''),
    i.share_mode,
    i.revoked_at is null and (w.id is not null or pd.id is not null)
  from public.workday_share_invites i
  join public.profiles p on p.id = i.owner_id
  left join public.workdays w on w.id = i.workday_id
  left join public.project_days pd on pd.id = i.project_day_id
  left join public.projects pr on pr.id = pd.project_id
  where i.token::text = p_token
  limit 1;
$$;

create or replace function public.claim_workday_share_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  invite_row public.workday_share_invites%rowtype;
  v_share_id uuid;
  source_end_time text;
  should_deliver boolean;
begin
  if (select auth.uid()) is null then raise exception 'Log eerst in.'; end if;
  select * into invite_row
  from public.workday_share_invites
  where token::text = p_token and revoked_at is null;
  if not found then raise exception 'Deze uitnodiging is niet meer beschikbaar.'; end if;
  if invite_row.owner_id = (select auth.uid()) then
    raise exception 'Je kunt je eigen uitnodiging niet accepteren.';
  end if;

  if invite_row.workday_id is not null then
    select calculation_data ->> 'endTime' into source_end_time
    from public.workdays where id = invite_row.workday_id;
  else
    select calculation_data ->> 'endTime' into source_end_time
    from public.project_days where id = invite_row.project_day_id;
  end if;
  should_deliver := invite_row.share_mode = 'direct' or coalesce(source_end_time, '') <> '';

  select id into v_share_id from public.workday_shares
  where recipient_id = (select auth.uid())
    and (
      (invite_row.workday_id is not null and workday_id = invite_row.workday_id)
      or (invite_row.project_day_id is not null and project_day_id = invite_row.project_day_id)
    )
  limit 1;

  if v_share_id is null then
    insert into public.workday_shares (
      workday_id, project_day_id, owner_id, recipient_id, invite_id,
      optional_message, share_mode, delivered_at
    ) values (
      invite_row.workday_id, invite_row.project_day_id, invite_row.owner_id,
      (select auth.uid()), invite_row.id, invite_row.optional_message,
      invite_row.share_mode, case when should_deliver then now() end
    ) returning id into v_share_id;
  else
    update public.workday_shares
    set invite_id = invite_row.id,
        optional_message = invite_row.optional_message,
        share_mode = invite_row.share_mode,
        delivered_at = case when should_deliver then coalesce(delivered_at, now()) end
    where id = v_share_id;
  end if;

  if should_deliver and not exists (
    select 1 from public.notifications
    where share_id = v_share_id
      and recipient_id = (select auth.uid())
      and notification_type = 'workday_shared'
  ) then
    insert into public.notifications (recipient_id, actor_id, notification_type, share_id)
    values ((select auth.uid()), invite_row.owner_id, 'workday_shared', v_share_id);
  end if;
  return v_share_id;
end;
$$;

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
      update public.workday_shares set delivered_at = now() where id = share_row.id;
      insert into public.notifications (recipient_id, actor_id, notification_type, share_id)
      values (share_row.recipient_id, share_row.owner_id, 'workday_shared', share_row.id);
    elsif share_row.delivered_at is not null and share_row.accepted_at is null then
      insert into public.notifications (recipient_id, actor_id, notification_type, share_id)
      values (share_row.recipient_id, share_row.owner_id, 'workday_times_updated', share_row.id);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists workdays_sync_shared_times on public.workdays;
create trigger workdays_sync_shared_times
after update of calculation_data on public.workdays
for each row execute function public.sync_shared_workday_times();

drop trigger if exists project_days_sync_shared_times on public.project_days;
create trigger project_days_sync_shared_times
after update of calculation_data on public.project_days
for each row execute function public.sync_shared_workday_times();

drop function if exists public.search_overuurtje_users(text);
drop function if exists public.share_workday_with_users(text, uuid, uuid[], text, text);

revoke all on function public.create_workday_share_invite(text, uuid, text, text) from public;
revoke all on function public.preview_workday_share_invite(text) from public;
revoke all on function public.claim_workday_share_invite(text) from public;
grant execute on function public.create_workday_share_invite(text, uuid, text, text) to authenticated;
grant execute on function public.preview_workday_share_invite(text) to anon, authenticated;
grant execute on function public.claim_workday_share_invite(text) to authenticated;

comment on table public.workday_share_invites is
  'Opaque invitation links. They reference the source and never duplicate calculator or financial data.';
