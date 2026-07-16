-- Journal media is private. Existing object names remain unchanged
-- (`{trip_id}/{uuid}.jpg`), so no object copy or journal_photos rewrite is
-- required when this migration is applied.
update storage.buckets
set public = false
where id = 'trip-photos';

-- Recreate every policy owned by this feature so repeated schema histories
-- (011 alone, or 011 followed by 012) converge on the same authorization.
drop policy if exists "Trip members can upload trip photos" on storage.objects;
drop policy if exists "Trip members can delete trip photos" on storage.objects;
drop policy if exists "Trip editors can upload trip photos" on storage.objects;
drop policy if exists "Trip editors can update trip photos" on storage.objects;
drop policy if exists "Trip editors can delete trip photos" on storage.objects;
drop policy if exists "Trip members can view trip photos" on storage.objects;

create policy "Trip members can view trip photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-photos'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_member(trips.id)
    )
  );

create policy "Trip editors can upload trip photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

-- The client does not currently upsert, but declaring UPDATE explicitly keeps
-- future replacements editor-scoped (Storage upsert requires SELECT too).
create policy "Trip editors can update trip photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-photos'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  )
  with check (
    bucket_id = 'trip-photos'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

create policy "Trip editors can delete trip photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-photos'
    and exists (
      select 1
      from public.trips
      where trips.id::text = (storage.foldername(name))[1]
        and public.is_trip_editor(trips.id)
    )
  );

-- Data API privileges are a separate gate from RLS on projects using the new
-- explicit-exposure defaults. Anonymous users do not need journal table access.
revoke all on table public.journal_entries from anon;
revoke all on table public.journal_photos from anon;
grant select, insert, update, delete on table public.journal_entries to authenticated;
grant select, insert, update, delete on table public.journal_photos to authenticated;
