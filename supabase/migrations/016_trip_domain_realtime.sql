-- Scope collaborative trip-domain changes without leaking cross-trip deletes.
-- Postgres Changes cannot filter DELETE events, so row deletes are represented
-- by a compact RLS-protected signal that still carries trip_id.

create table if not exists public.trip_realtime_deletes (
  trip_id uuid not null,
  table_name text not null
    check (table_name in ('stops', 'packing_items', 'expenses', 'journal_entries')),
  row_id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (trip_id, table_name, row_id)
);

create index if not exists trip_realtime_deletes_trip_id_idx
  on public.trip_realtime_deletes (trip_id);

alter table public.trip_realtime_deletes enable row level security;

drop policy if exists "Trip members can view realtime delete signals"
  on public.trip_realtime_deletes;
create policy "Trip members can view realtime delete signals"
  on public.trip_realtime_deletes for select
  to authenticated
  using (public.is_trip_member(trip_id));

revoke all on public.trip_realtime_deletes from anon;
revoke all on public.trip_realtime_deletes from authenticated;
grant select on public.trip_realtime_deletes to authenticated;

create or replace function public.signal_trip_domain_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name not in ('stops', 'packing_items', 'expenses', 'journal_entries') then
    raise exception 'Unsupported realtime delete source: %', tg_table_name;
  end if;

  insert into public.trip_realtime_deletes (trip_id, table_name, row_id, deleted_at)
  values (old.trip_id, tg_table_name, old.id, now())
  on conflict (trip_id, table_name, row_id)
  do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;

revoke all on function public.signal_trip_domain_delete() from public;
revoke all on function public.signal_trip_domain_delete() from anon;
revoke all on function public.signal_trip_domain_delete() from authenticated;

drop trigger if exists stops_signal_realtime_delete on public.stops;
create trigger stops_signal_realtime_delete
  after delete on public.stops
  for each row execute function public.signal_trip_domain_delete();

drop trigger if exists packing_items_signal_realtime_delete on public.packing_items;
create trigger packing_items_signal_realtime_delete
  after delete on public.packing_items
  for each row execute function public.signal_trip_domain_delete();

drop trigger if exists expenses_signal_realtime_delete on public.expenses;
create trigger expenses_signal_realtime_delete
  after delete on public.expenses
  for each row execute function public.signal_trip_domain_delete();

drop trigger if exists journal_entries_signal_realtime_delete on public.journal_entries;
create trigger journal_entries_signal_realtime_delete
  after delete on public.journal_entries
  for each row execute function public.signal_trip_domain_delete();

-- Migration histories differ between early installations. Ensure every table
-- this client subscribes to is present without failing on an existing entry.
do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'stops',
    'packing_items',
    'expenses',
    'journal_entries',
    'trip_realtime_deletes'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;
