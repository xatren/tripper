-- ============================================================
-- RoadTrip26 – Full Schema (run this in Supabase SQL Editor)
-- ============================================================
--
-- Historical reference only — NOT part of supabase/migrations/. This isn't a
-- "before 001" baseline: its `stops` table already carries place_category/
-- rating/estimated_cost/day_number/is_favorite (only added later, by
-- 004_stops_place_fields.sql / 005_activities.sql), while it has no
-- trip_members/pins/pin_photos/budget_items at all (001_initial_schema.sql's
-- original model). It's a simplified fresh-start snapshot for manual SQL
-- Editor setup, not a real point in the applied migration history — applying
-- it before/alongside supabase/migrations/ recreates tables and policies
-- those files already own and breaks "apply migrations from scratch"
-- (`supabase start`/`db reset`, and supabase/tests/functional's disposable
-- stack). Moved here from supabase/migrations/000_full_schema.sql on
-- 2026-07-28; the one real gap it was masking (trips.collaborator_id never
-- added by any numbered migration before 003 starts relying on it) is now
-- fixed directly in 003_add_stops_expenses_photos.sql instead.

-- Profiles (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Trips
create table if not exists public.trips (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  collaborator_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  start_date date,
  end_date date,
  total_budget numeric(10,2) default 0,
  invite_code text unique default upper(substr(md5(random()::text), 0, 9)),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Stops
create table if not exists public.stops (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  name text not null,
  description text,
  lat double precision not null,
  lng double precision not null,
  address text,
  state text,
  notes text,
  place_category text not null default 'scenic_view'
    check (place_category in (
      'hotel', 'restaurant', 'scenic_view', 'national_park', 'gas_station', 'hidden_spot',
      'camping', 'coffee_stop', 'city', 'beach', 'museum', 'activity'
    )),
  rating smallint check (rating is null or (rating >= 1 and rating <= 5)),
  estimated_cost numeric(10, 2),
  day_number integer,
  is_favorite boolean not null default false,
  arrival_date date,
  departure_date date,
  order_index integer not null default 0,
  stop_type text not null default 'destination'
    check (stop_type in ('origin','destination','waypoint','overnight')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Expenses
create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  stop_id uuid references public.stops(id) on delete set null,
  category text not null default 'other'
    check (category in ('fuel','food','lodging','activities','transport','other')),
  amount numeric(10,2) not null,
  description text,
  paid_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Photos
create table if not exists public.photos (
  id uuid default gen_random_uuid() primary key,
  stop_id uuid references public.stops(id) on delete cascade not null,
  blob_pathname text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ── Triggers ──────────────────────────────────────────────

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trips_updated_at on public.trips;
create trigger trips_updated_at
  before update on public.trips
  for each row execute procedure public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Row Level Security ─────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.stops enable row level security;
alter table public.expenses enable row level security;
alter table public.photos enable row level security;

-- Profiles
create policy "Users can view any profile"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Trips
create policy "Trip members can view trips"
  on public.trips for select
  using (owner_id = auth.uid() or collaborator_id = auth.uid());

create policy "Authenticated users can create trips"
  on public.trips for insert
  with check (auth.uid() = owner_id);

create policy "Trip members can update trips"
  on public.trips for update
  using (owner_id = auth.uid() or collaborator_id = auth.uid());

create policy "Trip owners can delete trips"
  on public.trips for delete
  using (owner_id = auth.uid());

-- Stops
create policy "Trip members can view stops"
  on public.stops for select
  using (
    exists (
      select 1 from public.trips
      where trips.id = stops.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can insert stops"
  on public.stops for insert
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can update stops"
  on public.stops for update
  using (
    exists (
      select 1 from public.trips
      where trips.id = stops.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete stops"
  on public.stops for delete
  using (
    exists (
      select 1 from public.trips
      where trips.id = stops.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

-- Expenses
create policy "Trip members can view expenses"
  on public.expenses for select
  using (
    exists (
      select 1 from public.trips
      where trips.id = expenses.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can insert expenses"
  on public.expenses for insert
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete expenses"
  on public.expenses for delete
  using (
    exists (
      select 1 from public.trips
      where trips.id = expenses.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

-- Photos
create policy "Trip members can view photos"
  on public.photos for select
  using (
    exists (
      select 1 from public.stops
      join public.trips on trips.id = stops.trip_id
      where stops.id = photos.stop_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can insert photos"
  on public.photos for insert
  with check (
    exists (
      select 1 from public.stops
      join public.trips on trips.id = stops.trip_id
      where stops.id = stop_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete photos"
  on public.photos for delete
  using (
    exists (
      select 1 from public.stops
      join public.trips on trips.id = stops.trip_id
      where stops.id = photos.stop_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

-- ── Realtime ───────────────────────────────────────────────

alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.stops;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.photos;
