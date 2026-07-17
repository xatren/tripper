-- Settlement records (Phase 8): persisted "mark paid" / undo history for the
-- Budget tab's settlement screen, on top of the always-recomputed transfer
-- suggestions in budget-settlement.ts.
--
-- Deliberate decisions:
--   * Idempotency is a client-generated `idempotency_key` (uuid) held across
--     retries, backed by `unique (trip_id, idempotency_key)` — a genuine
--     double-tap/network-retry becomes a true no-op via `on conflict ... do
--     nothing`, not a duplicate payment row.
--   * Undo/reopen is a status transition, not a delete, preserving history.
--   * No direct client INSERT/UPDATE grant: both mutations funnel through
--     SECURITY DEFINER RPCs so `amount_minor`/`from_member`/`to_member`
--     cannot be rewritten after creation by a compromised/buggy client.
--   * Mutation authorization: any trip editor/owner, OR either party to that
--     specific transfer (so a viewer who actually paid can self-confirm).

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_member uuid references public.profiles(id) on delete set null,
  to_member uuid references public.profiles(id) on delete set null,
  amount_minor integer not null check (amount_minor > 0),
  status text not null default 'settled' check (status in ('settled', 'reopened')),
  idempotency_key uuid not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  settled_at timestamptz not null default now(),
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, idempotency_key)
);

create index if not exists settlements_trip_idx
  on public.settlements (trip_id);
create index if not exists settlements_trip_status_idx
  on public.settlements (trip_id, status);

alter table public.settlements enable row level security;

drop policy if exists "Trip members can view settlements" on public.settlements;
create policy "Trip members can view settlements" on public.settlements
  for select using (public.is_trip_member(trip_id));

-- No direct INSERT/UPDATE grant — see record_settlement_payment/reopen_settlement.
revoke all on table public.settlements from anon;
revoke all on table public.settlements from authenticated;
grant select on table public.settlements to authenticated;

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
set search_path = public
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
set search_path = public
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

-- ── Realtime ─────────────────────────────────────────────────────────────────
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

drop trigger if exists settlements_signal_realtime_delete on public.settlements;
create trigger settlements_signal_realtime_delete
  after delete on public.settlements
  for each row execute function public.signal_trip_domain_delete();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'settlements'
  ) then
    execute 'alter publication supabase_realtime add table public.settlements';
  end if;
end $$;
