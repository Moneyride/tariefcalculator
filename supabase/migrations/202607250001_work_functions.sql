-- Pro-only work functions with their own department and default day rate.
-- Run after 202607240002_workdays.sql.

create table if not exists public.work_functions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  department text not null default 'camera'
    check (department in ('camera', 'audio')),
  day_rate numeric(10, 2) not null default 0 check (day_rate >= 0),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_functions_user_sort_idx
  on public.work_functions(user_id, sort_order, created_at);

create unique index if not exists work_functions_one_default_per_user_idx
  on public.work_functions(user_id)
  where is_default;

drop trigger if exists work_functions_set_updated_at on public.work_functions;
create trigger work_functions_set_updated_at before update on public.work_functions
for each row execute function public.set_updated_at();

alter table public.work_functions enable row level security;

drop policy if exists "Pro users can read their own work functions" on public.work_functions;
create policy "Pro users can read their own work functions"
on public.work_functions for select to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can create their own work functions" on public.work_functions;
create policy "Pro users can create their own work functions"
on public.work_functions for insert to authenticated
with check ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can update their own work functions" on public.work_functions;
create policy "Pro users can update their own work functions"
on public.work_functions for update to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro())
with check ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can delete their own work functions" on public.work_functions;
create policy "Pro users can delete their own work functions"
on public.work_functions for delete to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro());

grant select, insert, update, delete on table public.work_functions to authenticated;

comment on table public.work_functions is
  'Pro-only reusable job functions. Selecting a function applies its department and day rate.';
