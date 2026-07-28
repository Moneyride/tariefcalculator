-- Store calculator presets per Pro work function.
-- Run after 202607250001_work_functions.sql.

alter table public.work_functions
  add column if not exists calculation_settings jsonb not null default '{}'::jsonb;

comment on column public.work_functions.calculation_settings is
  'Calculator settings and default extra selections restored when this function is active.';
