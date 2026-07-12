-- Make trip_members the sole collaboration and authorization model.
-- collaborator_id remains in place for backwards-compatible reads, but is no
-- longer used for access checks. This supports any number of co-planners.

-- Some early installations used 000_full_schema.sql, which did not create
-- this table. Create it here so the migration works for both schema histories.
create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

alter table public.trip_members enable row level security;

-- Existing trips become members-first before the policies below take effect.
insert into public.trip_members (trip_id, user_id, role)
select id, owner_id, 'owner'
from public.trips
where owner_id is not null
on conflict (trip_id, user_id) do update set role = excluded.role;

insert into public.trip_members (trip_id, user_id, role)
select id, collaborator_id, 'editor'
from public.trips
where collaborator_id is not null
on conflict (trip_id, user_id) do nothing;

-- SECURITY DEFINER helpers avoid recursive RLS lookups on trip_members.
create or replace function public.is_trip_member(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = target_trip_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_editor(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = target_trip_id
      and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

create or replace function public.is_trip_owner(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = target_trip_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

revoke all on function public.is_trip_member(uuid) from public;
revoke all on function public.is_trip_editor(uuid) from public;
revoke all on function public.is_trip_owner(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_editor(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;

-- Every newly-created trip immediately gets its owner membership, regardless
-- of whether it was created by the wizard, Explore, or an API route.
create or replace function public.add_trip_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do update set role = excluded.role;
  return new;
end;
$$;

drop trigger if exists trips_add_owner_membership on public.trips;
create trigger trips_add_owner_membership
  after insert on public.trips
  for each row execute procedure public.add_trip_owner_membership();

-- Invite codes are resolved server-side so a user cannot add themselves to an
-- arbitrary trip by guessing its UUID.
create or replace function public.join_trip_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into target_trip_id
  from public.trips
  where upper(invite_code) = upper(trim(p_invite_code));

  if target_trip_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (target_trip_id, auth.uid(), 'editor')
  on conflict (trip_id, user_id) do nothing;

  return target_trip_id;
end;
$$;

revoke all on function public.join_trip_by_invite(text) from public;
grant execute on function public.join_trip_by_invite(text) to authenticated;

-- Trips and members
drop policy if exists "Trip members can view trips" on public.trips;
drop policy if exists "Authenticated users can create trips" on public.trips;
drop policy if exists "Trip owners can update trips" on public.trips;
drop policy if exists "Trip members can update trips" on public.trips;
drop policy if exists "Trip owners can delete trips" on public.trips;

create policy "Trip members can view trips" on public.trips for select
  using (public.is_trip_member(id));
create policy "Authenticated users can create trips" on public.trips for insert
  with check (auth.uid() = owner_id);
create policy "Trip owners can update trips" on public.trips for update
  using (public.is_trip_owner(id))
  with check (auth.uid() = owner_id);
create policy "Trip owners can delete trips" on public.trips for delete
  using (public.is_trip_owner(id));

drop policy if exists "Trip members can view members" on public.trip_members;
drop policy if exists "Trip owners can manage members" on public.trip_members;
drop policy if exists "Users can join trips via invite" on public.trip_members;

create policy "Trip members can view members" on public.trip_members for select
  using (public.is_trip_member(trip_id));
create policy "Trip owners can add members" on public.trip_members for insert
  with check (public.is_trip_owner(trip_id));
create policy "Trip owners can update members" on public.trip_members for update
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));
create policy "Trip owners can remove members" on public.trip_members for delete
  using (public.is_trip_owner(trip_id));

-- A member may see the lightweight profile of people who share one of their
-- trips. This powers collaborator names and avatars without opening profiles
-- globally.
drop policy if exists "Users can view any profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Trip members can view shared profiles" on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.trip_members
      where user_id = profiles.id
        and public.is_trip_member(trip_id)
    )
  );

-- Route planning data: viewers read, owners and editors collaborate.
drop policy if exists "Trip members can view stops" on public.stops;
drop policy if exists "Trip members can insert stops" on public.stops;
drop policy if exists "Trip members can update stops" on public.stops;
drop policy if exists "Trip members can delete stops" on public.stops;
create policy "Trip members can view stops" on public.stops for select
  using (public.is_trip_member(trip_id));
create policy "Trip editors can insert stops" on public.stops for insert
  with check (public.is_trip_editor(trip_id));
create policy "Trip editors can update stops" on public.stops for update
  using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));
create policy "Trip editors can delete stops" on public.stops for delete
  using (public.is_trip_editor(trip_id));

drop policy if exists "Trip members can view expenses" on public.expenses;
drop policy if exists "Trip members can insert expenses" on public.expenses;
drop policy if exists "Trip members can delete expenses" on public.expenses;
create policy "Trip members can view expenses" on public.expenses for select
  using (public.is_trip_member(trip_id));
create policy "Trip editors can insert expenses" on public.expenses for insert
  with check (public.is_trip_editor(trip_id));
create policy "Trip editors can delete expenses" on public.expenses for delete
  using (public.is_trip_editor(trip_id));

-- These product modules were introduced after the base schema. Upgrade their
-- policies when their table is present, without blocking older installations.
do $$
begin
  if to_regclass('public.packing_items') is not null then
    execute 'drop policy if exists "Trip members can view packing items" on public.packing_items';
    execute 'drop policy if exists "Trip members can insert packing items" on public.packing_items';
    execute 'drop policy if exists "Trip members can update packing items" on public.packing_items';
    execute 'drop policy if exists "Trip members can delete packing items" on public.packing_items';
    execute 'create policy "Trip members can view packing items" on public.packing_items for select using (public.is_trip_member(trip_id))';
    execute 'create policy "Trip editors can insert packing items" on public.packing_items for insert with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can update packing items" on public.packing_items for update using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can delete packing items" on public.packing_items for delete using (public.is_trip_editor(trip_id))';
  end if;

  if to_regclass('public.journal_entries') is not null then
    execute 'drop policy if exists "Trip members can view journal entries" on public.journal_entries';
    execute 'drop policy if exists "Trip members can insert journal entries" on public.journal_entries';
    execute 'drop policy if exists "Trip members can update journal entries" on public.journal_entries';
    execute 'drop policy if exists "Trip members can delete journal entries" on public.journal_entries';
    execute 'create policy "Trip members can view journal entries" on public.journal_entries for select using (public.is_trip_member(trip_id))';
    execute 'create policy "Trip editors can insert journal entries" on public.journal_entries for insert with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can update journal entries" on public.journal_entries for update using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can delete journal entries" on public.journal_entries for delete using (public.is_trip_editor(trip_id))';
  end if;

  if to_regclass('public.activities') is not null then
    execute 'drop policy if exists "Trip members can view activities" on public.activities';
    execute 'drop policy if exists "Trip members can insert activities" on public.activities';
    execute 'drop policy if exists "Trip members can update activities" on public.activities';
    execute 'drop policy if exists "Trip members can delete activities" on public.activities';
    execute 'create policy "Trip members can view activities" on public.activities for select using (public.is_trip_member(trip_id))';
    execute 'create policy "Trip editors can insert activities" on public.activities for insert with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can update activities" on public.activities for update using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can delete activities" on public.activities for delete using (public.is_trip_editor(trip_id))';
  end if;
end $$;

-- Legacy planning tables still use the same membership model until they are
-- retired, so older API routes cannot bypass co-op permissions.
do $$
begin
  if to_regclass('public.pins') is not null then
    execute 'drop policy if exists "Trip members can view pins" on public.pins';
    execute 'drop policy if exists "Trip editors can create pins" on public.pins';
    execute 'drop policy if exists "Trip editors can update pins" on public.pins';
    execute 'drop policy if exists "Trip editors can delete pins" on public.pins';
    execute 'create policy "Trip members can view pins" on public.pins for select using (public.is_trip_member(trip_id))';
    execute 'create policy "Trip editors can create pins" on public.pins for insert with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can update pins" on public.pins for update using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id))';
    execute 'create policy "Trip editors can delete pins" on public.pins for delete using (public.is_trip_editor(trip_id))';
  end if;

  if to_regclass('public.budget_items') is not null then
    execute 'drop policy if exists "Trip members can view budget" on public.budget_items';
    execute 'drop policy if exists "Trip editors can manage budget" on public.budget_items';
    execute 'create policy "Trip members can view budget" on public.budget_items for select using (public.is_trip_member(trip_id))';
    execute 'create policy "Trip editors can manage budget" on public.budget_items for all using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id))';
  end if;
end $$;

drop policy if exists "Trip members can view photos" on public.photos;
drop policy if exists "Trip members can insert photos" on public.photos;
drop policy if exists "Trip members can delete photos" on public.photos;
create policy "Trip members can view photos" on public.photos for select
  using (exists (
    select 1 from public.stops where stops.id = photos.stop_id and public.is_trip_member(stops.trip_id)
  ));
create policy "Trip editors can insert photos" on public.photos for insert
  with check (exists (
    select 1 from public.stops where stops.id = photos.stop_id and public.is_trip_editor(stops.trip_id)
  ));
create policy "Trip editors can delete photos" on public.photos for delete
  using (exists (
    select 1 from public.stops where stops.id = photos.stop_id and public.is_trip_editor(stops.trip_id)
  ));

do $$
begin
  if to_regclass('public.pin_photos') is not null then
    execute 'drop policy if exists "Trip members can view photos" on public.pin_photos';
    execute 'drop policy if exists "Trip editors can add photos" on public.pin_photos';
    execute 'drop policy if exists "Photo uploaders can delete their photos" on public.pin_photos';
    execute 'create policy "Trip members can view pin photos" on public.pin_photos for select using (exists (select 1 from public.pins where pins.id = pin_photos.pin_id and public.is_trip_member(pins.trip_id)))';
    execute 'create policy "Trip editors can add pin photos" on public.pin_photos for insert with check (exists (select 1 from public.pins where pins.id = pin_photos.pin_id and public.is_trip_editor(pins.trip_id)))';
    execute 'create policy "Trip editors can delete pin photos" on public.pin_photos for delete using (exists (select 1 from public.pins where pins.id = pin_photos.pin_id and public.is_trip_editor(pins.trip_id)))';
  end if;
end $$;

-- Journal photos and the bucket use the parent entry's trip membership.
do $$
begin
  if to_regclass('public.journal_photos') is not null then
    execute 'drop policy if exists "Trip members can view journal photos" on public.journal_photos';
    execute 'drop policy if exists "Trip members can insert journal photos" on public.journal_photos';
    execute 'drop policy if exists "Trip members can delete journal photos" on public.journal_photos';
    execute 'create policy "Trip members can view journal photos" on public.journal_photos for select using (exists (select 1 from public.journal_entries e where e.id = entry_id and public.is_trip_member(e.trip_id)))';
    execute 'create policy "Trip editors can insert journal photos" on public.journal_photos for insert with check (exists (select 1 from public.journal_entries e where e.id = entry_id and public.is_trip_editor(e.trip_id)))';
    execute 'create policy "Trip editors can delete journal photos" on public.journal_photos for delete using (exists (select 1 from public.journal_entries e where e.id = entry_id and public.is_trip_editor(e.trip_id)))';
  end if;
end $$;

drop policy if exists "Trip members can upload trip photos" on storage.objects;
drop policy if exists "Trip members can delete trip photos" on storage.objects;
create policy "Trip editors can upload trip photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and public.is_trip_editor((storage.foldername(name))[1]::uuid)
  );
create policy "Trip editors can delete trip photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-photos'
    and public.is_trip_editor((storage.foldername(name))[1]::uuid)
  );
