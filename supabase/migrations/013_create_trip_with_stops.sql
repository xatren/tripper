-- Atomic trip creation. The New Trip wizard and Explore's "Use This Route"
-- previously inserted into trips (and then stops) directly from the client,
-- which could leave a trip without its template stops when the second insert
-- failed, and relied on a client-generated invite code that could collide.
-- This RPC creates the trip, the owner membership, and any template stops in
-- a single transaction, and generates the invite code server-side with a
-- uniqueness retry.

create or replace function public.create_trip_with_stops(
  p_title text,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_total_budget numeric default 0,
  p_currency text default 'USD',
  p_vibe text default null,
  p_countries jsonb default '[]'::jsonb,
  p_focus_lat double precision default null,
  p_focus_lng double precision default null,
  p_stops jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trip_id uuid;
  v_code text;
  v_attempts int := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Trip title is required';
  end if;

  -- Unambiguous alphabet (no O/0, I/1) matching the codes users type by hand.
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32))::int + 1, 1), '')
    into v_code
    from generate_series(1, 8);

    exit when not exists (select 1 from public.trips t where upper(t.invite_code) = v_code);

    v_attempts := v_attempts + 1;
    if v_attempts >= 20 then
      raise exception 'Could not generate a unique invite code';
    end if;
  end loop;

  insert into public.trips (
    owner_id, title, description, start_date, end_date,
    total_budget, currency, vibe, countries, focus_lat, focus_lng, invite_code
  )
  values (
    v_user, trim(p_title), p_description, p_start_date, p_end_date,
    coalesce(p_total_budget, 0), coalesce(p_currency, 'USD'), p_vibe,
    coalesce(p_countries, '[]'::jsonb), p_focus_lat, p_focus_lng, v_code
  )
  returning id into v_trip_id;

  -- The trips_add_owner_membership trigger also inserts this row; the upsert
  -- keeps the function correct even if the trigger is removed later.
  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, v_user, 'owner')
  on conflict (trip_id, user_id) do update set role = 'owner';

  insert into public.stops (trip_id, name, lat, lng, order_index, stop_type, created_by)
  select
    v_trip_id,
    s->>'name',
    (s->>'lat')::double precision,
    (s->>'lng')::double precision,
    coalesce((s->>'order_index')::int, ord::int - 1),
    coalesce(s->>'stop_type', case when ord = 1 then 'origin' else 'destination' end),
    v_user
  from jsonb_array_elements(coalesce(p_stops, '[]'::jsonb)) with ordinality as t(s, ord);

  return jsonb_build_object('trip_id', v_trip_id, 'invite_code', v_code);
end;
$$;

revoke all on function public.create_trip_with_stops(
  text, text, date, date, numeric, text, text, jsonb, double precision, double precision, jsonb
) from public;
grant execute on function public.create_trip_with_stops(
  text, text, date, date, numeric, text, text, jsonb, double precision, double precision, jsonb
) to authenticated;
