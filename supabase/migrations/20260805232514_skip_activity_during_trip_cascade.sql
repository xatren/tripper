-- Deleting a trip cascades through trip_members. The collaboration triggers
-- must not create activity/delete-signal rows for a parent trip that is
-- already being removed; record_trip_activity's insert otherwise violates
-- trip_activity_trip_id_fkey and aborts the entire trip deletion.

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
  if tg_table_name = 'trip_members'
     and tg_op = 'DELETE'
     and not exists (select 1 from public.trips where id = old.trip_id) then
    return old;
  end if;

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

create or replace function public.signal_trip_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.trips where id = old.trip_id) then
    return old;
  end if;

  insert into public.trip_realtime_deletes (trip_id, table_name, row_id, deleted_at)
  values (old.trip_id, 'trip_members', old.user_id, now())
  on conflict (trip_id, table_name, row_id)
  do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;

revoke all on function public.record_trip_activity() from public, anon, authenticated;
revoke all on function public.signal_trip_member_delete() from public, anon, authenticated;
