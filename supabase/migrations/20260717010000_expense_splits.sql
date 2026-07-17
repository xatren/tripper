-- Custom expense splits (Phase 8): equal/exact/percentage participant shares
-- on top of the existing always-equal-across-active-members budget tracker.
--
-- Additive only. Existing `expenses` rows get split_type='equal' and no
-- `expense_splits` rows, which the settlement layer (see budget-settlement.ts)
-- treats identically to today's live equal-split-across-active-members
-- behavior — old data and existing tests are unaffected.
--
-- Deliberate decisions:
--   * `expense_splits.share_amount_minor` (integer cents) is the single
--     source of truth consumed by settlement math, regardless of split type.
--     Percentage/exact math never touches binary floats.
--   * Clients never write `expense_splits` directly — only through
--     `save_expense_with_splits`, which re-validates that the shares sum to
--     the expense total server-side (the DB-side backstop for the
--     reconciliation invariant the client UI also enforces).
--   * `member_id` is ON DELETE SET NULL, mirroring `expenses.paid_by`'s
--     existing account-deletion contract; several splits on the same expense
--     can lose their member_id independently since Postgres treats multiple
--     NULLs as distinct under the unique constraint.

alter table public.expenses
  add column if not exists split_type text not null default 'equal'
    check (split_type in ('equal', 'exact', 'percentage')),
  add column if not exists expense_date date,
  add column if not exists itinerary_item_id uuid references public.itinerary_items(id) on delete set null;

-- Backfill existing rows with a sensible date, then lock the column NOT NULL.
update public.expenses set expense_date = created_at::date where expense_date is null;
alter table public.expenses alter column expense_date set default current_date;
alter table public.expenses alter column expense_date set not null;

create index if not exists expenses_itinerary_item_idx
  on public.expenses (itinerary_item_id);

-- ── expense_splits ───────────────────────────────────────────────────────────
create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  -- Percentage (0-100) when split_type='percentage'; null for equal/exact.
  share_value numeric(9, 4),
  share_amount_minor integer not null check (share_amount_minor >= 0),
  created_at timestamptz not null default now(),
  unique (expense_id, member_id)
);

create index if not exists expense_splits_expense_idx
  on public.expense_splits (expense_id);
create index if not exists expense_splits_member_idx
  on public.expense_splits (member_id);

alter table public.expense_splits enable row level security;

drop policy if exists "Trip members can view expense splits" on public.expense_splits;
create policy "Trip members can view expense splits" on public.expense_splits
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_splits.expense_id
        and public.is_trip_member(e.trip_id)
    )
  );

-- No client INSERT/UPDATE/DELETE policy: all writes go through
-- save_expense_with_splits (SECURITY DEFINER), which enforces the sum
-- invariant and current-membership check no RLS predicate alone can express.
revoke all on table public.expense_splits from anon;
revoke all on table public.expense_splits from authenticated;
grant select on table public.expense_splits to authenticated;

-- ── save_expense_with_splits ─────────────────────────────────────────────────
-- Atomic write: upserts the expense row and replaces its splits in one
-- transaction (immutable-by-replacement, same idiom as attachment tables).
-- p_splits: jsonb array of {member_id, share_value, share_amount_minor}.
create or replace function public.save_expense_with_splits(
  p_trip_id uuid,
  p_expense_id uuid default null,
  p_category text default 'other',
  p_description text default null,
  p_amount numeric default 0,
  p_paid_by uuid default null,
  p_expense_date date default current_date,
  p_itinerary_item_id uuid default null,
  p_split_type text default 'equal',
  p_splits jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_amount_minor bigint;
  v_splits_sum bigint;
  v_splits_count int;
  v_member_count int;
begin
  if not public.is_trip_editor(p_trip_id) then
    raise exception 'Not authorized to edit expenses on this trip';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Expense amount must be zero or greater';
  end if;
  if p_split_type not in ('equal', 'exact', 'percentage') then
    raise exception 'Invalid split_type: %', p_split_type;
  end if;

  v_amount_minor := round(p_amount * 100);
  v_splits_count := jsonb_array_length(coalesce(p_splits, '[]'::jsonb));

  if v_splits_count > 0 then
    select coalesce(sum((s->>'share_amount_minor')::bigint), 0)
    into v_splits_sum
    from jsonb_array_elements(p_splits) as s;

    if v_splits_sum <> v_amount_minor then
      raise exception 'Split shares (%) must sum to the expense total (%)', v_splits_sum, v_amount_minor;
    end if;

    select count(*) into v_member_count
    from jsonb_array_elements(p_splits) as s
    where (s->>'member_id')::uuid is not null
      and not exists (
        select 1 from public.trip_members tm
        where tm.trip_id = p_trip_id and tm.user_id = (s->>'member_id')::uuid
      );
    if v_member_count > 0 then
      raise exception 'All split participants must be current trip members';
    end if;
  end if;

  if p_expense_id is null then
    insert into public.expenses (
      trip_id, category, description, amount, paid_by,
      expense_date, itinerary_item_id, split_type
    )
    values (
      p_trip_id, p_category, p_description, p_amount, p_paid_by,
      coalesce(p_expense_date, current_date), p_itinerary_item_id, p_split_type
    )
    returning id into v_expense_id;
  else
    update public.expenses set
      category = p_category,
      description = p_description,
      amount = p_amount,
      paid_by = p_paid_by,
      expense_date = coalesce(p_expense_date, current_date),
      itinerary_item_id = p_itinerary_item_id,
      split_type = p_split_type
    where id = p_expense_id and trip_id = p_trip_id
    returning id into v_expense_id;

    if v_expense_id is null then
      raise exception 'Expense not found on this trip';
    end if;
  end if;

  delete from public.expense_splits where expense_id = v_expense_id;

  insert into public.expense_splits (expense_id, member_id, share_value, share_amount_minor)
  select
    v_expense_id,
    (s->>'member_id')::uuid,
    (s->>'share_value')::numeric,
    (s->>'share_amount_minor')::integer
  from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) as s;

  return jsonb_build_object(
    'expense', (select to_jsonb(e) from public.expenses e where e.id = v_expense_id),
    'splits', (select coalesce(jsonb_agg(to_jsonb(sp)), '[]'::jsonb) from public.expense_splits sp where sp.expense_id = v_expense_id)
  );
end;
$$;

revoke all on function public.save_expense_with_splits(
  uuid, uuid, text, text, numeric, uuid, date, uuid, text, jsonb
) from public;
grant execute on function public.save_expense_with_splits(
  uuid, uuid, text, text, numeric, uuid, date, uuid, text, jsonb
) to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- expense_splits isn't hand-patched from Postgres-changes payloads (nested
-- embeds never arrive in them); clients just refetch the parent expense list
-- on any change signal for this table.
alter table public.trip_realtime_deletes
  drop constraint if exists trip_realtime_deletes_table_name_check;
alter table public.trip_realtime_deletes
  add constraint trip_realtime_deletes_table_name_check
  check (table_name in (
    'stops', 'packing_items', 'expenses', 'journal_entries',
    'itinerary_items', 'reservations', 'expense_splits', 'settlements'
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
    'itinerary_items', 'reservations', 'expense_splits', 'settlements'
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

-- expense_splits has no trip_id column of its own; resolve it via the parent
-- expense before signalling, so the delete-signal contract stays trip-scoped.
create or replace function public.signal_expense_split_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id from public.expenses where id = old.expense_id;
  if v_trip_id is not null then
    insert into public.trip_realtime_deletes (trip_id, table_name, row_id, deleted_at)
    values (v_trip_id, 'expense_splits', old.id, now())
    on conflict (trip_id, table_name, row_id)
    do update set deleted_at = excluded.deleted_at;
  end if;
  return old;
end;
$$;

revoke all on function public.signal_expense_split_delete() from public;
revoke all on function public.signal_expense_split_delete() from anon;
revoke all on function public.signal_expense_split_delete() from authenticated;

drop trigger if exists expense_splits_signal_realtime_delete on public.expense_splits;
create trigger expense_splits_signal_realtime_delete
  after delete on public.expense_splits
  for each row execute function public.signal_expense_split_delete();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expense_splits'
  ) then
    execute 'alter publication supabase_realtime add table public.expense_splits';
  end if;
end $$;
