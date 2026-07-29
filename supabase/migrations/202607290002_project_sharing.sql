-- Share complete projects through opaque links without exposing financial data.
-- Run after 202607290001_workday_start_notifications.sql.

create table if not exists public.project_share_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  optional_message text check (optional_message is null or char_length(optional_message) <= 500),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  invite_id uuid references public.project_share_invites(id) on delete set null,
  optional_message text check (optional_message is null or char_length(optional_message) <= 500),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_shares_different_users check (owner_id <> recipient_id),
  constraint project_shares_unique_recipient unique (project_id, recipient_id)
);

create index if not exists project_shares_recipient_idx
  on public.project_shares(recipient_id, created_at desc);

drop trigger if exists project_share_invites_set_updated_at on public.project_share_invites;
create trigger project_share_invites_set_updated_at
before update on public.project_share_invites
for each row execute function public.set_updated_at();

drop trigger if exists project_shares_set_updated_at on public.project_shares;
create trigger project_shares_set_updated_at
before update on public.project_shares
for each row execute function public.set_updated_at();

alter table public.project_share_invites enable row level security;
alter table public.project_shares enable row level security;

drop policy if exists "Owners manage project share invites" on public.project_share_invites;
create policy "Owners manage project share invites"
on public.project_share_invites for all to authenticated
using ((select auth.uid()) = owner_id and public.current_user_is_pro())
with check ((select auth.uid()) = owner_id and public.current_user_is_pro());

drop policy if exists "Owners read project shares" on public.project_shares;
create policy "Owners read project shares"
on public.project_shares for select to authenticated
using ((select auth.uid()) = owner_id and public.current_user_is_pro());

drop policy if exists "Recipients read project shares" on public.project_shares;
create policy "Recipients read project shares"
on public.project_shares for select to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "Owners create project shares" on public.project_shares;
create policy "Owners create project shares"
on public.project_shares for insert to authenticated
with check ((select auth.uid()) = owner_id and public.current_user_is_pro());

drop policy if exists "Owners delete project shares" on public.project_shares;
create policy "Owners delete project shares"
on public.project_shares for delete to authenticated
using ((select auth.uid()) = owner_id and public.current_user_is_pro());

grant select, insert, update, delete on table public.project_share_invites to authenticated;
grant select, insert, update, delete on table public.project_shares to authenticated;

create or replace function public.project_share_days(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pd.id,
        'workDate', pd.work_date,
        'startTime', coalesce(pd.calculation_data ->> 'startTime', ''),
        'endTime', coalesce(pd.calculation_data ->> 'endTime', '')
      )
      order by pd.work_date
    ),
    '[]'::jsonb
  )
  from public.project_days pd
  where pd.project_id = p_project_id;
$$;

create or replace function public.create_project_share_invite(
  p_project_id uuid,
  p_message text default ''
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  invite_token uuid;
begin
  if (select auth.uid()) is null or not public.current_user_is_pro() then
    raise exception 'Overuurtje Pro is vereist.';
  end if;
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = (select auth.uid())
  ) then
    raise exception 'Project niet gevonden.';
  end if;

  insert into public.project_share_invites (
    project_id, owner_id, optional_message
  ) values (
    p_project_id, (select auth.uid()), nullif(trim(p_message), '')
  )
  returning token into invite_token;
  return invite_token;
end;
$$;

create or replace function public.preview_project_share_invite(p_token text)
returns table (
  token text,
  owner_name text,
  project_id uuid,
  project_name text,
  client_name text,
  start_date date,
  end_date date,
  optional_message text,
  days jsonb,
  available boolean
)
language sql stable security definer set search_path = public
as $$
  select
    i.token::text,
    coalesce(nullif(trim(p.display_name), ''), 'Een collega'),
    pr.id,
    pr.name,
    coalesce(pr.client_name, ''),
    pr.start_date,
    pr.end_date,
    coalesce(i.optional_message, ''),
    public.project_share_days(pr.id),
    i.revoked_at is null
  from public.project_share_invites i
  join public.projects pr on pr.id = i.project_id
  join public.profiles p on p.id = i.owner_id
  where i.token::text = p_token
  limit 1;
$$;

create or replace function public.claim_project_share_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  invite_row public.project_share_invites%rowtype;
  share_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Log eerst in.';
  end if;

  select * into invite_row
  from public.project_share_invites
  where token::text = p_token and revoked_at is null;
  if not found then
    raise exception 'Deze uitnodiging is niet meer beschikbaar.';
  end if;
  if invite_row.owner_id = (select auth.uid()) then
    raise exception 'Je kunt je eigen uitnodiging niet accepteren.';
  end if;

  insert into public.project_shares (
    project_id, owner_id, recipient_id, invite_id, optional_message
  ) values (
    invite_row.project_id,
    invite_row.owner_id,
    (select auth.uid()),
    invite_row.id,
    invite_row.optional_message
  )
  on conflict (project_id, recipient_id) do update
  set invite_id = excluded.invite_id,
      optional_message = excluded.optional_message,
      accepted_at = now()
  returning id into share_id;

  return share_id;
end;
$$;

create or replace function public.get_received_project_shares()
returns table (
  id uuid,
  project_id uuid,
  owner_id uuid,
  owner_name text,
  project_name text,
  client_name text,
  start_date date,
  end_date date,
  optional_message text,
  days jsonb,
  accepted_at timestamptz,
  source_updated_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    s.id,
    s.project_id,
    s.owner_id,
    coalesce(nullif(trim(p.display_name), ''), 'Een collega'),
    pr.name,
    coalesce(pr.client_name, ''),
    pr.start_date,
    pr.end_date,
    coalesce(s.optional_message, ''),
    public.project_share_days(pr.id),
    s.accepted_at,
    pr.updated_at
  from public.project_shares s
  join public.projects pr on pr.id = s.project_id
  join public.profiles p on p.id = s.owner_id
  where s.recipient_id = (select auth.uid())
  order by pr.updated_at desc;
$$;

create or replace function public.get_sent_project_shares(p_project_id uuid)
returns table (
  id uuid,
  recipient_id uuid,
  recipient_name text,
  recipient_email text,
  optional_message text,
  accepted_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    s.id,
    s.recipient_id,
    coalesce(nullif(trim(p.display_name), ''), split_part(p.email, '@', 1)),
    p.email,
    coalesce(s.optional_message, ''),
    s.accepted_at
  from public.project_shares s
  join public.profiles p on p.id = s.recipient_id
  where s.project_id = p_project_id
    and s.owner_id = (select auth.uid())
    and public.current_user_is_pro()
  order by coalesce(nullif(trim(p.display_name), ''), split_part(p.email, '@', 1));
$$;

create or replace function public.get_project_share_participants(p_project_id uuid)
returns table (
  user_id uuid,
  first_name text,
  is_owner boolean,
  is_current_user boolean,
  has_account boolean
)
language sql stable security definer set search_path = public
as $$
  select
    participant.user_id,
    split_part(
      coalesce(nullif(trim(participant.display_name), ''), participant.email),
      ' ',
      1
    ),
    participant.is_owner,
    participant.user_id = (select auth.uid()),
    true
  from (
    select pr.user_id, p.display_name, p.email, true as is_owner
    from public.projects pr
    join public.profiles p on p.id = pr.user_id
    where pr.id = p_project_id
      and pr.user_id = (select auth.uid())
      and public.current_user_is_pro()
    union all
    select s.recipient_id, p.display_name, p.email, false
    from public.project_shares s
    join public.profiles p on p.id = s.recipient_id
    where s.project_id = p_project_id
      and s.owner_id = (select auth.uid())
      and public.current_user_is_pro()
  ) participant
  order by participant.is_owner desc, participant.display_name nulls last;
$$;

create or replace function public.remove_project_share(p_share_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from public.project_shares
  where id = p_share_id
    and owner_id = (select auth.uid())
    and public.current_user_is_pro();
  if not found then raise exception 'Gedeeld project niet gevonden.'; end if;
end;
$$;

revoke all on function public.project_share_days(uuid) from public;
revoke all on function public.create_project_share_invite(uuid, text) from public;
revoke all on function public.preview_project_share_invite(text) from public;
revoke all on function public.claim_project_share_invite(text) from public;
revoke all on function public.get_received_project_shares() from public;
revoke all on function public.get_sent_project_shares(uuid) from public;
revoke all on function public.get_project_share_participants(uuid) from public;
revoke all on function public.remove_project_share(uuid) from public;

grant execute on function public.create_project_share_invite(uuid, text) to authenticated;
grant execute on function public.preview_project_share_invite(text) to anon, authenticated;
grant execute on function public.claim_project_share_invite(text) to authenticated;
grant execute on function public.get_received_project_shares() to authenticated;
grant execute on function public.get_sent_project_shares(uuid) to authenticated;
grant execute on function public.get_project_share_participants(uuid) to authenticated;
grant execute on function public.remove_project_share(uuid) to authenticated;

comment on table public.project_share_invites is
  'Opaque links for sharing a redacted project overview without calculator or financial data.';
comment on table public.project_shares is
  'Project membership references only. Shared project details are read through redacted RPCs.';
