-- Reordering stops previously issued one UPDATE per stop from the client,
-- which was slow on mobile networks and could leave a half-updated order if a
-- request in the middle failed. This RPC applies the whole new order in one
-- call and one transaction.

create or replace function public.reorder_trip_stops(p_trip_id uuid, p_stop_ids uuid[])
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

  -- The list must cover exactly the trip's current stops; otherwise the caller
  -- is working from stale data (e.g. a stop was added or deleted elsewhere).
  select count(*) into v_expected from public.stops where trip_id = p_trip_id;
  if v_expected <> coalesce(array_length(p_stop_ids, 1), 0) then
    raise exception 'Stop list is out of date — refresh and try again';
  end if;

  update public.stops s
  set order_index = ord.idx - 1
  from unnest(p_stop_ids) with ordinality as ord(stop_id, idx)
  where s.id = ord.stop_id
    and s.trip_id = p_trip_id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Stop list is out of date — refresh and try again';
  end if;
end;
$$;

revoke all on function public.reorder_trip_stops(uuid, uuid[]) from public;
grant execute on function public.reorder_trip_stops(uuid, uuid[]) to authenticated;
