# Current mobile baseline

Audit snapshot of every product surface as of 2026-07-15. This documents **current behavior**, not intended behavior — use it as the reference point before any mobile-only refactor so regressions are caught early. File paths and line numbers are approximate and will drift; re-grep before relying on an exact line for a change.

Roles referenced below (`owner`/`editor`/`viewer`) come from `trip_members.role`; UI gating is via `lib/trip-capabilities.ts` (`canEdit` = owner/editor, `canManageTrip` = owner only). RLS in `supabase/migrations/012_trip_members_authorization.sql` is the actual security boundary — UI gating is UX only.

---

## 1. Sign-in / sign-up

- **Routes**: `/login`, `/sign-up`, `/sign-up/success`
- **Components**: [app/(auth)/login/page.tsx](app/(auth)/login/page.tsx), [app/(auth)/sign-up/page.tsx](app/(auth)/sign-up/page.tsx), [app/(auth)/sign-up/success/page.tsx](app/(auth)/sign-up/success/page.tsx), [app/(auth)/layout.tsx](app/(auth)/layout.tsx), [app/auth/callback/route.ts](app/auth/callback/route.ts)
- **Supabase**: `supabase.auth.signInWithPassword`, `supabase.auth.signInWithOAuth({provider:'google'})`, `supabase.auth.signUp`, `supabase.auth.exchangeCodeForSession` (callback route)
- **Loading**: no `loading.tsx` in the `(auth)` group — inline button spinners only
- **Error**: no `error.tsx` — inline `role="alert"` div renders Supabase's raw `error.message`, no retry affordance beyond re-submitting the form
- **Empty**: n/a (forms)
- **Known risks**:
  - Both forms correctly build redirect targets via `lib/safe-redirect.ts` (`getSafeRedirectPath`) — this is the well-guarded reference implementation for redirect handling; compare against `/join/[code]` below, which does not use it.
  - `app/auth/callback/route.ts` always redirects to `/login?error=auth_callback_failed` on failure with no page currently rendering that error code to the user.

## 2. Dashboard

- **Route**: `/dashboard`
- **Components**: [app/dashboard/page.tsx](app/dashboard/page.tsx) (server), [app/dashboard/DashboardClient.tsx](app/dashboard/DashboardClient.tsx), [app/dashboard/error.tsx](app/dashboard/error.tsx), [app/dashboard/loading.tsx](app/dashboard/loading.tsx)
- **Supabase**: `profiles` select, `trips` select ordered by `updated_at`, `trip_members` select (role lookup) — all server-side in `page.tsx`; client-side `trips` delete in `DashboardClient.tsx`
- **Loading**: shared `RouteLoading` (`components/route-state.tsx`) — full-screen spinner, not a skeleton
- **Error**: shared `RouteError` — generic "We couldn't load this page" + "Try again" button
- **Empty**: `EmptyState` component, "No trips yet"
- **Known risks**:
  - **`RouteError` retry is broken.** `components/route-state.tsx` destructures `{ unstable_retry }` from props, but Next.js's `error.tsx` boundary only ever passes `{ error, reset }` — `unstable_retry` is `undefined`, so clicking "Try again" throws. This affects every route sharing `RouteError`: dashboard, trips, profile, settings.
  - `/dashboard?error=invalid_invite` (set by the join flow, see §5) is never read or displayed by `DashboardClient.tsx` — a failed invite silently dumps the user here with no explanation.

## 3. Trips list

- **Route**: `/trips`
- **Components**: [app/trips/page.tsx](app/trips/page.tsx), [app/trips/TripsClient.tsx](app/trips/TripsClient.tsx), [app/trips/error.tsx](app/trips/error.tsx), [app/trips/loading.tsx](app/trips/loading.tsx)
- **Supabase**: same `profiles`/`trips`/`trip_members` triad as dashboard, `trips` ordered by `start_date`; client-side `trips` delete
- **Loading/Error**: same shared `RouteLoading`/`RouteError` — same broken-retry issue as §2
- **Empty**: per-tab `EMPTY_COPY` table, rendered via `<EmptyState>`
- **Known risks**:
  - `EmptyState`'s "new trip" CTA routes to `/dashboard` rather than directly to `/trips/new` — an extra hop.
  - Shares the `RouteError` broken-retry bug.

## 4. New trip wizard

- **Route**: `/trips/new`
- **Components**: [app/trips/new/page.tsx](app/trips/new/page.tsx) (server auth gate only), [app/trips/new/NewTripClient.tsx](app/trips/new/NewTripClient.tsx) — a single ~835-line client component covering all wizard steps
- **Supabase**: `supabase.rpc('create_trip_with_stops', ...)` is the only DB call; all wizard state stays local until final submit
- **Loading/Error**: **no `loading.tsx` or `error.tsx` exist for this route** — inconsistent with dashboard/trips/profile/settings, which all have them. A thrown error here bubbles to the nearest ancestor boundary (none in `app/trips/`).
- **Empty**: n/a (wizard form)
- **Known risks**:
  - Missing route-level loading/error boundaries — inconsistent with the rest of the app.
  - `components/trips/new-trip/` exists as a directory but is currently empty; the wizard has not actually been split into step components despite the path existing.
  - RPC failure surfaces via toast only, not a boundary — a reasonable but inconsistent pattern versus the rest of the app.

## 5. Explore

- **Route**: `/explore`
- **Components**: [app/explore/page.tsx](app/explore/page.tsx), [app/explore/ExploreClient.tsx](app/explore/ExploreClient.tsx), [app/explore/error.tsx](app/explore/error.tsx), [app/explore/loading.tsx](app/explore/loading.tsx), [components/explore/ExploreMapbox.tsx](components/explore/ExploreMapbox.tsx)
- **Supabase**: route discovery is Mapbox-driven, not Supabase-backed for the search itself; creating a trip from a discovered route ultimately calls the same `create_trip_with_stops` RPC as the wizard
- **Known risks**: not deep-audited this pass — flag for a follow-up pass focused specifically on Mapbox call volume/debouncing here, since `PlanRouteDomain.tsx` shows a pattern of unguarded route-fetch effects worth checking for reuse.

## 6. Invite / join

- **Route**: `/join/[code]`
- **Component**: [app/join/[code]/page.tsx](app/join/[code]/page.tsx) — server component only, no client/loading/error files
- **Supabase**: `supabase.auth.getUser()`, `supabase.rpc('join_trip_by_invite', { p_invite_code: code })`
- **Loading/Error/Empty**: none — pure server redirect chain
- **Known risks**:
  - **Does not use `lib/safe-redirect.ts`.** It manually builds `redirect(\`/login?next=/join/${code}\`)`, embedding the raw route param directly instead of going through the shared `getSafeRedirectPath` helper used by login/sign-up/callback. Not exploitable today (the string is always prefixed with the literal `/join/`, so it can't become `//evil.com`), but it bypasses the shared validation path — if that prefixing logic ever changes, this becomes a live open-redirect vector. **Recommend routing this through `getSafeRedirectPath` for consistency**, not urgent.
  - On failed join it redirects to `/dashboard?error=invalid_invite` — silently swallowed per §2.
  - The `join_trip_by_invite` RPC always inserts the caller as `editor` (never `owner`), confirmed via `security definer` + explicit role assignment in `012_trip_members_authorization.sql` — invite codes cannot self-escalate to ownership.

## 7. Profile / Settings

- **Routes**: `/profile`, `/settings`
- **Components**: [app/profile/page.tsx](app/profile/page.tsx), [app/profile/ProfileClient.tsx](app/profile/ProfileClient.tsx), [app/settings/page.tsx](app/settings/page.tsx), [app/settings/SettingsClient.tsx](app/settings/SettingsClient.tsx), [lib/settings.ts](lib/settings.ts) (localStorage-only, no Supabase)
- **Supabase**: profile page — `profiles` select + `trips` select for stats; client-side `profiles` update (display name), `supabase.auth.signOut()`; settings page — `profiles` select only, no client-side writes (settings are pure `localStorage` via `lib/settings.ts`, e.g. distance unit km/mi)
- **Loading/Error**: same shared `RouteLoading`/`RouteError` — same broken-retry issue
- **Empty**: n/a — always renders the shell with `?? ""` fallbacks
- **Known risks**:
  - Account deletion (`ProfileClient.tsx`) calls `POST /api/account/delete` with a custom `x-tripper-confirm: delete-account` header as the confirmation gate. The route itself is server-only and re-validates the session — the header is a UX confirmation signal, not the authorization boundary, but worth keeping in mind if the endpoint is ever touched.
  - `getCountryCount` parses country names out of a free-text `description` field via a `Countries:\s*([^\n]+)/` regex — fragile, couples a display stat to a text convention instead of structured data.
  - The Settings screen currently only persists `distanceUnit` (and similar local-only prefs) to `localStorage` via `lib/settings.ts`; nothing else in the codebase reads most of the settings fields back out. If Settings is expanded, verify each new field is actually consumed somewhere before shipping it.

## 8. Root / onboarding

- **Route**: `/`
- **Components**: [app/page.tsx](app/page.tsx) (server), [components/onboarding/mobile-entry-flow.tsx](components/onboarding/mobile-entry-flow.tsx) (client, no Supabase calls)
- **Supabase**: `supabase.auth.getClaims()` only, to decide whether to redirect to `/dashboard`
- **Known risks**: none found. No secrets, no service-role usage, no query-param redirect surface here.

## 9. Trip workspace — Plan / Prep / Budget / Journal

- **Route**: `/trip/[id]/mobile` (canonical); `/trip/[id]` is a compatibility redirect
- **Shell**: [app/trip/[id]/mobile/TripMobileClient.tsx](app/trip/[id]/mobile/TripMobileClient.tsx) (~213 lines) — owns tab switching, realtime subscription wiring, and passes `canEdit`/`canManageTrip` down to each domain.
- **Realtime**: `lib/supabase/trip-realtime.tsx` (`useTripRealtimeTable`) subscribes per-table (`stops`, `packing_items`, `expenses`, `journal_entries`) from migration `016_trip_domain_realtime.sql` onward.

### Plan — [PlanRouteDomain.tsx](app/trip/[id]/mobile/PlanRouteDomain.tsx) (~1290 lines)

- **Supabase**: `stops` insert/update(nights)/update(rename)/delete, `rpc('reorder_trip_stops', ...)` for atomic reorder
- **Loading/error/empty**: map load failure shown explicitly (`DeferredFailure` vs. `TripMapPlaceholder`); empty-stops state is a dedicated "Add your first destination" placeholder; Days/Bookings tabs show `ComingSoon` when there are no stops
- **Known risks**:
  - Route (Directions) fetch has no error handling — a failed `getFullRoute` call leaves `routeLoading` stuck `true` forever, which reads as "still loading" rather than "failed."
  - Weather fetch inside `DaysTab` has no error/failure UI — missing weather chips are indistinguishable from "outside forecast horizon" vs. "fetch failed."
  - `applyStopOrder` mixes three concerns in one function: optimistic local state, the Supabase RPC mutation, and pausing the parent's realtime listener via `onStopSyncPaused` — see [docs/plan-route-domain-map.md](docs/plan-route-domain-map.md) for the full breakdown.

### Prep — [PrepDomain.tsx](app/trip/[id]/mobile/PrepDomain.tsx) (~385 lines)

- **Supabase**: `packing_items` select/update(checked)/delete/insert(single)/insert(template seed)
- **Loading/error/empty**: pulsing skeleton while loading; `RetryCard` on load error; "Start your packing list" + seed-template CTA when empty
- **Known risks**:
  - `addItem` clears the typed draft text **before** the request resolves. If the insert fails, the toast fires but the user's typed item text is already gone — a real (if minor) bug, not just a UX rough edge.
  - User-facing error copy references "migration 010" — an internal implementation detail leaking into product copy.

### Budget — [BudgetDomain.tsx](app/trip/[id]/mobile/BudgetDomain.tsx) (~486 lines)

- **Supabase**: `expenses` select/insert/delete (no update — expenses are append/delete-only by design, matching the RLS grants)
- **Loading/error/empty**: skeleton rows while loading; `RetryCard` on error; settlement block is correctly gated on `!loading && !error`
- **Known risks**:
  - The top summary card (spend/remaining) is **not** gated on the `error` flag the way the settlement block is — during a load failure it still renders using the empty `expenses` array, showing "$0 spent" as if the trip genuinely has no expenses rather than surfacing the failure. This is the clearest instance in the codebase of an error state being visually indistinguishable from an empty state.

### Journal — [JournalDomain.tsx](app/trip/[id]/mobile/JournalDomain.tsx) (~765 lines)

- **Supabase**: `journal_entries` select (with nested `journal_photos`) / insert / update / delete; `journal_photos` insert/delete; Storage `remove()` and `createSignedUrls()` against the private `trip-photos` bucket
- **Loading/error/empty**: skeleton while `entries === null`; `RetryCard` on `entriesError`; empty-state text correctly excludes the error case
- **Known risks**: this is the most defensive mutation flow in the codebase — the photo upload pipeline (`submitEntry`) has explicit storage cleanup and rollback for partial failures. The one gap: `removeDraftPhoto`/`discardDraft` rely solely on JSX-level `canEdit` gating rather than also guarding inside the function body, unlike every other mutation in the app which double-guards. Low risk today since there's no unguarded entry point to those functions, but worth matching the double-guard pattern if the surrounding UI changes.

---

## Cross-cutting risks

1. **`RouteError`'s `unstable_retry` bug** affects dashboard, trips, profile, and settings identically — the single highest-leverage fix in this audit (one shared component, four routes).
2. **`/join/[code]` bypasses `lib/safe-redirect.ts`** — not currently exploitable, but inconsistent with the rest of the auth surface.
3. **`?error=invalid_invite` and `?error=auth_callback_failed` are set but never displayed** anywhere in the app — dead query-param contracts.
4. **Error-vs-empty conflation** shows up in Budget's summary card (§9) but is correctly avoided in Journal's entries list and Budget's own settlement block — worth a consistent "always gate on `error` before deriving summary numbers" rule.
5. Capability gating (`canEdit`/`canManageTrip` from `lib/trip-capabilities.ts`) is applied consistently as UI-layer defense-in-depth on top of RLS, with the sole exception noted in Journal above.
