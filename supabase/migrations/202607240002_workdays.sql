-- Pro-only saved standalone calculator days.
-- Run after 202607240001_shopify_webhooks.sql. The Pro helper comes from
-- 202607220002_projects.sql, which must already be installed.

create table if not exists public.workdays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  calculation_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workdays_user_date_idx
  on public.workdays(user_id, work_date desc, updated_at desc);

drop trigger if exists workdays_set_updated_at on public.workdays;
create trigger workdays_set_updated_at before update on public.workdays
for each row execute function public.set_updated_at();

alter table public.workdays enable row level security;

drop policy if exists "Pro users can read their own workdays" on public.workdays;
create policy "Pro users can read their own workdays" on public.workdays for select to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can create their own workdays" on public.workdays;
create policy "Pro users can create their own workdays" on public.workdays for insert to authenticated
with check ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can update their own workdays" on public.workdays;
create policy "Pro users can update their own workdays" on public.workdays for update to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro())
with check ((select auth.uid()) = user_id and public.current_user_is_pro());

drop policy if exists "Pro users can delete their own workdays" on public.workdays;
create policy "Pro users can delete their own workdays" on public.workdays for delete to authenticated
using ((select auth.uid()) = user_id and public.current_user_is_pro());

grant select, insert, update, delete on table public.workdays to authenticated;

comment on table public.workdays is
  'Pro-only standalone calculator snapshots. Multiple workdays may share one date.';
comment on column public.workdays.calculation_data is
  'Versionable calculator input snapshot; status and totals are derived client-side.';
