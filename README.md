# Tripper

Tripper is a collaborative road-trip planner. A traveler signs up with a username, creates a trip (name, vibe, destination country, optional dates/budget), plans a multi-stop route on a live Mapbox map, invites companions with a trip code, and then uses the trip's **Plan**, **Explore**, **Bookings**, and **More** (Budget, Packing/Readiness, Journal, Members, Activity) tabs to run the trip together in real time.

**New to this repo, or testing the app for a friend?** Start with [`docs/app-flow-overview.md`](docs/app-flow-overview.md) — it walks every feature end-to-end (auth, trip wizard, route planning, bookings, budget splits, packing, explore, the trip-recap share image) with file references, and calls out the couple of things that look like bugs but are current, documented behavior. This README covers running the project; that doc covers understanding it.

## Prerequisites

- Node.js 20.9 or newer (required by the installed Next.js 16 release)
- npm; `package-lock.json` is the repository lockfile
- A Supabase project with the repository migrations applied (see [Supabase migrations](#supabase-migrations) below)
- A public Mapbox access token with access to Maps, Geocoding, Directions, and Optimization
- A Google Cloud project with the **Places API (New)** enabled, for the in-trip Explore tab (see [Place search keys](#place-search-keys))
- Network access during installation and production builds; `next/font` downloads Inter from Google Fonts at build time, and the trip-recap share image (`lib/recap-image.ts`) fetches a Mapbox static map and Google Fonts at runtime when a user shares a recap

## Local setup

1. Install the locked dependencies:

   ```bash
   npm ci
   ```

2. Create `.env.local` with the project configuration:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_MAPBOX_TOKEN=
   GOOGLE_PLACES_API_KEY=
   NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
   GOOGLE_PLACES_REVIEWS_ENABLED=false
   ```

   `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a legacy fallback for the publishable key. `SUPABASE_SERVICE_ROLE_KEY` must never be exposed through a `NEXT_PUBLIC_` variable or committed — it powers two server-only routes: account sign-up (`POST /api/auth/sign-up`, see [Auth model](#auth-model)) and account deletion (`POST /api/account/delete`).

3. Apply the database migrations as described below, then start the app:

   ```bash
   npm run dev
   ```

   The tracked Claude launcher, `.claude/launch.json`, runs the same command on port 3000. Open <http://localhost:3000>.

### Auth model

Tripper signs users up with a **username**, not an email address — `/sign-up` collects `username` + `password`, and the server route (`app/api/auth/sign-up/route.ts`) maps the username to a synthetic `username@accounts.tripper.app` address before creating the Supabase Auth user. `/login` accepts either a username or a legacy email for accounts created before this change. There is no Google OAuth flow in the current UI. See `docs/app-flow-overview.md` §4 for details.

### Place search keys

Two independent providers power place search, and they are easy to conflate:

- **`NEXT_PUBLIC_MAPBOX_TOKEN`** — used for the "add a stop" search when planning a route (Mapbox Geocoding), plus the interactive map itself.
- **`GOOGLE_PLACES_API_KEY`** (server-only, no `NEXT_PUBLIC_` prefix) — used for the in-trip **Explore** tab (restaurants/cafes/attractions near a stop), via `app/api/places/*`. If this is unset, Explore search returns `503 Service Unavailable` — this is the most common local setup gap; see `docs/app-flow-overview.md` §7 and §10.
- **`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`** — a separate, browser-restricted key for any client-side Google Maps JS usage; it is *not* a substitute for `GOOGLE_PLACES_API_KEY`.

## Commands

```bash
npm run dev      # Next.js development server
npm run lint     # ESLint over active source and configuration
npm test         # Node test suite
npm run build    # Production build
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Signed-out onboarding; signed-in users redirect to `/dashboard` |
| `/login`, `/sign-up`, `/sign-up/success` | Username/password auth entry flows (see [Auth model](#auth-model)) |
| `/dashboard` | Recent trips and account overview |
| `/trips` | All accessible trips |
| `/trips/new` | Guided 5-step trip creation wizard (name/vibe, dates, country, budget, invite) |
| `/explore` | Standalone Mapbox route discovery and route-to-trip creation (distinct from the in-trip Explore tab) |
| `/join/[code]` | Authenticated invite redemption; unauthenticated users continue through login |
| `/trip/[id]` | Compatibility redirect to the active trip experience |
| `/trip/[id]/mobile` | The active trip workspace — bottom-nav tabs **Overview / Plan / Explore / Bookings / More**, the latter opening Budget, Packing (Trip Readiness), Journal (incl. trip-recap share image), Members, and Activity as sheets over the same route |
| `/profile`, `/settings` | Profile summary and local app preferences |

## Architecture

- `app/` contains Next.js App Router pages. Authenticated pages are server components that validate the Supabase user and load initial data; adjacent `*Client.tsx` and trip-domain (`*Domain.tsx`) components own interaction. Each bottom-nav tab in `/trip/[id]/mobile` is its own sibling `Domain` component with its own queries and realtime subscription — see `docs/app-flow-overview.md` §3 for the map.
- `app/api/auth/sign-up/` creates accounts with the server-only Supabase admin client. `app/api/places/` is a server-only proxy to Google Places (New) so the API key never reaches the browser.
- `components/` contains shared UI, Mapbox maps, journal presentation, onboarding, navigation, motion, and PWA registration.
- `lib/mapbox/` calls Mapbox directly for geocoding, driving directions, route optimization, and map styling. `lib/google-places/` is the server-side Places client (auth, validation, rate limiting, error mapping). `lib/weather/openMeteo.ts` supplies forecast data without another credential.
- `lib/supabase/` contains browser/server clients, a server-only service-role client for admin operations, cookie refresh middleware, server-query error handling, and the trip-domain realtime subscription provider (`trip-realtime.tsx`).
- `lib/trip-capabilities.ts` converts database roles into presentation capabilities; Supabase row-level security remains the security boundary.
- `lib/recap-image.ts` renders the shareable trip-recap PNG on a `<canvas>`, using a real Mapbox static-map basemap (not the live WebGL map) — see `docs/app-flow-overview.md` §8–9 before touching map-export code.
- `types/index.ts` defines the shared trip, member, stop, itinerary, reservation, expense, journal, and route contracts.
- `supabase/migrations/` owns the PostgreSQL schema, RPCs, RLS policies, Storage policies, and Realtime publication changes.
- `proxy.ts` refreshes Supabase sessions for protected application routes. Browser trip mutations call Supabase tables, Storage, and RPCs directly using the signed-in session and public publishable key. Privileged server endpoints (account creation, account deletion) use the server-only service-role key and never run in the browser.

### Collaboration roles

`trip_members` is the authoritative membership model. The older `trips.collaborator_id` column remains only for migration compatibility and is not an authorization source.

| Role | Access |
| --- | --- |
| `owner` | Mutate trip-domain data; update/delete the trip and manage membership |
| `editor` | Create/update/delete stops, itinerary items, packing items, bookings, expenses, and journal entries; cannot manage the trip or members |
| `viewer` | Read shared trip data and member profiles; no mutations |

New invite-code joins receive `editor`. Both the UI and SQL RPCs check capabilities, but RLS policies and security-definer helpers enforce access in the database.

## Supabase migrations

Migrations are **applied manually** through the Supabase SQL Editor in this project — there is no CLI link. Before assuming a feature's schema is live (especially on a staging/friend's project), run [`scripts/check-pending-migrations.sql`](scripts/check-pending-migrations.sql) in the SQL Editor; it checks table/column/bucket existence for every migration below and reports which are still pending.

The migration directory contains two historical starting schemas, so do **not** blindly execute every file in lexical order on a fresh database:

1. For a fresh Supabase project, apply `000_full_schema.sql` as the baseline and skip `001_initial_schema.sql`.
2. Apply `002_fix_profile_trigger.sql` through `014_reorder_trip_stops.sql` in filename order.
3. `015_drop_legacy_pins_budget.sql` is an intentional destructive cleanup. Apply it only after confirming no external client still uses the legacy `pins`, `pin_photos`, or `budget_items` tables.
4. Apply `016_trip_domain_realtime.sql`, then the timestamped migrations in ascending order:
   - `20260715231929_journal_photo_privacy.sql`
   - `20260715233000_validate_create_trip_with_stops.sql`
   - `20260716005552_active_schema_grants_and_account_deletion.sql`
   - `20260716120000_itinerary_items.sql` (unified daily itinerary; `supabase/tests/itinerary_rls_assertions.sql` verifies its security contract)
   - `20260716215756_add_itinerary_visit_duration.sql`
   - `20260716220137_add_itinerary_place_identity.sql`
   - `20260716233000_reservations.sql` (real bookings + private `trip-documents` bucket; `supabase/tests/reservations_rls_assertions.sql` verifies its security contract)
   - `20260716234500_optimize_itinerary_day_apply.sql`
   - `20260717010000_expense_splits.sql` (custom equal/exact/percentage expense splits)
   - `20260717020000_settlements.sql` (who-owes-whom settlement tracking)
   - `20260717030000_expense_receipts.sql`
   - `20260717040000_trip_readiness.sql` (packing assignment/quantity/priority + `trip_tasks`; `supabase/tests/trip_tasks_rls_assertions.sql` verifies its security contract)
   - `20260717230803_trip_collaboration.sql` (trip comments, mentions, activity feed)
   - `20260717233029_travel_mode_events.sql` (live "travel mode" event stream merged into the trip timeline)

Existing projects must use their recorded migration history: `001_initial_schema.sql` is the legacy baseline and must not be applied after `000_full_schema.sql`. Migration `012` backfills `trip_members` from historical owner/collaborator columns and makes role-based RLS authoritative. Migration `011` creates the `trip-photos` bucket; the timestamped privacy migration makes it private and limits reads to trip members and writes to editors/owners. `20260716005552` makes active-table Data API grants explicit and changes shared-content attribution foreign keys to `ON DELETE SET NULL`, which must be deployed before enabling the account-deletion endpoint.

These SQL files are the deployment source of truth, but the repository does not pin or script the Supabase CLI. Choose a project migration workflow outside this repository and record which files have already run before applying later migrations.

## Documentation map

| Doc | Covers |
| --- | --- |
| [`docs/app-flow-overview.md`](docs/app-flow-overview.md) | Whole-app architecture and user-flow walkthrough — start here if you're new or testing |
| [`docs/current-mobile-baseline.md`](docs/current-mobile-baseline.md) | Per-route UI audit: loading/error/empty states and known bugs, route by route |
| [`docs/plan-route-domain-map.md`](docs/plan-route-domain-map.md) | Deep dive on the route-planning (Plan → Route) domain specifically |
| [`docs/liquid-glass-design-system.md`](docs/liquid-glass-design-system.md) | The design token system used across the UI |
| [`docs/collaboration-realtime-strategy.md`](docs/collaboration-realtime-strategy.md) | How realtime collaboration (comments, activity, live sync) is designed |
| [`docs/mobile-regression-checklist.md`](docs/mobile-regression-checklist.md) | Manual QA checklist for mobile regressions |

## Reference and generated artifacts

- `html/New Trip Step *.dc.html`, `tasarim prompt`, and `test/trip-recap*.png` are design/reference artifacts; the runtime does not import them.
- `.claude/launch.json` is a development-launch configuration. `.claude/worktrees/` contains tool-managed alternate worktrees and is not active application source.
- `.next/`, `next-env.d.ts`, and `tsconfig.tsbuildinfo` are generated locally and ignored by Git.

Keep this README as the primary setup reference and `docs/app-flow-overview.md` as the primary comprehension reference. Schema behavior should be verified against the ordered SQL migrations (and `scripts/check-pending-migrations.sql`) rather than inferred from old summaries.
