-- Generic accounting integration foundation. Moneybird is the first provider.
-- OAuth credentials are deliberately stored outside the client-readable table.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.accounting_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('moneybird')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'expired', 'revoked', 'disconnected')),
  administration_id text,
  administration_name text,
  scopes text[] not null default '{}',
  last_validated_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (user_id, provider)
);

create table if not exists public.accounting_credentials (
  connection_id uuid primary key references public.accounting_connections(id) on delete cascade,
  encrypted_credentials text not null,
  encryption_iv text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('moneybird')),
  state_hash text not null unique,
  return_path text not null default '/account.html',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_customer_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  local_customer_key text not null,
  local_customer_name text not null,
  external_contact_id text not null,
  external_contact_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, local_customer_key)
);

create table if not exists public.accounting_tax_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  local_tax_percentage numeric(7,4) not null,
  external_tax_rate_id text not null,
  external_tax_rate_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, local_tax_percentage)
);

create table if not exists public.accounting_ledger_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  category text not null,
  external_ledger_account_id text not null,
  external_ledger_account_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, category)
);

create table if not exists public.accounting_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.accounting_connections(id) on delete restrict,
  provider text not null check (provider in ('moneybird')),
  administration_id text not null,
  source_type text not null check (source_type in ('workday', 'project')),
  source_id uuid not null,
  project_id uuid references public.projects(id) on delete set null,
  workday_id uuid references public.workdays(id) on delete set null,
  external_invoice_id text,
  external_invoice_url text,
  external_state text,
  status text not null default 'preparing' check (status in ('preparing', 'creating', 'created', 'failed')),
  idempotency_key text not null,
  request_snapshot jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, idempotency_key)
);

create table if not exists public.accounting_export_items (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.accounting_exports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('workday', 'project_day')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (export_id, source_type, source_id)
);

create index if not exists accounting_exports_source_idx
  on public.accounting_exports(user_id, source_type, source_id, created_at desc);
create index if not exists accounting_export_items_source_idx
  on public.accounting_export_items(user_id, source_type, source_id);
create index if not exists accounting_oauth_states_expiry_idx
  on public.accounting_oauth_states(expires_at);

alter table public.accounting_connections enable row level security;
alter table public.accounting_credentials enable row level security;
alter table public.accounting_oauth_states enable row level security;
alter table public.accounting_customer_mappings enable row level security;
alter table public.accounting_tax_mappings enable row level security;
alter table public.accounting_ledger_mappings enable row level security;
alter table public.accounting_exports enable row level security;
alter table public.accounting_export_items enable row level security;

drop policy if exists accounting_connections_select_own on public.accounting_connections;
create policy accounting_connections_select_own on public.accounting_connections
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists accounting_customer_mappings_own on public.accounting_customer_mappings;
create policy accounting_customer_mappings_own on public.accounting_customer_mappings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.current_user_is_pro());

drop policy if exists accounting_tax_mappings_own on public.accounting_tax_mappings;
create policy accounting_tax_mappings_own on public.accounting_tax_mappings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.current_user_is_pro());

drop policy if exists accounting_ledger_mappings_own on public.accounting_ledger_mappings;
create policy accounting_ledger_mappings_own on public.accounting_ledger_mappings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.current_user_is_pro());

drop policy if exists accounting_exports_select_own on public.accounting_exports;
create policy accounting_exports_select_own on public.accounting_exports
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists accounting_export_items_select_own on public.accounting_export_items;
create policy accounting_export_items_select_own on public.accounting_export_items
  for select to authenticated using (user_id = (select auth.uid()));

-- No client policies are created for credentials or OAuth states. Only the
-- service-role Edge Function can read or mutate those records.
revoke all on public.accounting_credentials from anon, authenticated;
revoke all on public.accounting_oauth_states from anon, authenticated;

grant select on public.accounting_connections to authenticated;
grant select, insert, update, delete on public.accounting_customer_mappings to authenticated;
grant select, insert, update, delete on public.accounting_tax_mappings to authenticated;
grant select, insert, update, delete on public.accounting_ledger_mappings to authenticated;
grant select on public.accounting_exports, public.accounting_export_items to authenticated;

create or replace function public.accounting_connection_summary(p_provider text default 'moneybird')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', c.id,
        'provider', c.provider,
        'status', c.status,
        'administrationId', c.administration_id,
        'administrationName', c.administration_name,
        'scopes', c.scopes,
        'lastValidatedAt', c.last_validated_at,
        'lastError', c.last_error
      )
      from public.accounting_connections c
      where c.user_id = (select auth.uid())
        and c.provider = p_provider
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.accounting_connection_summary(text) from public;
grant execute on function public.accounting_connection_summary(text) to authenticated;

comment on table public.accounting_connections is
  'Client-readable provider connection metadata. OAuth secrets live in accounting_credentials.';
comment on table public.accounting_exports is
  'Idempotent server-side registry of accounting draft exports.';
