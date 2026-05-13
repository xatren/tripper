-- Users (Supabase Auth ile otomatik, sadece profil extension)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Trips
create table public.trips (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  cover_image_url text,
  start_date date,
  end_date date,
  total_budget numeric(10,2) default 0,
  invite_code text unique default substr(md5(random()::text), 0, 9),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trip Members (collaboration için)
create table public.trip_members (
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'editor', -- 'owner' | 'editor' | 'viewer'
  joined_at timestamptz default now(),
  primary key (trip_id, user_id)
);

-- Pins
create table public.pins (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade,
  created_by uuid references public.profiles(id),
  title text not null,
  description text,
  address text,
  category text not null,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  day_number integer,
  order_index integer default 0,
  is_favorite boolean default false,
  is_completed boolean default false,
  rating integer check (rating between 1 and 5),
  estimated_cost numeric(8,2),
  visit_date date,
  stay_duration_hours numeric(4,1),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Pin Photos
create table public.pin_photos (
  id uuid default gen_random_uuid() primary key,
  pin_id uuid references public.pins(id) on delete cascade,
  storage_path text not null,
  url text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Budget Items
create table public.budget_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade,
  pin_id uuid references public.pins(id) on delete set null,
  category text not null,
  label text not null,
  amount numeric(10,2) not null,
  date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Pin kategorileri için enum constraint
alter table public.pins add constraint pins_category_check
  check (category in (
    'hotel','restaurant','scenic_view','national_park',
    'gas_station','hidden_spot','camping','coffee_stop',
    'activity','city','other'
  ));

-- Budget kategorileri için constraint
alter table public.budget_items add constraint budget_category_check
  check (category in ('gas','hotel','food','activities','emergency','misc'));

-- Auto-update updated_at triggers
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trips_updated_at before update on public.trips
  for each row execute procedure public.handle_updated_at();

create trigger pins_updated_at before update on public.pins
  for each row execute procedure public.handle_updated_at();

-- Auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.pins enable row level security;
alter table public.pin_photos enable row level security;
alter table public.budget_items enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Trip policies
create policy "Trip members can view trips"
  on public.trips for select
  using (
    owner_id = auth.uid() or
    exists (select 1 from public.trip_members where trip_id = id and user_id = auth.uid())
  );

create policy "Authenticated users can create trips"
  on public.trips for insert
  with check (auth.uid() = owner_id);

create policy "Trip owners can update trips"
  on public.trips for update
  using (owner_id = auth.uid());

create policy "Trip owners can delete trips"
  on public.trips for delete
  using (owner_id = auth.uid());

-- Trip members policies
create policy "Trip members can view members"
  on public.trip_members for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.trips
      where id = trip_id and owner_id = auth.uid()
    )
  );

create policy "Trip owners can manage members"
  on public.trip_members for all
  using (
    exists (
      select 1 from public.trips
      where id = trip_id and owner_id = auth.uid()
    )
  );

create policy "Users can join trips via invite"
  on public.trip_members for insert
  with check (auth.uid() = user_id);

-- Pins policies
create policy "Trip members can view pins"
  on public.pins for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = pins.trip_id and user_id = auth.uid()
    ) or
    exists (
      select 1 from public.trips
      where id = pins.trip_id and owner_id = auth.uid()
    )
  );

create policy "Trip editors can create pins"
  on public.pins for insert
  with check (
    exists (
      select 1 from public.trip_members
      where trip_id = pins.trip_id and user_id = auth.uid() and role in ('owner', 'editor')
    ) or
    exists (
      select 1 from public.trips
      where id = pins.trip_id and owner_id = auth.uid()
    )
  );

create policy "Trip editors can update pins"
  on public.pins for update
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = pins.trip_id and user_id = auth.uid() and role in ('owner', 'editor')
    ) or
    exists (
      select 1 from public.trips
      where id = pins.trip_id and owner_id = auth.uid()
    )
  );

create policy "Trip editors can delete pins"
  on public.pins for delete
  using (
    created_by = auth.uid() or
    exists (
      select 1 from public.trips
      where id = pins.trip_id and owner_id = auth.uid()
    )
  );

-- Pin photos policies
create policy "Trip members can view photos"
  on public.pin_photos for select
  using (
    exists (
      select 1 from public.pins p
      join public.trips t on t.id = p.trip_id
      where p.id = pin_id and (
        t.owner_id = auth.uid() or
        exists (select 1 from public.trip_members tm where tm.trip_id = t.id and tm.user_id = auth.uid())
      )
    )
  );

create policy "Trip editors can add photos"
  on public.pin_photos for insert
  with check (auth.uid() = uploaded_by);

create policy "Photo uploaders can delete their photos"
  on public.pin_photos for delete
  using (uploaded_by = auth.uid());

-- Budget items policies
create policy "Trip members can view budget"
  on public.budget_items for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = budget_items.trip_id and user_id = auth.uid()
    ) or
    exists (
      select 1 from public.trips
      where id = budget_items.trip_id and owner_id = auth.uid()
    )
  );

create policy "Trip editors can manage budget"
  on public.budget_items for all
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = budget_items.trip_id and user_id = auth.uid() and role in ('owner', 'editor')
    ) or
    exists (
      select 1 from public.trips
      where id = budget_items.trip_id and owner_id = auth.uid()
    )
  );

-- Realtime için publication
alter publication supabase_realtime add table public.pins;
alter publication supabase_realtime add table public.budget_items;
alter publication supabase_realtime add table public.trip_members;
