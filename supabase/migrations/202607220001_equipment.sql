-- Pro equipment settings and reusable fixed-price equipment items.
-- Run after 202607210002_day_rate_settings.sql.

alter table public.settings
  add column if not exists drone_tariff_amount numeric(10, 2) not null default 50
    check (drone_tariff_amount >= 0),
  add column if not exists ronin_tariff_amount numeric(10, 2) not null default 50
    check (ronin_tariff_amount >= 0);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_user_id_idx on public.equipment(user_id);

drop trigger if exists equipment_set_updated_at on public.equipment;
create trigger equipment_set_updated_at
before update on public.equipment
for each row execute function public.set_updated_at();

alter table public.equipment enable row level security;

drop policy if exists "Users can read their own equipment" on public.equipment;
create policy "Users can read their own equipment"
on public.equipment for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own equipment" on public.equipment;
create policy "Users can create their own equipment"
on public.equipment for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own equipment" on public.equipment;
create policy "Users can update their own equipment"
on public.equipment for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own equipment" on public.equipment;
create policy "Users can delete their own equipment"
on public.equipment for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.equipment to authenticated;

comment on table public.equipment is
  'Reusable Pro equipment with fixed fees. Equipment fees never participate in overtime calculations.';
