-- Default map focus point for a trip (the first destination country picked in
-- the "New Trip" wizard), used to center the planning map before any stops exist.
alter table public.trips
  add column if not exists focus_lat double precision,
  add column if not exists focus_lng double precision;
