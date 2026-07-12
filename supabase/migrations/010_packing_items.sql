-- Persistent packing list for the Prep tab (previously client-side mock state).
create table if not exists public.packing_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  category text not null default 'other'
    check (category in ('clothing', 'electronics', 'documents', 'toiletries', 'other')),
  label text not null,
  checked boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists packing_items_trip_id_idx on public.packing_items(trip_id);

alter table public.packing_items enable row level security;

create policy "Trip members can view packing items"
  on public.packing_items for select
  using (
    exists (
      select 1 from public.trips
      where trips.id = packing_items.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can insert packing items"
  on public.packing_items for insert
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can update packing items"
  on public.packing_items for update
  using (
    exists (
      select 1 from public.trips
      where trips.id = packing_items.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete packing items"
  on public.packing_items for delete
  using (
    exists (
      select 1 from public.trips
      where trips.id = packing_items.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );
