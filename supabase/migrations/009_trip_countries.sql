-- Destination countries picked in the New Trip wizard, previously serialized
-- into trips.description as free text ("Countries: ..."). Each array element:
--   { "name": "Italy", "flag": "🇮🇹", "lat": 42, "lng": 12 }
alter table public.trips
  add column if not exists countries jsonb not null default '[]'::jsonb;
