-- Projects created after Supabase's explicit Data API exposure change no
-- longer receive broad table grants automatically. Declare the active client
-- surface explicitly and keep anonymous users away from all trip data.
revoke all on table public.profiles from anon;
revoke all on table public.trips from anon;
revoke all on table public.trip_members from anon;
revoke all on table public.stops from anon;
revoke all on table public.packing_items from anon;
revoke all on table public.expenses from anon;
revoke all on table public.journal_entries from anon;
revoke all on table public.journal_photos from anon;
revoke all on table public.trip_realtime_deletes from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.trip_members to authenticated;
grant select, insert, update, delete on table public.stops to authenticated;
grant select, insert, update, delete on table public.packing_items to authenticated;
grant select, insert, delete on table public.expenses to authenticated;
grant select, insert, update, delete on table public.journal_entries to authenticated;
grant select, insert, delete on table public.journal_photos to authenticated;
grant select on table public.trip_realtime_deletes to authenticated;

-- Harden the auth trigger function inherited from the historical baselines.
-- Trigger execution does not require clients to have direct EXECUTE access.
alter function public.handle_new_user() set search_path = public;
revoke all on function public.handle_new_user() from public;

-- Make the profile row invariant explicit instead of relying on PostgreSQL's
-- implicit reuse of USING when WITH CHECK is omitted.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deleting auth.users cascades through profiles. Attribution columns must not
-- prevent a traveler from deleting their account merely because they added an
-- item to a trip owned by somebody else. The content remains with the shared
-- trip while its former author/payer becomes anonymous.
do $$
declare
  target record;
begin
  for target in
    select * from (values
      ('stops', 'created_by', 'stops_created_by_fkey'),
      ('expenses', 'paid_by', 'expenses_paid_by_fkey'),
      ('photos', 'uploaded_by', 'photos_uploaded_by_fkey'),
      ('packing_items', 'created_by', 'packing_items_created_by_fkey'),
      ('activities', 'created_by', 'activities_created_by_fkey'),
      ('journal_entries', 'created_by', 'journal_entries_created_by_fkey'),
      ('journal_photos', 'uploaded_by', 'journal_photos_uploaded_by_fkey'),
      ('pins', 'created_by', 'pins_created_by_fkey'),
      ('pin_photos', 'uploaded_by', 'pin_photos_uploaded_by_fkey'),
      ('budget_items', 'created_by', 'budget_items_created_by_fkey')
    ) as columns_to_update(table_name, column_name, constraint_name)
  loop
    if to_regclass(format('public.%I', target.table_name)) is not null then
      execute format(
        'alter table public.%I drop constraint if exists %I',
        target.table_name,
        target.constraint_name
      );
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
        target.table_name,
        target.constraint_name,
        target.column_name
      );
    end if;
  end loop;
end $$;
