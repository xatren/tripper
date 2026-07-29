-- RM-001: close settlement/expense finance invariants.
--
-- Gaps closed:
--   * settlements.from_member/to_member were never checked against
--     trip_members — an authenticated outsider or a party from another trip
--     could be recorded as a settlement counterparty.
--   * settlement amount was fully client-supplied with no server-side bound,
--     so a compromised/buggy client could record an arbitrarily large
--     "payment" with no relation to the trip's real spend.
--   * expenses.amount had no CHECK — a negative amount could flip the whole
--     trip's balance math.
--   * several SECURITY DEFINER functions used `set search_path = public`
--     instead of the empty/hardened form.
--
-- Expand-first rollout: new CHECK constraints are added NOT VALID (so they
-- gate all future writes immediately without failing on any pre-existing
-- dirty rows), preceded by a preflight report of any such rows. If the
-- automatic VALIDATE step below hits existing violations, the constraint is
-- left NOT VALID and a WARNING names the manual cleanup + re-validate step —
-- it does not silently drop the guard rail.

-- ── 1. Preflight report (read-only, never fails the migration) ─────────────
do $$
declare
  v_bad_expenses int;
  v_bad_settlement_same_party int;
  v_bad_settlement_outsiders int;
begin
  select count(*) into v_bad_expenses
  from public.expenses
  where amount < 0;

  select count(*) into v_bad_settlement_same_party
  from public.settlements
  where from_member is not null and to_member is not null and from_member = to_member;

  select count(*) into v_bad_settlement_outsiders
  from public.settlements s
  where (
    s.from_member is not null
    and not exists (
      select 1 from public.trip_members tm
      where tm.trip_id = s.trip_id and tm.user_id = s.from_member
    )
  ) or (
    s.to_member is not null
    and not exists (
      select 1 from public.trip_members tm
      where tm.trip_id = s.trip_id and tm.user_id = s.to_member
    )
  );

  if v_bad_expenses > 0 then
    raise warning 'RM-001 preflight: % expenses row(s) have amount < 0', v_bad_expenses;
  end if;
  if v_bad_settlement_same_party > 0 then
    raise warning 'RM-001 preflight: % settlements row(s) have from_member = to_member', v_bad_settlement_same_party;
  end if;
  if v_bad_settlement_outsiders > 0 then
    raise warning 'RM-001 preflight: % settlements row(s) reference a party who is not a current trip_members row for that trip', v_bad_settlement_outsiders;
  end if;
end $$;

-- ── 2. Expand-first CHECK constraints ───────────────────────────────────────
alter table public.expenses
  drop constraint if exists expenses_amount_non_negative;
alter table public.expenses
  add constraint expenses_amount_non_negative check (amount >= 0) not valid;

alter table public.settlements
  drop constraint if exists settlements_distinct_parties;
alter table public.settlements
  add constraint settlements_distinct_parties check (from_member is distinct from to_member) not valid;

do $$
begin
  begin
    alter table public.expenses validate constraint expenses_amount_non_negative;
  exception when check_violation then
    raise warning 'expenses_amount_non_negative left NOT VALID: existing negative-amount rows must be fixed, then run "alter table public.expenses validate constraint expenses_amount_non_negative;" manually';
  end;
end $$;

do $$
begin
  begin
    alter table public.settlements validate constraint settlements_distinct_parties;
  exception when check_violation then
    raise warning 'settlements_distinct_parties left NOT VALID: existing from_member = to_member rows must be fixed manually, then run "alter table public.settlements validate constraint settlements_distinct_parties;"';
  end;
end $$;

-- ── 3. Settlement membership + amount-bound invariant (insert-time trigger) ─
-- Runs on INSERT only: from_member/to_member/amount_minor are immutable by
-- design (see 20260717020000_settlements.sql) and only ever change via
-- reopen_settlement's status/reopened_at update, which must not be blocked
-- by a party later leaving the trip.
create or replace function public.validate_settlement_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trip_total_minor bigint;
begin
  if new.from_member is null or new.to_member is null then
    raise exception 'Settlement must reference both parties';
  end if;
  if new.from_member = new.to_member then
    raise exception 'Settlement must have distinct from/to members';
  end if;

  if not exists (
    select 1 from public.trip_members
    where trip_id = new.trip_id and user_id = new.from_member
  ) then
    raise exception 'from_member must be a current member of this trip';
  end if;
  if not exists (
    select 1 from public.trip_members
    where trip_id = new.trip_id and user_id = new.to_member
  ) then
    raise exception 'to_member must be a current member of this trip';
  end if;

  select coalesce(sum(round(amount * 100)), 0)
  into v_trip_total_minor
  from public.expenses
  where trip_id = new.trip_id;

  if new.amount_minor > v_trip_total_minor then
    raise exception 'Settlement amount (%) exceeds this trip''s total recorded expenses (%)', new.amount_minor, v_trip_total_minor;
  end if;

  return new;
end;
$$;

drop trigger if exists settlements_validate_invariants on public.settlements;
create trigger settlements_validate_invariants
  before insert on public.settlements
  for each row execute function public.validate_settlement_invariants();

-- ── 4. RPC hardening: search_path + membership checks moved earlier ────────
create or replace function public.record_settlement_payment(
  p_trip_id uuid,
  p_from_member uuid,
  p_to_member uuid,
  p_amount_minor integer,
  p_idempotency_key uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.settlements;
begin
  if not (
    public.is_trip_editor(p_trip_id)
    or auth.uid() = p_from_member
    or auth.uid() = p_to_member
  ) then
    raise exception 'Not authorized to record this settlement';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Settlement amount must be greater than zero';
  end if;
  if p_from_member is null or p_to_member is null or p_from_member = p_to_member then
    raise exception 'Settlement must have distinct from/to members';
  end if;
  if not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = p_from_member
  ) then
    raise exception 'from_member must be a current member of this trip';
  end if;
  if not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = p_to_member
  ) then
    raise exception 'to_member must be a current member of this trip';
  end if;

  insert into public.settlements (
    trip_id, from_member, to_member, amount_minor, idempotency_key, note, created_by
  )
  values (
    p_trip_id, p_from_member, p_to_member, p_amount_minor, p_idempotency_key, p_note, auth.uid()
  )
  on conflict (trip_id, idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.settlements
    where trip_id = p_trip_id and idempotency_key = p_idempotency_key;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.record_settlement_payment(
  uuid, uuid, uuid, integer, uuid, text
) from public;
grant execute on function public.record_settlement_payment(
  uuid, uuid, uuid, integer, uuid, text
) to authenticated;

create or replace function public.reopen_settlement(p_settlement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.settlements;
begin
  select * into v_row from public.settlements where id = p_settlement_id;
  if v_row.id is null then
    raise exception 'Settlement not found';
  end if;
  if not (
    public.is_trip_editor(v_row.trip_id)
    or auth.uid() = v_row.from_member
    or auth.uid() = v_row.to_member
  ) then
    raise exception 'Not authorized to reopen this settlement';
  end if;

  update public.settlements
  set status = 'reopened', reopened_at = now()
  where id = p_settlement_id and status = 'settled'
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.settlements where id = p_settlement_id;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.reopen_settlement(uuid) from public;
grant execute on function public.reopen_settlement(uuid) to authenticated;

create or replace function public.signal_trip_domain_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
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

-- ── 5. save_expense_with_splits: search_path + paid_by membership check ────
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
set search_path = ''
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
  if p_paid_by is not null and not exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = p_paid_by
  ) then
    raise exception 'paid_by must be a current member of this trip';
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

create or replace function public.signal_expense_split_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
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

-- ── 6. Membership-helper search_path hardening ──────────────────────────────
-- These are called (directly or transitively) by every settlement/expense
-- RPC above, so an empty search_path here closes the same class of risk at
-- the root instead of only at the call sites.
create or replace function public.is_trip_member(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
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
set search_path = ''
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
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = target_trip_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.add_trip_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do update set role = excluded.role;
  return new;
end;
$$;

create or replace function public.join_trip_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
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
