-- Activities: places to visit, eat, or experience near a stop
-- Snapshot Google Places data to avoid repeated paid API calls.

create table if not exists public.activities (
  id                  uuid default gen_random_uuid() primary key,
  trip_id             uuid not null references public.trips(id)  on delete cascade,
  stop_id             uuid          references public.stops(id)  on delete set null,

  -- Google Places snapshot
  place_id            text,
  name                text not null,
  address             text,
  lat                 double precision,
  lng                 double precision,
  category            text not null default 'all'
                        constraint activities_category_check
                        check (category in ('nature','culture','history','food','entertainment','all')),
  google_types        text[],
  photo_url           text,
  rating              real,
  user_ratings_total  integer,

  -- Trip planning
  day_number          integer,
  scheduled_at        timestamptz,
  duration_mins       integer,
  notes               text,
  estimated_cost      numeric(10,2),
  is_completed        boolean not null default false,

  created_by          uuid references public.profiles(id),
  created_at          timestamptz default now() not null
);

alter table public.activities enable row level security;

create policy "Trip members can view activities"
  on public.activities for select
  using (
    exists (
      select 1 from public.trips
      where trips.id = activities.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can insert activities"
  on public.activities for insert
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can update activities"
  on public.activities for update
  using (
    exists (
      select 1 from public.trips
      where trips.id = activities.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete activities"
  on public.activities for delete
  using (
    exists (
      select 1 from public.trips
      where trips.id = activities.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

-- Personal bookmarks (user-scoped, not trip-bound)
create table if not exists public.activity_bookmarks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   text not null,
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  category   text,
  photo_url  text,
  saved_at   timestamptz default now() not null,
  primary key (user_id, place_id)
);

alter table public.activity_bookmarks enable row level security;

create policy "Users manage own bookmarks"
  on public.activity_bookmarks for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Performance indexes
create index if not exists activities_trip_id_idx   on public.activities(trip_id);
create index if not exists activities_stop_id_idx   on public.activities(stop_id);
create index if not exists activities_place_id_idx  on public.activities(place_id);
create index if not exists activities_category_idx  on public.activities(category);

-- Realtime
alter publication supabase_realtime add table public.activities;
