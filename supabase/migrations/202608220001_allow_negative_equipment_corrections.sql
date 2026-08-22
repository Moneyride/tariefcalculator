-- Allow custom equipment rows to act as a correction on the day rate.
-- Built-in Drone and Ronin tariffs remain non-negative.

alter table public.equipment
  drop constraint if exists equipment_amount_check;

comment on column public.equipment.amount is
  'Fixed equipment fee. A negative amount is allowed for day-rate corrections.';
