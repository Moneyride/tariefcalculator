-- Server-only cache for relatively static accounting-provider data.
-- This keeps tax rates, ledger accounts and administrations from being fetched
-- again for every preview while leaving credentials in their dedicated vault.

create table if not exists public.accounting_provider_cache (
  connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  provider text not null,
  cache_key text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (connection_id, cache_key)
);

create index if not exists accounting_provider_cache_expiry_idx
  on public.accounting_provider_cache(expires_at);

alter table public.accounting_provider_cache enable row level security;

-- Only the service-role Edge Function may read or mutate provider cache data.
-- No client policies are intentionally created.
revoke all on public.accounting_provider_cache from anon, authenticated;

comment on table public.accounting_provider_cache is
  'Expiring server-only cache for non-secret accounting provider metadata.';
