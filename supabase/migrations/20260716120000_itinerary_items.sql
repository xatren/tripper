-- Unified daily itinerary model (Phase 4).
--
-- `stops` remains the geographic backbone of the route; this table adds the
-- day-by-day plan layered on top of it. Every item belongs to a trip, may be
-- pinned to a calendar day (`local_date`), and may reference the stop it
-- happens at. Existing trips keep working without any backfill: the client
-- projects a read-only timeline from the stop schedule for stops that have no
-- linked itinerary item, so this migration is purely additive.
--
-- Type-specific detail strategy: flight/stay/reservation specifics
-- (PNR, check-in windows, seat, confirmation numbers, …) are intentionally
-- NOT modeled as a JSONB grab-bag here. Later phases add narrow 1:1 detail
-- tables keyed by the item id (e.g. `itinerary_flight_details(item_id uuid
-- primary key references public.itinerary_items(id) on delete cascade, …)`)
-- so each type gets typed columns and its own constraints while this core
-- table stays the single ordering/scheduling surface.

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  -- Optional link to the route stop this item happens at. A deleted stop
  -- keeps the plan item; it merely loses its geographic anchor.
  stop_id uuid references public.stops(id) on delete set null,
  item_type text not null
    check (item_type in (
      'place', 'activity', 'stay', 'flight', 'transport',
      'restaurant', 'reservation', 'note', 'free_time'
    )),
  title text not null check (length(trim(title)) > 0),
  notes text,
  -- Scheduling: `local_date` is the wall-clock day the item belongs to on the
  -- day strip (authoritative for grouping/ordering); start/end are optional
  -- absolute instants for timed items, with `timezone` recording the IANA
  -- zone the traveller picked them in so clients can re-render wall time.
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  local_date date,
  timezone text,
  order_index integer not null default 0,
  -- Optional geography for items not tied to a stop (a restaurant, a trailhead).
  lat double precision,
  lng double precision,
  address text,
  estimated_cost numeric(10, 2) check (estimated_cost is null or estimated_cost >= 0),
  currency text check (currency is null or currency in ('USD', 'EUR', 'GBP', 'TRY')),
  status text not null default 'planned'
    check (status in ('planned', 'on_the_way', 'arrived', 'completed', 'skipped')),
  is_locked boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itinerary_items_time_order check (
    start_at is null or end_at is null or end_at >= start_at
  ),
  constraint itinerary_items_coords_paired check (
    (lat is null) = (lng is null)
  )
);

-- Day timeline reads always filter by trip and order by day + position.
create index if not exists itinerary_items_trip_day_order_idx
  on public.itinerary_items (trip_id, local_date, order_index);
create index if not exists itinerary_items_stop_id_idx
  on public.itinerary_items (stop_id);
-- Account deletion sets created_by to null; keep that scan cheap.
create index if not exists itinerary_items_created_by_idx
  on public.itinerary_items (created_by);

-- Reuse the shared updated_at trigger from the baseline schemas.
drop trigger if exists itinerary_items_updated_at on public.itinerary_items;
create trigger itinerary_items_updated_at
  before update on public.itinerary_items
  for each row execute procedure public.handle_updated_at();

-- Row-level security: members read, owners/editors mutate (same contract as
-- stops/packing/journal). UPDATE carries both USING and WITH CHECK so a row
-- can be neither smuggled out of nor into a trip the editor doesn't hold.
alter table public.itinerary_items enable row level security;

drop policy if exists "Trip members can view itinerary items" on public.itinerary_items;
drop policy if exists "Trip editors can insert itinerary items" on public.itinerary_items;
drop policy if exists "Trip editors can update itinerary items" on public.itinerary_items;
drop policy if exists "Trip editors can delete itinerary items" on public.itinerary_items;

create policy "Trip members can view itinerary items" on public.itinerary_items
  for select using (public.is_trip_member(trip_id));
create policy "Trip editors can insert itinerary items" on public.itinerary_items
  for insert with check (public.is_trip_editor(trip_id));
create policy "Trip editors can update itinerary items" on public.itinerary_items
  for update using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));
create policy "Trip editors can delete itinerary items" on public.itinerary_items
  for delete using (public.is_trip_editor(trip_id));

-- Data API grants are explicit since 20260716005552; RLS restricts rows.
revoke all on table public.itinerary_items from anon;
revoke all on table public.itinerary_items from authenticated;
grant select, insert, update, delete on table public.itinerary_items to authenticated;

-- Atomic day reorder, mirroring reorder_trip_stops (migration 014): applies a
-- whole day's order in one transaction and rejects stale lists. p_local_date
-- null targets the unscheduled bucket.
create or replace function public.reorder_itinerary_day(
  p_trip_id uuid,
  p_local_date date,
  p_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected int;
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_trip_editor(p_trip_id) then
    raise exception 'Not authorized to edit this trip';
  end if;

  select count(*) into v_expected
  from public.itinerary_items
  where trip_id = p_trip_id
    and local_date is not distinct from p_local_date;
  if v_expected <> coalesce(array_length(p_item_ids, 1), 0) then
    raise exception 'Itinerary day is out of date — refresh and try again';
  end if;

  update public.itinerary_items i
  set order_index = ord.idx - 1
  from unnest(p_item_ids) with ordinality as ord(item_id, idx)
  where i.id = ord.item_id
    and i.trip_id = p_trip_id
    and i.local_date is not distinct from p_local_date;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Itinerary day is out of date — refresh and try again';
  end if;
end;
$$;

revoke all on function public.reorder_itinerary_day(uuid, date, uuid[]) from public;
grant execute on function public.reorder_itinerary_day(uuid, date, uuid[]) to authenticated;

-- Realtime: Postgres Changes still cannot filter DELETE events, so extend the
-- trip-scoped delete-signal channel (migration 016) to this table.
alter table public.trip_realtime_deletes
  drop constraint if exists trip_realtime_deletes_table_name_check;
alter table public.trip_realtime_deletes
  add constraint trip_realtime_deletes_table_name_check
  check (table_name in ('stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items'));

create or replace function public.signal_trip_domain_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name not in ('stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items') then
    raise exception 'Unsupported realtime delete source: %', tg_table_name;
  end if;

  insert into public.trip_realtime_deletes (trip_id, table_name, row_id, deleted_at)
  values (old.trip_id, tg_table_name, old.id, now())
  on conflict (trip_id, table_name, row_id)
  do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;

revoke all on function public.signal_trip_domain_delete() from public;
revoke all on function public.signal_trip_domain_delete() from anon;
revoke all on function public.signal_trip_domain_delete() from authenticated;

drop trigger if exists itinerary_items_signal_realtime_delete on public.itinerary_items;
create trigger itinerary_items_signal_realtime_delete
  after delete on public.itinerary_items
  for each row execute function public.signal_trip_domain_delete();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'itinerary_items'
  ) then
    execute 'alter publication supabase_realtime add table public.itinerary_items';
  end if;
end $$;
