-- RM-012: shared, horizontally-scalable abuse/rate-limit layer for the
-- signup endpoint and the Google Places proxy routes.
--
-- Same rationale as RM-002's invite-code limiter
-- (20260728010000_invite_rate_limiting.sql): this app has no external
-- rate-limit store (no Redis/Upstash), and it runs on Vercel's serverless
-- hosting (multiple ephemeral instances, no shared process memory), so the
-- only limiter that actually works across instances is one backed by
-- Postgres. This migration generalizes that pattern instead of writing a
-- third bespoke limiter:
--   - lib/google-places/rate-limit.ts previously used an in-memory Map,
--     explicitly commented as "best-effort per-instance protection" — it
--     never actually enforced a shared quota once traffic split across
--     instances.
--   - app/api/auth/sign-up/route.ts had no rate limiting at all.
--
-- Shadow mode: public.rate_limit_scope_config is a tunable table (not
-- hardcoded constants) specifically so the new `signup_ip` scope can launch
-- with shadow_mode=true — every request that *would* have been blocked is
-- still logged to rate_limit_events with outcome='shadow_blocked', but the
-- caller is always actually let through. That lets the effect on NAT-shared
-- IPs be measured (`select count(*) from rate_limit_events where
-- scope='signup_ip' and outcome='shadow_blocked'` via the SQL Editor) before
-- anyone flips shadow_mode to false and the limit starts actually blocking
-- requests. Real-time alarming is out of scope here for the same reason it
-- was out of scope for RM-002: no notification channel exists in this app to
-- alarm through yet; every event is durably logged so a scheduled job or
-- manual query can page off it later.

-- ── 1. Per-scope configuration ──────────────────────────────────────────────
create table if not exists public.rate_limit_scope_config (
  scope text primary key,
  limit_count int not null check (limit_count > 0),
  window_seconds int not null check (window_seconds > 0),
  shadow_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_scope_config enable row level security;
-- Config is read only by check_rate_limit (SECURITY DEFINER); no client
-- access at all, tuned via the SQL Editor / service role.
revoke all on table public.rate_limit_scope_config from anon;
revoke all on table public.rate_limit_scope_config from authenticated;

insert into public.rate_limit_scope_config (scope, limit_count, window_seconds, shadow_mode)
values
  -- Starts in shadow mode: signup has never had a limit before, so the first
  -- rollout only measures what it would have blocked.
  ('signup_ip', 5, 3600, true),
  -- Matches the limits the old in-memory Map already enforced per-instance;
  -- not shadow mode since these are already-live, already-tuned limits.
  ('places_search_user', 45, 60, false),
  ('places_autocomplete_user', 60, 60, false),
  ('places_details_user', 60, 60, false),
  ('places_photo_user', 120, 60, false)
on conflict (scope) do nothing;

-- ── 2. Event log (counter + audit trail) ────────────────────────────────────
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  scope text not null,
  identity_key text not null,
  user_id uuid references public.profiles(id) on delete set null,
  client_ip inet,
  outcome text not null check (outcome in ('allowed', 'shadow_blocked', 'blocked')),
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_scope_identity_recent_idx
  on public.rate_limit_events (scope, identity_key, created_at desc);

alter table public.rate_limit_events enable row level security;
-- Same lockdown as invite_join_attempts: a pure server-side audit trail
-- written only by check_rate_limit (SECURITY DEFINER), no client access.
revoke all on table public.rate_limit_events from anon;
revoke all on table public.rate_limit_events from authenticated;

-- ── 3. check_rate_limit: the shared enforcement primitive ──────────────────
-- Callers never pass their own limit/window — those are looked up from
-- rate_limit_scope_config by p_scope, so an authenticated caller (Places
-- routes call this with the `authenticated` grant) can't widen their own
-- quota by passing a large p_limit. p_scope values that have no config row
-- fail open (allowed=true) rather than blocking traffic for an unrecognized
-- scope, e.g. a scope typo in application code.
create or replace function public.check_rate_limit(
  p_scope text,
  p_identity_key text,
  p_client_ip inet default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_window_seconds int;
  v_shadow_mode boolean;
  v_recent_count int;
  v_raw_allowed boolean;
  v_outcome text;
begin
  select limit_count, window_seconds, shadow_mode
  into v_limit, v_window_seconds, v_shadow_mode
  from public.rate_limit_scope_config
  where scope = p_scope;

  if not found then
    return jsonb_build_object(
      'allowed', true,
      'shadow_blocked', false,
      'retry_after_seconds', 0,
      'current_count', 0
    );
  end if;

  select count(*) into v_recent_count
  from public.rate_limit_events
  where scope = p_scope
    and identity_key = p_identity_key
    and created_at > now() - make_interval(secs => v_window_seconds);

  v_raw_allowed := v_recent_count < v_limit;

  if v_raw_allowed then
    v_outcome := 'allowed';
  elsif v_shadow_mode then
    v_outcome := 'shadow_blocked';
  else
    v_outcome := 'blocked';
  end if;

  insert into public.rate_limit_events (scope, identity_key, user_id, client_ip, outcome)
  values (p_scope, p_identity_key, p_user_id, p_client_ip, v_outcome);

  -- Opportunistic cleanup, no pg_cron dependency (same reasoning RM-002 used
  -- for not adding new infra): a small fraction of calls also sweep events
  -- old enough that no scope's window could still be counting them.
  if random() < 0.01 then
    delete from public.rate_limit_events where created_at < now() - interval '2 days';
  end if;

  return jsonb_build_object(
    'allowed', v_raw_allowed or v_shadow_mode,
    'shadow_blocked', (not v_raw_allowed) and v_shadow_mode,
    'retry_after_seconds', case when v_raw_allowed then 0 else v_window_seconds end,
    'current_count', v_recent_count + 1
  );
end;
$$;

-- No grant to anon: signup calls this through the service-role admin client
-- (app/api/auth/sign-up/route.ts), so an unauthenticated caller can never
-- invoke check_rate_limit directly with a forged scope/identity_key. Places
-- routes call it as the signed-in user, hence the `authenticated` grant.
revoke all on function public.check_rate_limit(text, text, inet, uuid) from public;
grant execute on function public.check_rate_limit(text, text, inet, uuid) to authenticated, service_role;
