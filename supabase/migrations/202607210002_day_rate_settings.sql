-- Store the calculator's actual day rate and keep parking as an amount only.
-- Run after 202607210001_saas_foundation.sql.

alter table public.settings
  rename column default_hourly_rate to default_day_rate;

update public.settings
set default_day_rate = default_day_rate * 10;

alter table public.settings
  alter column default_day_rate set default 450;

alter table public.settings
  drop column parking_enabled;

comment on column public.settings.default_day_rate is
  'Default full-day tariff used by the calculator. Overtime rates are derived in the browser.';
