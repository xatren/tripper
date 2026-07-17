-- Keep the user's expected visit length even for untimed and unscheduled
-- itinerary items. `end_at - start_at` is not a substitute because both
-- instants are intentionally nullable.
alter table public.itinerary_items
  add column if not exists duration_minutes integer
  check (duration_minutes is null or duration_minutes between 0 and 1440);
