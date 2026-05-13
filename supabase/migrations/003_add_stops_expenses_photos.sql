-- Stops table
create table if not exists public.stops (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  description text,
  lat double precision not null,
  lng double precision not null,
  address text,
  arrival_date date,
  departure_date date,
  order_index integer not null default 0,
  stop_type text not null default 'destination' check (stop_type in ('origin','destination','waypoint','overnight')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

alter table public.stops enable row level security;

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

-- Expenses table
create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  stop_id uuid references public.stops(id) on delete set null,
  category text not null default 'other' check (category in ('fuel','food','lodging','activities','transport','other')),
  amount numeric(10,2) not null,
  description text,
  paid_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

alter table public.expenses enable row level security;

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

-- Photos table
create table if not exists public.photos (
  id uuid default gen_random_uuid() primary key,
  stop_id uuid not null references public.stops(id) on delete cascade,
  blob_pathname text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

alter table public.photos enable row level security;

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

-- Enable realtime for new tables
alter publication supabase_realtime add table public.stops;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.photos;
