-- Trip Readiness (Phase 10): shared packing upgrades + non-packing prep tasks.
--
-- Everything here is additive. `packing_items` keeps its shape (and all
-- existing rows) and gains collaboration fields; prep work that is not packing
-- (reservation follow-ups, documents, payments, vehicle checks, custom) lives
-- in the new `trip_tasks` table instead of being folded into one generic JSON
-- model. All items are trip-shared: RLS stays member-read / editor-mutate and
-- no private-checklist behavior is introduced.

-- ── packing_items: collaboration fields ──────────────────────────────────────
-- FKs are created as ON DELETE SET NULL from the start so account deletion
-- (see 20260716005552) needs no follow-up constraint surgery for these.
alter table public.packing_items
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists quantity integer not null default 1
    check (quantity >= 1 and quantity <= 99),
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  add column if not exists due_date date,
  add column if not exists scope text not null default 'everyone'
    check (scope in ('everyone', 'personal', 'shared')),
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists notes text check (notes is null or length(notes) <= 2000),
  -- Manual ordering inside a category. Null means "legacy row"; clients fall
  -- back to created_at so existing lists keep their order without a backfill.
  add column if not exists order_index double precision,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists packing_items_assigned_to_idx
  on public.packing_items (assigned_to);

drop trigger if exists packing_items_updated_at on public.packing_items;
create trigger packing_items_updated_at
  before update on public.packing_items
  for each row execute procedure public.handle_updated_at();

-- ── trip_tasks: non-packing prep checklist ───────────────────────────────────
-- 'packing' is allowed in the category check for a possible future
-- consolidation, but the app keeps packing rows in packing_items and never
-- writes trip_tasks with category 'packing' today.
create table if not exists public.trip_tasks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  category text not null
    check (category in ('packing', 'reservation', 'document', 'payment', 'vehicle', 'custom')),
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  done boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  due_date date,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  order_index double precision,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_tasks_trip_category_idx
  on public.trip_tasks (trip_id, category);
create index if not exists trip_tasks_assigned_to_idx
  on public.trip_tasks (assigned_to);
create index if not exists trip_tasks_created_by_idx
  on public.trip_tasks (created_by);

drop trigger if exists trip_tasks_updated_at on public.trip_tasks;
create trigger trip_tasks_updated_at
  before update on public.trip_tasks
  for each row execute procedure public.handle_updated_at();

alter table public.trip_tasks enable row level security;

drop policy if exists "Trip members can view trip tasks" on public.trip_tasks;
drop policy if exists "Trip editors can insert trip tasks" on public.trip_tasks;
drop policy if exists "Trip editors can update trip tasks" on public.trip_tasks;
drop policy if exists "Trip editors can delete trip tasks" on public.trip_tasks;

create policy "Trip members can view trip tasks" on public.trip_tasks
  for select using (public.is_trip_member(trip_id));
create policy "Trip editors can insert trip tasks" on public.trip_tasks
  for insert with check (public.is_trip_editor(trip_id));
create policy "Trip editors can update trip tasks" on public.trip_tasks
  for update using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));
create policy "Trip editors can delete trip tasks" on public.trip_tasks
  for delete using (public.is_trip_editor(trip_id));

revoke all on table public.trip_tasks from anon;
revoke all on table public.trip_tasks from authenticated;
grant select, insert, update, delete on table public.trip_tasks to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Same contract as the other trip domains: INSERT/UPDATE flow through the
-- trip-filtered channel; DELETE goes through the trip-scoped signal table.
alter table public.trip_realtime_deletes
  drop constraint if exists trip_realtime_deletes_table_name_check;
alter table public.trip_realtime_deletes
  add constraint trip_realtime_deletes_table_name_check
  check (table_name in (
    'stops', 'packing_items', 'expenses', 'journal_entries',
    'itinerary_items', 'reservations', 'expense_splits', 'settlements',
    'trip_tasks'
  ));

create or replace function public.signal_trip_domain_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name not in (
    'stops', 'packing_items', 'expenses', 'journal_entries',
    'itinerary_items', 'reservations', 'expense_splits', 'settlements',
    'trip_tasks'
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

revoke all on function public.signal_trip_domain_delete() from public;
revoke all on function public.signal_trip_domain_delete() from anon;
revoke all on function public.signal_trip_domain_delete() from authenticated;

drop trigger if exists trip_tasks_signal_realtime_delete on public.trip_tasks;
create trigger trip_tasks_signal_realtime_delete
  after delete on public.trip_tasks
  for each row execute function public.signal_trip_domain_delete();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trip_tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_tasks';
  end if;
end $$;
