-- Persist only the narrow identity fields needed for dedupe and display.
-- The provider response itself must never be copied into an uncontrolled JSONB
-- column. Mapbox-backed rows are written only after a permanent geocode request.
alter table public.itinerary_items
  add column if not exists place_provider text,
  add column if not exists external_place_id text,
  add column if not exists normalized_address text,
  add constraint itinerary_items_place_identity_paired check (
    (place_provider is null) = (external_place_id is null)
  );

create index if not exists itinerary_items_trip_external_place_idx
  on public.itinerary_items (trip_id, place_provider, external_place_id)
  where external_place_id is not null;
