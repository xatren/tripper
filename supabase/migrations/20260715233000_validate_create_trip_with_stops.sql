-- Keep the atomic trip-creation boundary as strict as the New Trip wizard.
-- Dates and budget remain optional, but partial/reversed date ranges, invalid
-- enums, malformed country JSON, and unsafe coordinates are rejected.
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

  if (p_start_date is null) <> (p_end_date is null) then
    raise exception 'Departure and return dates must both be provided or both be omitted';
  end if;
  if p_end_date < p_start_date then
    raise exception 'Return date must be on or after departure';
  end if;

  if p_total_budget is not null and
     (p_total_budget < 0 or p_total_budget > 99999999.99) then
    raise exception 'Budget must be between 0 and 99999999.99';
  end if;
  if p_currency is null or p_currency not in ('USD', 'EUR', 'GBP', 'TRY') then
    raise exception 'Unsupported trip currency';
  end if;
  if p_vibe is null or p_vibe not in ('Road', 'Fly', 'Camp', 'Beach', 'Mountain', 'Backpack') then
    raise exception 'Unsupported trip vibe';
  end if;

  if jsonb_typeof(coalesce(p_countries, '[]'::jsonb)) <> 'array' then
    raise exception 'Countries must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_countries, '[]'::jsonb)) = 0 then
    raise exception 'At least one destination country is required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_countries, '[]'::jsonb)) as c(country)
    where jsonb_typeof(country) <> 'object'
       or nullif(trim(country->>'name'), '') is null
       or nullif(trim(country->>'flag'), '') is null
       or case when jsonb_typeof(country->'lat') = 'number'
            then (country->>'lat')::double precision between -90 and 90
            else false end is not true
       or case when jsonb_typeof(country->'lng') = 'number'
            then (country->>'lng')::double precision between -180 and 180
            else false end is not true
  ) then
    raise exception 'Every country must have a name, flag, and valid coordinates';
  end if;

  if (p_focus_lat is null) <> (p_focus_lng is null) then
    raise exception 'Focus latitude and longitude must both be provided or both be omitted';
  end if;
  if p_focus_lat is not null and
     (p_focus_lat <> p_focus_lat or p_focus_lat < -90 or p_focus_lat > 90 or
      p_focus_lng <> p_focus_lng or p_focus_lng < -180 or p_focus_lng > 180) then
    raise exception 'Invalid focus coordinates';
  end if;

  if jsonb_typeof(coalesce(p_stops, '[]'::jsonb)) <> 'array' then
    raise exception 'Stops must be a JSON array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_stops, '[]'::jsonb)) as s(stop)
    where jsonb_typeof(stop) <> 'object'
       or nullif(trim(stop->>'name'), '') is null
       or case when jsonb_typeof(stop->'lat') = 'number'
            then (stop->>'lat')::double precision between -90 and 90
            else false end is not true
       or case when jsonb_typeof(stop->'lng') = 'number'
            then (stop->>'lng')::double precision between -180 and 180
            else false end is not true
       or (stop ? 'order_index' and coalesce(stop->>'order_index', '') !~ '^\d+$')
       or (stop ? 'stop_type' and stop->>'stop_type' not in ('origin', 'destination', 'waypoint', 'overnight'))
  ) then
    raise exception 'Every stop must have a name, valid coordinates, order, and type';
  end if;

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
  ) values (
    v_user, trim(p_title), p_description, p_start_date, p_end_date,
    coalesce(p_total_budget, 0), p_currency, p_vibe,
    p_countries, p_focus_lat, p_focus_lng, v_code
  ) returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, v_user, 'owner')
  on conflict (trip_id, user_id) do update set role = 'owner';

  insert into public.stops (trip_id, name, lat, lng, order_index, stop_type, created_by)
  select
    v_trip_id,
    trim(s->>'name'),
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
