-- 011_journal.sql — Daily journal entries + photos (Journal tab)
-- Also creates the `trip-photos` storage bucket and its access policies,
-- so the whole feature ships from a single SQL run.

-- ── Journal entries ──────────────────────────────────────────────────────────
create table if not exists public.journal_entries (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  entry_date date not null default (now() at time zone 'utc')::date,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

create index if not exists journal_entries_trip_idx on public.journal_entries (trip_id, entry_date);

alter table public.journal_entries enable row level security;

create policy "Trip members can view journal entries"
  on public.journal_entries for select
  using (
    exists (
      select 1 from public.trips
      where trips.id = journal_entries.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can insert journal entries"
  on public.journal_entries for insert
  with check (
    exists (
      select 1 from public.trips
      where trips.id = trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can update journal entries"
  on public.journal_entries for update
  using (
    exists (
      select 1 from public.trips
      where trips.id = journal_entries.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete journal entries"
  on public.journal_entries for delete
  using (
    exists (
      select 1 from public.trips
      where trips.id = journal_entries.trip_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

-- ── Journal photos ───────────────────────────────────────────────────────────
create table if not exists public.journal_photos (
  id uuid default gen_random_uuid() primary key,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

create index if not exists journal_photos_entry_idx on public.journal_photos (entry_id);

alter table public.journal_photos enable row level security;

create policy "Trip members can view journal photos"
  on public.journal_photos for select
  using (
    exists (
      select 1 from public.journal_entries e
      join public.trips on trips.id = e.trip_id
      where e.id = journal_photos.entry_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can insert journal photos"
  on public.journal_photos for insert
  with check (
    exists (
      select 1 from public.journal_entries e
      join public.trips on trips.id = e.trip_id
      where e.id = entry_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete journal photos"
  on public.journal_photos for delete
  using (
    exists (
      select 1 from public.journal_entries e
      join public.trips on trips.id = e.trip_id
      where e.id = journal_photos.entry_id
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

-- ── Storage bucket: trip-photos ──────────────────────────────────────────────
-- Public read (photos are shown via public URLs); writes restricted to trip
-- members. Object paths follow `{trip_id}/{uuid}.jpg`.
insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', true)
on conflict (id) do nothing;

create policy "Trip members can upload trip photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and exists (
      select 1 from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

create policy "Trip members can delete trip photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-photos'
    and exists (
      select 1 from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and (trips.owner_id = auth.uid() or trips.collaborator_id = auth.uid())
    )
  );

-- Realtime (optional, keeps journal in sync between partners)
alter publication supabase_realtime add table public.journal_entries;
alter publication supabase_realtime add table public.journal_photos;
