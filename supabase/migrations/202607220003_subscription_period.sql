-- Subscription period metadata for the future Shopify synchronization.
-- These fields remain read-only for browser clients and must be updated by
-- trusted server-side code, such as the future Shopify webhook.

alter table public.profiles
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean not null default false;

comment on column public.profiles.subscription_current_period_end is
  'End of the currently paid Shopify subscription period.';

comment on column public.profiles.subscription_cancel_at_period_end is
  'True when Shopify will stop the subscription at the end of the current paid period.';

