-- Pro projects and individual project-day calculations.
-- Run after 202607220001_equipment.sql.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  client_name text check (client_name is null or char_length(trim(client_name)) <= 120),
  start_date date not null,
  end_date date not null,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_date_range_check check (end_date >= start_date)
);

create table if not exists public.project_days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  calculation_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_days_unique_date unique (project_id, work_date)
);

create index if not exists projects_user_updated_idx on public.projects(user_id, updated_at desc);
create index if not exists project_days_project_date_idx on public.project_days(project_id, work_date);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_days_set_updated_at on public.project_days;
create trigger project_days_set_updated_at before update on public.project_days
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_days enable row level security;

create or replace function public.current_user_is_pro()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select is_pro from public.profiles where id = (select auth.uid())), false);
$$;

revoke all on function public.current_user_is_pro() from public;
grant execute on function public.current_user_is_pro() to authenticated;

drop policy if exists "Pro users can read their own projects" on public.projects;
create policy "Pro users can read their own projects" on public.projects for select to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can create their own projects" on public.projects;
create policy "Pro users can create their own projects" on public.projects for insert to authenticated
with check ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can update their own projects" on public.projects;
create policy "Pro users can update their own projects" on public.projects for update to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro())
with check ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can delete their own projects" on public.projects;
create policy "Pro users can delete their own projects" on public.projects for delete to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can read their own project days" on public.project_days;
create policy "Pro users can read their own project days" on public.project_days for select to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro()
  and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

drop policy if exists "Pro users can create their own project days" on public.project_days;
create policy "Pro users can create their own project days" on public.project_days for insert to authenticated
with check ((select auth.uid()) = user_id and public.current_user_is_pro()
  and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

drop policy if exists "Pro users can update their own project days" on public.project_days;
create policy "Pro users can update their own project days" on public.project_days for update to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro()
  and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
with check ((select auth.uid()) = user_id and public.current_user_is_pro()
  and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

drop policy if exists "Pro users can delete their own project days" on public.project_days;
create policy "Pro users can delete their own project days" on public.project_days for delete to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro()
  and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.project_days to authenticated;

comment on table public.projects is 'Pro-only multi-day projects owned by one authenticated user.';
comment on column public.project_days.calculation_data is 'Versionable calculator input snapshot; totals are recalculated client-side.';
