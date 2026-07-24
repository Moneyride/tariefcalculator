-- Server-side bookkeeping for idempotent Shopify webhook processing.

create table if not exists public.shopify_webhook_events (
  webhook_id text primary key,
  topic text not null,
  shop_domain text not null,
  payload_hash text not null,
  status text not null default 'processing',
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint shopify_webhook_events_status_check
    check (status in ('processing', 'processed', 'failed'))
);

comment on table public.shopify_webhook_events is
  'Server-only delivery log used to ignore duplicate Shopify webhooks without storing payloads.';

alter table public.shopify_webhook_events enable row level security;

revoke all on table public.shopify_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.shopify_webhook_events to service_role;

create index if not exists shopify_webhook_events_received_at_idx
  on public.shopify_webhook_events (received_at);

