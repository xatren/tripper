-- Functional RLS checks for the private Storage buckets (storage.objects
-- policies on 'trip-photos' and 'trip-documents'). Runs inside the
-- disposable transaction set up by run.mts, after _helpers.sql and
-- _fixtures.sql have created owner/editor/viewer/outsider/revoked, one
-- trip, and the two buckets. Every block raises on violation.
--
-- Both buckets were made non-public by 20260715231929_journal_photo_privacy.sql
-- (trip-photos) and were never public to begin with (trip-documents), so
-- "sensitive file access" here means: no anonymous/public URL access, and
-- object visibility/mutation follows the same trip_id-derived membership
-- gate as every other domain table (is_trip_member for reads,
-- is_trip_editor for writes).

-- 1. Uploading (INSERT) into trip-photos requires trip *editor* rights.
select tests.authenticate_as('editor');
insert into storage.objects (bucket_id, name)
values ('trip-photos', current_setting('tests.trip_id') || '/editor-photo.jpg');

select tests.authenticate_as('viewer');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('trip-photos', current_setting('tests.trip_id') || '/viewer-photo.jpg');
    raise exception 'a read-only viewer must not be able to upload a trip photo';
  exception when insufficient_privilege then
    null; -- expected: RLS WITH CHECK violation
  end;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('trip-photos', current_setting('tests.trip_id') || '/outsider-photo.jpg');
    raise exception 'an outsider must not be able to upload a photo into a trip they are not on';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

select tests.authenticate_as('revoked');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('trip-photos', current_setting('tests.trip_id') || '/revoked-photo.jpg');
    raise exception 'a removed member must not be able to upload a photo into their former trip';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- 2. Viewing (SELECT) trip-photos is NOT just trip membership: since
--    20260717233029_travel_mode_events.sql, a raw object in the bucket is
--    invisible to everyone (even the uploader's fellow trip members) until
--    it is linked through a journal_photos row, and even then only if that
--    entry's visibility is 'trip' (the default) or the viewer is its author
--    — "a private bucket policy must also prevent member-wide object
--    listing" per that migration's own comment. So a real view test has to
--    create that linkage the same way the app does, not just insert the
--    raw object and check bucket-wide membership.
do $$
declare
  v_entry_id uuid;
begin
  perform tests.authenticate_as('editor');
  insert into public.journal_entries (trip_id, note, created_by)
  values (current_setting('tests.trip_id')::uuid, 'Fixture journal entry', tests.user_id('editor'))
  returning id into v_entry_id;
  perform set_config('tests.journal_entry_id', v_entry_id::text, true);

  insert into public.journal_photos (entry_id, storage_path, uploaded_by)
  values (v_entry_id, current_setting('tests.trip_id') || '/editor-photo.jpg', tests.user_id('editor'));
end $$;

select tests.authenticate_as('viewer');
do $$ begin
  if (
    select count(*) from storage.objects
    where bucket_id = 'trip-photos' and name = current_setting('tests.trip_id') || '/editor-photo.jpg'
  ) <> 1 then
    raise exception 'a viewer (any current member) must be able to see a trip photo once linked via journal_photos with default (trip) visibility';
  end if;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  if (
    select count(*) from storage.objects
    where bucket_id = 'trip-photos' and name = current_setting('tests.trip_id') || '/editor-photo.jpg'
  ) <> 0 then
    raise exception 'an outsider must not be able to see a photo belonging to a trip they are not on';
  end if;
end $$;

select tests.authenticate_as('revoked');
do $$ begin
  if (
    select count(*) from storage.objects
    where bucket_id = 'trip-photos' and name = current_setting('tests.trip_id') || '/editor-photo.jpg'
  ) <> 0 then
    raise exception 'a removed member must lose visibility into trip photos immediately';
  end if;
end $$;

-- 3. Deleting a trip photo requires trip editor rights, regardless of who
--    originally uploaded it (ownership alone does not grant delete).
select tests.authenticate_as('viewer');
do $$ begin
  -- Unlike INSERT's WITH CHECK, a DELETE policy's USING clause fails
  -- *silently* — a non-matching row is just excluded (0 rows deleted), no
  -- exception raised. So the only reliable assertion is that the row is
  -- still there afterward, not that the statement itself errored. A
  -- grant-level denial (insufficient_privilege) would also be acceptable
  -- if grants ever tighten, so that path is tolerated too.
  begin
    delete from storage.objects
    where bucket_id = 'trip-photos' and name = current_setting('tests.trip_id') || '/editor-photo.jpg';
  exception when insufficient_privilege then
    null; -- also acceptable: a hard grant-level denial
  end;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'trip-photos' and name = current_setting('tests.trip_id') || '/editor-photo.jpg'
  ) then
    raise exception 'a viewer must not be able to delete a trip photo — the row must still exist afterward';
  end if;
end $$;

-- 4. trip-documents enforces an additional path-segment convention: uploads
--    must live under `{trip_id}/expenses/…` (expense receipts) or
--    `{trip_id}/reservations/…` — a bare `{trip_id}/…` path is rejected even
--    for a trip editor, so one feature cannot squat in another's namespace.
select tests.authenticate_as('editor');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('trip-documents', current_setting('tests.trip_id') || '/no-segment.pdf');
    raise exception 'an editor upload to trip-documents without a recognized path segment must be rejected';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

insert into storage.objects (bucket_id, name)
values ('trip-documents', current_setting('tests.trip_id') || '/expenses/receipt.pdf');

select tests.authenticate_as('viewer');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('trip-documents', current_setting('tests.trip_id') || '/expenses/viewer-receipt.pdf');
    raise exception 'a read-only viewer must not be able to upload an expense receipt';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- Viewing a receipt still only requires membership, same as trip-photos.
do $$ begin
  if (
    select count(*) from storage.objects
    where bucket_id = 'trip-documents' and name = current_setting('tests.trip_id') || '/expenses/receipt.pdf'
  ) <> 1 then
    raise exception 'a viewer (any current member) must be able to see an expense receipt uploaded by an editor';
  end if;
end $$;

select tests.authenticate_as('outsider');
do $$ begin
  if (
    select count(*) from storage.objects
    where bucket_id = 'trip-documents' and name = current_setting('tests.trip_id') || '/expenses/receipt.pdf'
  ) <> 0 then
    raise exception 'an outsider must not be able to see an expense receipt on a trip they are not on';
  end if;
end $$;

select 'private storage RLS contract holds' as result;
