-- Overuurtje.nl SaaS foundation
-- Run this migration through the Supabase CLI or SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  is_pro boolean not null default false,
  subscription_status text not null default 'free',
  subscription_provider text not null default 'shopify',
  subscription_customer_id text,
  subscription_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_subscription_provider_check
    check (subscription_provider in ('shopify'))
);

comment on column public.profiles.is_pro is
  'Derived subscription entitlement. Only trusted backend code or a future Shopify webhook may update this field.';
comment on column public.profiles.subscription_customer_id is
  'Shopify customer/subscription reference for the future server-side integration.';

create table if not exists public.settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_department text not null default 'camera',
  default_hourly_rate numeric(10, 2) not null default 45 check (default_hourly_rate >= 0),
  mileage_rate numeric(10, 2) not null default 0.23 check (mileage_rate >= 0),
  parking_enabled boolean not null default false,
  parking_default_amount numeric(10, 2) not null default 0 check (parking_default_amount >= 0),
  drone_enabled boolean not null default false,
  ronin_enabled boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_department_check check (default_department in ('camera', 'audio'))
);

comment on table public.settings is
  'Calculator defaults only. Future projects, equipment and history belong in separate tables.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.settings enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own display name" on public.profiles;
create policy "Users can update their own display name"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Browser clients may never change subscription entitlements.
revoke insert on table public.profiles from authenticated;
revoke update on table public.profiles from authenticated;
grant insert (id, email, display_name) on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "Users can read their own settings" on public.settings;
create policy "Users can read their own settings"
on public.settings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own settings" on public.settings;
create policy "Users can create their own settings"
on public.settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own settings" on public.settings;
create policy "Users can update their own settings"
on public.settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own settings" on public.settings;
create policy "Users can delete their own settings"
on public.settings for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.settings to authenticated;
