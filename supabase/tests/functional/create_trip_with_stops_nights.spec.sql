-- Functional checks for `nights` on public.create_trip_with_stops
-- (20260808120000_stop_overnight_semantics.sql).
--
-- Migration 008 gave stops.nights a default of 1. 20260808120000 flipped that
-- default to 0, so a stop added to an existing route is born a pass-through day
-- stop. The creation RPC must NOT inherit that default: the cities picked in the
-- New Trip wizard, and the waypoints of an Explore route template, are places
-- the traveler sleeps. Inheriting 0 would make every freshly created trip look
-- one day long however many cities it held — so the RPC writes an explicit
-- `coalesce((s->>'nights')::int, 1)`.
--
-- These live here rather than under tests/ because what is under test is SQL: a
-- column default, a payload guard, and a coalesce inside a plpgsql body. A node
-- test could only assert on the migration file's text, which would pass just as
-- happily against a database where the migration was never applied. Runs inside
-- the disposable transaction set up by run.mts, after _helpers.sql and
-- _fixtures.sql. Every block raises on violation.

-- 1. Stops that carry no `nights` become overnight stops, one night each.
select tests.authenticate_as('owner');
do $$
declare
  v_result jsonb;
  v_trip_id uuid;
begin
  v_result := public.create_trip_with_stops(
    'Wizard trip',
    null, null, null, 0, 'USD', 'Road',
    jsonb_build_array(jsonb_build_object('name', 'United States', 'flag', '🇺🇸', 'lat', 47.6, 'lng', -122.3)),
    null, null,
    jsonb_build_array(
      jsonb_build_object('name', 'Seattle',  'lat', 47.60, 'lng', -122.33, 'order_index', 0, 'stop_type', 'origin'),
      jsonb_build_object('name', 'Portland', 'lat', 45.52, 'lng', -122.68, 'order_index', 1),
      jsonb_build_object('name', 'Eugene',   'lat', 44.05, 'lng', -123.09, 'order_index', 2)
    )
  );
  v_trip_id := (v_result->>'trip_id')::uuid;
  perform set_config('tests.nights_trip_id', v_trip_id::text, true);

  if (select count(*) from public.stops where trip_id = v_trip_id) <> 3 then
    raise exception 'create_trip_with_stops must insert every stop in the payload';
  end if;
  if exists (select 1 from public.stops where trip_id = v_trip_id and nights <> 1) then
    raise exception
      'a stop created without an explicit nights must hold one night, not the column default; got %',
      (select array_agg(nights order by order_index) from public.stops where trip_id = v_trip_id);
  end if;
end $$;

-- 2. An explicit per-stop `nights` is honoured — including 0, which has to
--    survive as a day stop rather than being coalesced up to one night.
do $$
declare
  v_result jsonb;
  v_trip_id uuid;
begin
  v_result := public.create_trip_with_stops(
    'Curated trip',
    null, null, null, 0, 'USD', 'Road',
    jsonb_build_array(jsonb_build_object('name', 'United States', 'flag', '🇺🇸', 'lat', 47.6, 'lng', -122.3)),
    null, null,
    jsonb_build_array(
      jsonb_build_object('name', 'Base',      'lat', 47.60, 'lng', -122.33, 'order_index', 0, 'nights', 2),
      jsonb_build_object('name', 'Viewpoint', 'lat', 46.10, 'lng', -122.90, 'order_index', 1, 'nights', 0),
      jsonb_build_object('name', 'Finish',    'lat', 45.52, 'lng', -122.68, 'order_index', 2, 'nights', 3)
    )
  );
  v_trip_id := (v_result->>'trip_id')::uuid;

  if (select array_agg(nights order by order_index) from public.stops where trip_id = v_trip_id)
     <> array[2, 0, 3] then
    raise exception
      'an explicit per-stop nights must be written verbatim, 0 included; got %',
      (select array_agg(nights order by order_index) from public.stops where trip_id = v_trip_id);
  end if;
end $$;

-- 3. A negative night count is rejected by the payload guard before any row is
--    written, so the caller gets one clear message instead of a check violation
--    halfway through the insert.
do $$
declare
  v_trips_before bigint := (select count(*) from public.trips);
begin
  begin
    perform public.create_trip_with_stops(
      'Rewinding trip',
      null, null, null, 0, 'USD', 'Road',
      jsonb_build_array(jsonb_build_object('name', 'United States', 'flag', '🇺🇸', 'lat', 47.6, 'lng', -122.3)),
      null, null,
      jsonb_build_array(jsonb_build_object('name', 'Backwards', 'lat', 47.6, 'lng', -122.3, 'nights', -2))
    );
    raise exception 'a negative nights must be rejected';
  exception when raise_exception or check_violation then
    null; -- expected
  end;
  if (select count(*) from public.trips) <> v_trips_before then
    raise exception 'a rejected stop payload must not leave a trip behind';
  end if;
end $$;

-- 4. The other creation path deliberately differs: a stop inserted straight into
--    the table (Plan's "Add destination") takes the new column default and is
--    born a day stop, so a long route no longer inflates the trip's length. If
--    these two ever agree again, one of them has silently changed meaning.
do $$
declare
  v_trip_id uuid := current_setting('tests.nights_trip_id')::uuid;
  v_nights integer;
begin
  insert into public.stops (trip_id, name, lat, lng, order_index, stop_type, created_by)
  values (v_trip_id, 'Added from Plan', 44.94, -123.03, 3, 'destination', tests.user_id('owner'))
  returning nights into v_nights;

  if v_nights <> 0 then
    raise exception
      'a stop added to an existing route must default to 0 nights (migration 20260808120000); got %',
      v_nights;
  end if;
end $$;
select tests.clear_authentication();
