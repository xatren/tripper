-- Mobile collaboration: private Presence authorization, entity comments,
-- meaningful activity, and invariant-safe member administration.
--
-- Realtime strategy: keep the existing filtered Postgres Changes transport
-- for this small-group product. Supabase documents per-subscriber auth cost
-- and recommends Broadcast around 3,000+ concurrent subscribers. The client
-- keeps its transport behind TripRealtimeProvider so that migration remains
-- possible without rewriting feature consumers.

-- -------------------------------------------------------------------------
-- Comments and structured mentions

create table public.trip_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'trip', 'stop', 'itinerary_item', 'reservation', 'expense',
    'packing_item', 'journal_entry', 'trip_task'
  )),
  entity_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.trip_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trip_comments_entity_page_idx
  on public.trip_comments (trip_id, entity_type, entity_id, created_at desc, id desc);
create index trip_comments_parent_idx on public.trip_comments (parent_id)
  where parent_id is not null;

create table public.trip_comment_mentions (
  comment_id uuid not null references public.trip_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create or replace function public.validate_trip_comment_entity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entity_trip_id uuid;
  parent_row public.trip_comments%rowtype;
begin
  if tg_op = 'INSERT' and new.created_by is distinct from (select auth.uid()) then
    raise exception 'Comment author must be the authenticated user';
  end if;
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by
       or new.trip_id is distinct from old.trip_id
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.parent_id is distinct from old.parent_id then
      raise exception 'Comment thread and author are immutable';
    end if;
  end if;

  case new.entity_type
    when 'trip' then entity_trip_id := new.entity_id;
    when 'stop' then select trip_id into entity_trip_id from public.stops where id = new.entity_id;
    when 'itinerary_item' then select trip_id into entity_trip_id from public.itinerary_items where id = new.entity_id;
    when 'reservation' then select trip_id into entity_trip_id from public.reservations where id = new.entity_id;
    when 'expense' then select trip_id into entity_trip_id from public.expenses where id = new.entity_id;
    when 'packing_item' then select trip_id into entity_trip_id from public.packing_items where id = new.entity_id;
    when 'journal_entry' then select trip_id into entity_trip_id from public.journal_entries where id = new.entity_id;
    when 'trip_task' then select trip_id into entity_trip_id from public.trip_tasks where id = new.entity_id;
    else raise exception 'Unsupported comment entity';
  end case;

  if entity_trip_id is null or entity_trip_id <> new.trip_id then
    raise exception 'Comment entity does not belong to this trip';
  end if;

  if new.parent_id is not null then
    select * into parent_row from public.trip_comments where id = new.parent_id;
    if not found
       or parent_row.trip_id <> new.trip_id
       or parent_row.entity_type <> new.entity_type
       or parent_row.entity_id <> new.entity_id then
      raise exception 'Parent comment belongs to another thread';
    end if;
  end if;

  new.body := trim(new.body);
  new.updated_at := now();
  return new;
end;
$$;

create trigger trip_comments_validate_entity
  before insert or update on public.trip_comments
  for each row execute function public.validate_trip_comment_entity();

create or replace function public.validate_trip_comment_mention()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  comment_trip_id uuid;
  comment_author uuid;
begin
  select trip_id, created_by into comment_trip_id, comment_author
  from public.trip_comments where id = new.comment_id;
  if comment_author is distinct from (select auth.uid())
     or not public.is_trip_member(comment_trip_id)
     or not exists (
       select 1 from public.trip_members
       where trip_id = comment_trip_id and user_id = new.user_id
     ) then
    raise exception 'Invalid comment mention';
  end if;
  return new;
end;
$$;

create trigger trip_comment_mentions_validate
  before insert on public.trip_comment_mentions
  for each row execute function public.validate_trip_comment_mention();

alter table public.trip_comments enable row level security;
alter table public.trip_comment_mentions enable row level security;

create policy "Trip members can read comments" on public.trip_comments for select
  to authenticated using (public.is_trip_member(trip_id));
create policy "Trip editors can create comments" on public.trip_comments for insert
  to authenticated with check (
    public.is_trip_editor(trip_id) and created_by = (select auth.uid())
  );
create policy "Authors or owners can update comments" on public.trip_comments for update
  to authenticated
  using (public.is_trip_member(trip_id) and (created_by = (select auth.uid()) or public.is_trip_owner(trip_id)))
  with check (public.is_trip_member(trip_id) and (created_by = (select auth.uid()) or public.is_trip_owner(trip_id)));
create policy "Authors or owners can delete comments" on public.trip_comments for delete
  to authenticated using (
    public.is_trip_member(trip_id) and (created_by = (select auth.uid()) or public.is_trip_owner(trip_id))
  );

create policy "Trip members can read mentions" on public.trip_comment_mentions for select
  to authenticated using (exists (
    select 1 from public.trip_comments c
    where c.id = comment_id and public.is_trip_member(c.trip_id)
  ));
create policy "Comment authors can add mentions" on public.trip_comment_mentions for insert
  to authenticated with check (exists (
    select 1 from public.trip_comments c
    where c.id = comment_id and c.created_by = (select auth.uid()) and public.is_trip_editor(c.trip_id)
  ));
create policy "Comment authors can remove mentions" on public.trip_comment_mentions for delete
  to authenticated using (exists (
    select 1 from public.trip_comments c
    where c.id = comment_id and c.created_by = (select auth.uid()) and public.is_trip_member(c.trip_id)
  ));

revoke all on public.trip_comments, public.trip_comment_mentions from anon;
grant select, insert, update, delete on public.trip_comments to authenticated;
grant select, insert, delete on public.trip_comment_mentions to authenticated;

-- -------------------------------------------------------------------------
-- Meaningful activity only (never text-field keystrokes)

create table public.trip_activity (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  event_type text not null check (event_type in (
    'item_created', 'item_moved', 'item_completed', 'reservation_created',
    'reservation_status_changed', 'member_joined', 'member_role_changed',
    'member_removed', 'invite_rotated', 'comment_created'
  )),
  entity_type text,
  entity_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index trip_activity_page_idx on public.trip_activity (trip_id, created_at desc, id desc);
create index trip_activity_expiry_idx on public.trip_activity (expires_at);
alter table public.trip_activity enable row level security;
create policy "Trip members can read activity" on public.trip_activity for select
  to authenticated using (public.is_trip_member(trip_id) and expires_at > now());
revoke all on public.trip_activity from anon, authenticated;
grant select on public.trip_activity to authenticated;

create or replace function public.record_trip_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_event text;
  v_entity_type text;
  v_entity_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'itinerary_items' then
    v_trip_id := coalesce(new.trip_id, old.trip_id);
    v_entity_type := 'itinerary_item';
    v_entity_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then v_event := 'item_created';
    elsif new.status = 'completed' and old.status is distinct from new.status then
      v_event := 'item_completed';
    elsif old.local_date is distinct from new.local_date or old.order_index is distinct from new.order_index then
      v_event := 'item_moved';
      v_metadata := jsonb_build_object('from_date', old.local_date, 'to_date', new.local_date);
    else return new;
    end if;
  elsif tg_table_name = 'reservations' then
    v_trip_id := coalesce(new.trip_id, old.trip_id);
    v_entity_type := 'reservation';
    v_entity_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then v_event := 'reservation_created';
    elsif old.status is distinct from new.status then
      v_event := 'reservation_status_changed';
      v_metadata := jsonb_build_object('from', old.status, 'to', new.status);
    else return new;
    end if;
  elsif tg_table_name = 'trip_members' then
    v_trip_id := coalesce(new.trip_id, old.trip_id);
    v_entity_type := 'member';
    v_entity_id := coalesce(new.user_id, old.user_id);
    if tg_op = 'INSERT' then v_event := 'member_joined';
    elsif tg_op = 'DELETE' then v_event := 'member_removed';
    elsif old.role is distinct from new.role then
      v_event := 'member_role_changed';
      v_metadata := jsonb_build_object('from', old.role, 'to', new.role);
    else return new;
    end if;
  elsif tg_table_name = 'trip_comments' then
    v_trip_id := new.trip_id;
    v_event := 'comment_created';
    v_entity_type := new.entity_type;
    v_entity_id := new.entity_id;
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  delete from public.trip_activity where expires_at <= now();
  insert into public.trip_activity (trip_id, event_type, entity_type, entity_id, actor_id, metadata)
  values (v_trip_id, v_event, v_entity_type, v_entity_id, (select auth.uid()), v_metadata);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger itinerary_items_record_activity
  after insert or update on public.itinerary_items
  for each row execute function public.record_trip_activity();
create trigger reservations_record_activity
  after insert or update on public.reservations
  for each row execute function public.record_trip_activity();
create trigger trip_members_record_activity
  after insert or update or delete on public.trip_members
  for each row execute function public.record_trip_activity();
create trigger trip_comments_record_activity
  after insert on public.trip_comments
  for each row execute function public.record_trip_activity();

revoke all on function public.record_trip_activity() from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Atomic member management and invite rotation

create or replace function public.manage_trip_member(
  p_trip_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_role text;
  owner_count integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.trips where id = p_trip_id for update;
  if not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = caller_id and role = 'owner'
  ) then raise exception 'Only a trip owner can manage members'; end if;

  select role into target_role from public.trip_members
  where trip_id = p_trip_id and user_id = p_target_user_id for update;
  if target_role is null then raise exception 'Target is not a trip member'; end if;

  select count(*) into owner_count from public.trip_members
  where trip_id = p_trip_id and role = 'owner';

  if p_action = 'set_role' then
    if p_role not in ('owner', 'editor', 'viewer') then raise exception 'Invalid role'; end if;
    if target_role = 'owner' and p_role <> 'owner' and owner_count <= 1 then
      raise exception 'A trip must keep at least one owner';
    end if;
    update public.trip_members set role = p_role
    where trip_id = p_trip_id and user_id = p_target_user_id;
  elsif p_action = 'remove' then
    if target_role = 'owner' and owner_count <= 1 then
      raise exception 'The last owner cannot leave or be removed';
    end if;
    delete from public.trip_members
    where trip_id = p_trip_id and user_id = p_target_user_id;
  else
    raise exception 'Invalid member action';
  end if;
end;
$$;

create or replace function public.rotate_trip_invite(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_code text;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.trips where id = p_trip_id for update;
  if not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = caller_id and role = 'owner'
  ) then raise exception 'Only a trip owner can rotate the invite'; end if;

  loop
    next_code := upper(substr(md5(random()::text || clock_timestamp()::text || p_trip_id::text), 1, 8));
    exit when not exists (select 1 from public.trips where upper(invite_code) = next_code);
  end loop;

  perform set_config('tripper.invite_rotation', 'allowed', true);
  update public.trips set invite_code = next_code, updated_at = now() where id = p_trip_id;
  insert into public.trip_activity (trip_id, event_type, actor_id)
  values (p_trip_id, 'invite_rotated', caller_id);
  return next_code;
end;
$$;

revoke all on function public.manage_trip_member(uuid, uuid, text, text) from public, anon;
revoke all on function public.rotate_trip_invite(uuid) from public, anon;
grant execute on function public.manage_trip_member(uuid, uuid, text, text) to authenticated;
grant execute on function public.rotate_trip_invite(uuid) to authenticated;

-- Direct UPDATE/DELETE previously let owners bypass the last-owner invariant.
revoke insert, update, delete on public.trip_members from authenticated;

-- A second owner must be able to update the trip without becoming the legacy
-- trips.owner_id. owner_id itself remains immutable through WITH CHECK.
drop policy if exists "Trip owners can update trips" on public.trips;
create policy "Trip owners can update trips" on public.trips for update
  to authenticated using (public.is_trip_owner(id))
  with check (public.is_trip_owner(id));

create or replace function public.keep_legacy_trip_owner_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Use trip member roles to manage owners';
  end if;
  if new.invite_code is distinct from old.invite_code
     and current_setting('tripper.invite_rotation', true) is distinct from 'allowed' then
    raise exception 'Use rotate_trip_invite to change invite codes';
  end if;
  return new;
end;
$$;
drop trigger if exists trips_keep_legacy_owner_immutable on public.trips;
create trigger trips_keep_legacy_owner_immutable
  before update on public.trips
  for each row execute function public.keep_legacy_trip_owner_immutable();

-- -------------------------------------------------------------------------
-- Private trip Presence/Broadcast authorization. Payload fields are display
-- hints only; membership is always evaluated here from auth.uid().

drop policy if exists "Trip members can receive private realtime" on realtime.messages;
drop policy if exists "Trip members can send private realtime" on realtime.messages;
create policy "Trip members can receive private realtime"
  on realtime.messages for select to authenticated
  using (
    extension in ('presence', 'broadcast')
    and exists (
      select 1 from public.trip_members tm
      where tm.user_id = (select auth.uid())
        and realtime.topic() = 'trip:' || tm.trip_id::text
    )
  );
create policy "Trip members can send private realtime"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('presence', 'broadcast')
    and exists (
      select 1 from public.trip_members tm
      where tm.user_id = (select auth.uid())
        and realtime.topic() = 'trip:' || tm.trip_id::text
    )
  );

-- Add new collaboration rows to the existing publication once.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_comments') then
    alter publication supabase_realtime add table public.trip_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_activity') then
    alter publication supabase_realtime add table public.trip_activity;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_members') then
    alter publication supabase_realtime add table public.trip_members;
  end if;
end $$;

-- Reuse the compact delete-signal path because Postgres Changes DELETE
-- events cannot be filtered by trip_id.
alter table public.trip_realtime_deletes
  drop constraint if exists trip_realtime_deletes_table_name_check;
alter table public.trip_realtime_deletes
  add constraint trip_realtime_deletes_table_name_check
  check (table_name in (
    'stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items',
    'reservations', 'expense_splits', 'settlements', 'trip_tasks',
    'trip_comments', 'trip_members'
  ));

create or replace function public.signal_trip_domain_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name not in (
    'stops', 'packing_items', 'expenses', 'journal_entries', 'itinerary_items',
    'reservations', 'expense_splits', 'settlements', 'trip_tasks', 'trip_comments'
  ) then
    raise exception 'Unsupported realtime delete source: %', tg_table_name;
  end if;
  insert into public.trip_realtime_deletes (trip_id, table_name, row_id, deleted_at)
  values (old.trip_id, tg_table_name, old.id, now())
  on conflict (trip_id, table_name, row_id)
  do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;
revoke all on function public.signal_trip_domain_delete() from public, anon, authenticated;

create trigger trip_comments_signal_realtime_delete
  after delete on public.trip_comments
  for each row execute function public.signal_trip_domain_delete();

create or replace function public.signal_trip_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_realtime_deletes (trip_id, table_name, row_id, deleted_at)
  values (old.trip_id, 'trip_members', old.user_id, now())
  on conflict (trip_id, table_name, row_id)
  do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;
revoke all on function public.signal_trip_member_delete() from public, anon, authenticated;
create trigger trip_members_signal_realtime_delete
  after delete on public.trip_members
  for each row execute function public.signal_trip_member_delete();
