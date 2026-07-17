-- Apply RPC for day-based route optimization (Aşama 8).
--
-- reorder_itinerary_day (migration 20260716120000) already persists a day's
-- order atomically, but only guards against a stale item *count* — it can't
-- tell that some other editor changed (e.g. locked, retimed, or deleted) one
-- of the very items the optimizer just planned around. This function adds a
-- real optimistic-concurrency check: the caller supplies `p_since` (the
-- newest `updated_at` it observed among the day's items when it built the
-- preview), and the apply is rejected if anything in that day has changed
-- since. A new function rather than widening reorder_itinerary_day, since
-- that RPC's existing caller (plain drag-and-drop reorder in
-- ItineraryTimeline.tsx) has no such snapshot to pass.
create or replace function public.optimize_itinerary_day_apply(
  p_trip_id uuid,
  p_local_date date,
  p_item_ids uuid[],
  p_since timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected int;
  v_updated int;
  v_stale int;
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

  select count(*) into v_stale
  from public.itinerary_items
  where trip_id = p_trip_id
    and local_date is not distinct from p_local_date
    and updated_at > p_since;
  if v_stale > 0 then
    raise exception 'Itinerary day changed since you previewed the optimization — refresh and try again';
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

revoke all on function public.optimize_itinerary_day_apply(uuid, date, uuid[], timestamptz) from public;
revoke all on function public.optimize_itinerary_day_apply(uuid, date, uuid[], timestamptz) from anon;
grant execute on function public.optimize_itinerary_day_apply(uuid, date, uuid[], timestamptz) to authenticated;
