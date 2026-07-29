-- RM-002 (scoped): invite-code abuse protection.
--
-- Scope decision (confirmed with the product owner): keep the existing
-- 8-char manually-typeable invite_code (~40-bit entropy) rather than moving
-- to a 128-bit link-only token — that would break the "Invite code" manual
-- entry UI (app/dashboard/DashboardClient.tsx) as a real product feature.
-- The actual threat this closes is unlimited guessing against
-- join_trip_by_invite, which today has zero rate limiting or attempt audit
-- (000_full_schema.sql, 012_trip_members_authorization.sql).
--
-- No external rate-limit store exists in this app (no Redis/etc). Limiting
-- is implemented purely in Postgres against a new attempt-audit table, which
-- doubles as the "deneme audit'i" requirement. Real-time alarming (Slack/
-- email on spikes) is out of scope — it needs a notification channel this
-- migration can't decide — but every attempt is durably logged with an
-- outcome, so a scheduled job or manual query can page off of it later.
--
-- Rotation is NOT added here: it already exists as
-- public.rotate_trip_invite(uuid) (20260717230803_trip_collaboration.sql),
-- owner-only, row-locked, activity-logged, and gated by the
-- keep_legacy_trip_owner_immutable trigger — old codes are invalidated the
-- instant a rotation runs (immediate invalidation, no dual-accept window),
-- which already matches this roadmap item's urgent-risk fallback.

-- ── 1. Attempt audit log ────────────────────────────────────────────────────
create table if not exists public.invite_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  client_ip inet,
  attempted_code text not null,
  trip_id uuid references public.trips(id) on delete set null,
  outcome text not null check (outcome in ('joined', 'invalid_code', 'rate_limited')),
  created_at timestamptz not null default now()
);

create index if not exists invite_join_attempts_user_recent_idx
  on public.invite_join_attempts (user_id, created_at desc);
create index if not exists invite_join_attempts_ip_recent_idx
  on public.invite_join_attempts (client_ip, created_at desc)
  where client_ip is not null;

alter table public.invite_join_attempts enable row level security;

-- No client access at all: this is a server-side audit trail written only by
-- join_trip_by_invite (SECURITY DEFINER). Review happens via the Supabase
-- SQL Editor / service role, not the app.
revoke all on table public.invite_join_attempts from anon;
revoke all on table public.invite_join_attempts from authenticated;

-- ── 2. join_trip_by_invite: rate limiting + audit logging ──────────────────
-- Replaces the 012_trip_members_authorization.sql / RM-001 version. The
-- signature changes (adds p_client_ip), so the old one-arg overload is
-- dropped first to avoid an ambiguous-call error from the new default arg.
drop function if exists public.join_trip_by_invite(text);

-- Returns jsonb {trip_id, outcome} instead of raising on invalid_code/
-- rate_limited: Postgres rolls back the *entire* transaction when a function
-- raises, and each RPC call is its own transaction (matching PostgREST), so
-- an insert-then-raise on the failure paths meant the audit row it just
-- wrote was rolled back along with it — invite_join_attempts could only ever
-- accumulate 'joined' rows, so the recent-attempt count used for rate
-- limiting could never reach the threshold. Returning normally (only
-- raising for the "not authenticated at all" case, which the RPC's own
-- authenticated-only grant already makes unreachable in practice) lets every
-- outcome's audit row actually commit, which is what makes rate limiting on
-- brute-forced guesses work at all.
create or replace function public.join_trip_by_invite(
  p_invite_code text,
  p_client_ip inet default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_trip_id uuid;
  v_user_recent_count int;
  v_ip_recent_count int;
  v_window constant interval := interval '10 minutes';
  v_user_limit constant int := 8;
  v_ip_limit constant int := 20;
  v_code constant text := upper(trim(p_invite_code));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into v_user_recent_count
  from public.invite_join_attempts
  where user_id = auth.uid() and created_at > now() - v_window;

  if p_client_ip is not null then
    select count(*) into v_ip_recent_count
    from public.invite_join_attempts
    where client_ip = p_client_ip and created_at > now() - v_window;
  else
    v_ip_recent_count := 0;
  end if;

  if v_user_recent_count >= v_user_limit or v_ip_recent_count >= v_ip_limit then
    insert into public.invite_join_attempts (user_id, client_ip, attempted_code, outcome)
    values (auth.uid(), p_client_ip, v_code, 'rate_limited');
    return jsonb_build_object('trip_id', null, 'outcome', 'rate_limited');
  end if;

  select id into target_trip_id
  from public.trips
  where upper(invite_code) = v_code;

  if target_trip_id is null then
    insert into public.invite_join_attempts (user_id, client_ip, attempted_code, outcome)
    values (auth.uid(), p_client_ip, v_code, 'invalid_code');
    return jsonb_build_object('trip_id', null, 'outcome', 'invalid_code');
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (target_trip_id, auth.uid(), 'editor')
  on conflict (trip_id, user_id) do nothing;

  insert into public.invite_join_attempts (user_id, client_ip, attempted_code, trip_id, outcome)
  values (auth.uid(), p_client_ip, v_code, target_trip_id, 'joined');

  return jsonb_build_object('trip_id', target_trip_id, 'outcome', 'joined');
end;
$$;

revoke all on function public.join_trip_by_invite(text, inet) from public;
grant execute on function public.join_trip_by_invite(text, inet) to authenticated;
