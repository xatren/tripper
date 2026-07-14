-- Drops the v1 "pins" / "budget_items" data model (migration 001).
-- Superseded by stops + expenses (migration 003 onward) and the
-- create_trip_with_stops / reorder_trip_stops RPCs. No app code reads or
-- writes these tables anymore (app/api/pins, app/api/budget, and the old
-- app/api/trips REST routes were removed in the same cleanup) — verified by
-- grepping the codebase for `.from('pins')`, `.from('pin_photos')`,
-- `.from('budget_items')` and finding zero remaining callers.
--
-- Run this manually in the Supabase SQL Editor once you've confirmed no
-- external client (mobile app, integration, etc.) still depends on these
-- tables or the /api/pins, /api/budget, /api/trips REST endpoints.

alter publication supabase_realtime drop table if exists public.pins;
alter publication supabase_realtime drop table if exists public.budget_items;

drop table if exists public.pin_photos;
drop table if exists public.budget_items;
drop table if exists public.pins;
