# Tripper

Tripper is a collaborative trip planner for building a multi-stop route, preparing for the trip, tracking shared expenses, and keeping a photo journal. A traveler signs in, creates or discovers a route, plans stops on a Mapbox map, invites companions with a trip code, and uses the Plan, Prep, Budget, and Journal views during the trip.

## Prerequisites

- Node.js 20.9 or newer (required by the installed Next.js 16 release)
- npm; `package-lock.json` is the repository lockfile
- A Supabase project with email authentication and the repository migrations applied
- A public Mapbox access token with access to Maps, Geocoding, Directions, and Optimization
- Network access during installation and production builds; `next/font` downloads Inter from Google Fonts at build time

## Local setup

1. Install the locked dependencies:

   ```bash
   npm ci
   ```

2. Create `.env.local` with the public browser configuration:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   NEXT_PUBLIC_MAPBOX_TOKEN=
   SUPABASE_SERVICE_ROLE_KEY=
   ```

   `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a legacy fallback for the publishable key. `SUPABASE_SERVICE_ROLE_KEY` is required only by the server-side account-deletion route; it must never be exposed through a `NEXT_PUBLIC_` variable or committed.

3. Apply the database migrations as described below, then start the app:

   ```bash
   npm run dev
   ```

   The tracked Claude launcher, `.claude/launch.json`, runs the same command on port 3000. Open <http://localhost:3000>.

Supabase must also know the local site/callback URL for `/auth/callback`. Google sign-in additionally requires a Google provider configured in Supabase; email/password auth works without it.

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
| `/login`, `/sign-up`, `/sign-up/success` | Supabase email/password and Google OAuth entry flows |
| `/auth/callback` | Supabase OAuth code exchange route handler |
| `/dashboard` | Recent trips and account overview |
| `/trips` | All accessible trips |
| `/trips/new` | Guided trip creation |
| `/explore` | Mapbox route discovery and route-to-trip creation |
| `/join/[code]` | Authenticated invite redemption; unauthenticated users continue through login |
| `/trip/[id]` | Compatibility redirect to the active trip experience |
| `/trip/[id]/mobile` | Active Plan, Prep, Budget, and Journal workspace |
| `/profile`, `/settings` | Profile summary and local app preferences |

## Architecture

- `app/` contains Next.js App Router pages. Authenticated pages are server components that validate the Supabase user and load initial data; adjacent `*Client.tsx` and trip-domain components own interaction.
- `components/` contains shared UI, Mapbox maps, journal presentation, onboarding, navigation, motion, and PWA registration.
- `lib/mapbox/` calls Mapbox directly for geocoding, driving directions, route optimization, and map styling. `lib/weather/openMeteo.ts` supplies forecast data without another credential.
- `lib/supabase/` contains browser/server clients, a server-only service-role client for account deletion, cookie refresh middleware, server-query error handling, and the trip-domain realtime subscription provider. Realtime synchronization is implemented for stops, packing items, expenses, and journal entries after migration `016`, and for itinerary items after `20260716120000_itinerary_items`.
- `lib/trip-capabilities.ts` converts database roles into presentation capabilities; Supabase row-level security remains the security boundary.
- `types/index.ts` defines the shared trip, member, stop, expense, journal, and route contracts.
- `supabase/migrations/` owns the PostgreSQL schema, RPCs, RLS policies, Storage policy, and Realtime publication changes.
- `proxy.ts` refreshes Supabase sessions for protected application routes. Browser trip mutations call Supabase tables, Storage, and RPCs directly using the signed-in session and public publishable key. The sole privileged application endpoint is `POST /api/account/delete`; it revalidates the session, removes owned private media, revokes refresh sessions, and deletes the authenticated user with the server-only service-role key.

### Collaboration roles

`trip_members` is the authoritative membership model. The older `trips.collaborator_id` column remains only for migration compatibility and is not an authorization source.

| Role | Access |
| --- | --- |
| `owner` | Mutate trip-domain data; update/delete the trip and manage membership |
| `editor` | Create/update/delete stops, packing items, and journal entries; create/delete expenses and related photos; cannot manage the trip or members |
| `viewer` | Read shared trip data and member profiles; no mutations |

New invite-code joins receive `editor`. Both the UI and SQL RPCs check capabilities, but RLS policies and security-definer helpers enforce access in the database.

## Supabase migrations

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

Existing projects must use their recorded migration history: `001_initial_schema.sql` is the legacy baseline and must not be applied after `000_full_schema.sql`. Migration `012` backfills `trip_members` from historical owner/collaborator columns and makes role-based RLS authoritative. Migration `011` creates the `trip-photos` bucket; the timestamped privacy migration makes it private and limits reads to trip members and writes to editors/owners. The final timestamped migration makes active-table Data API grants explicit and changes shared-content attribution foreign keys to `ON DELETE SET NULL`, which must be deployed before enabling the account-deletion endpoint.

These SQL files are the deployment source of truth, but the repository does not pin or script the Supabase CLI. Choose a project migration workflow outside this repository and record which files have already run before applying later migrations.

## Reference and generated artifacts

- `html/New Trip Step *.dc.html`, `tasarim prompt`, and `test/trip-recap.png` are design/reference artifacts; the runtime does not import them.
- `.claude/launch.json` is a development-launch configuration. `.claude/worktrees/` contains tool-managed alternate worktrees and is not active application source.
- `.next/`, `next-env.d.ts`, and `tsconfig.tsbuildinfo` are generated locally and ignored by Git.

Keep this README as the primary project documentation. Schema behavior should be verified against the ordered SQL migrations rather than inferred from old summaries.
