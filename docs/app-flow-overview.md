# Tripper — Application Flow & Architecture Overview

Orientation document for anyone (human or model) who needs to understand how Tripper works **without** reading the codebase file-by-file first. It was written after manually walking every primary user flow end-to-end in a running dev instance (signup → trip creation → route planning → bookings → budget → packing/readiness → explore → journal/recap) and cross-referencing that behavior against the source. Treat it as a map, not a spec — always verify a specific claim against the current code before depending on it for a change, since the app evolves fast (see `supabase/migrations/` timestamps for the actual pace).

Last verified: 2026-07-22.

---

## 1. What Tripper is

A mobile-first, collaborative road-trip planner: users create a trip, add stops, get a driving route (distance/duration), plan day-by-day itinerary items, track bookings/reservations, split expenses with trip-mates, manage a shared packing/readiness checklist, discover places along the route, and share a "trip recap" image at the end. Trips are shared in real time between members with role-based permissions (`owner` / `editor` / `viewer`).

The product is overwhelmingly mobile-shaped: almost all real feature surfaces live under `app/trip/[id]/mobile/`. Desktop/tablet is not a first-class target today.

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Server components for initial data + auth gate, client components (`"use client"`) for interactive domains |
| Database / Auth / Storage / Realtime | Supabase (Postgres) | RLS is the actual security boundary — UI role-gating (`lib/trip-capabilities.ts`) is UX only, never trust it alone |
| Maps / routing | Mapbox GL JS (`react-map-gl`), Mapbox Directions, Geocoding, Optimization, Static Images APIs | Dark style (`mapbox://styles/mapbox/dark-v11`) matches the app's dark theme everywhere, including exported images |
| Place search | Google Places API (New) | Server-only proxy under `app/api/places/*` — see §7 |
| PWA / offline | Service worker (`components/pwa/RegisterSW.tsx`) + local caches | Some domains cache last-known data client-side for offline reads |
| Styling | Tailwind + a small "Liquid Glass" token layer | See `docs/liquid-glass-design-system.md` |
| Fonts | `next/font/google` (Inter) + local Geist | **Gotcha**: `next/font` hashes the family name into a scoped CSS variable — the literal string `"Inter"` never resolves inside a `<canvas>` `ctx.font`. Any canvas-drawing code (recap image, future exports) must load its own `FontFace` explicitly; see `lib/recap-image.ts` for the pattern. |

## 3. Repo orientation

```
app/
  (auth)/login, (auth)/sign-up        — username/password auth pages
  api/auth/sign-up/                   — server route that maps username → synthetic email
  api/places/{search,autocomplete,details,photo}/ — Google Places proxy (server-side key)
  dashboard/, trips/, trips/new/      — trip list + creation wizard
  trip/[id]/mobile/                   — the actual app: one big mobile client shell + per-feature "Domain" components
  explore/                            — Discover: the map-first "Discover" nav tab (`DiscoverClient.tsx`), a full-bleed Mapbox canvas over a curated + live-Places dataset (`lib/discover/`), country-scoped, with a draggable results sheet. The old globe/`ROUTES`-template surface (`ExploreClient.tsx`) is retired (see `docs/discover-explore-map-plan.md`, Phases 1-6 shipped). The in-trip Explore tab (`ExploreDomain.tsx`, `GooglePlacesExplorer.tsx`) is a separate, trip-scoped surface — see §6 item 6 and §7.
  join/[code]/                        — invite-code join flow
  profile/, settings/                 — account pages
lib/
  auth/username.ts                    — username ⇄ synthetic-email mapping
  google-places/                      — Google Places client, validation, rate limiting, errors
  mapbox/                             — Mapbox GL client setup, geocoding, directions, optimize
  supabase/                           — client/admin Supabase clients, realtime trip channel helpers
  travel-mode.ts                      — itinerary status machine, recap stats, timeline merge
  recap-image.ts                      — canvas-rendered shareable trip recap PNG (see §9)
  trip-capabilities.ts                — UI-level role gating (owner/editor/viewer) — NOT the security boundary
components/
  mobile/, ui/, journal/, map/mapbox/ — shared UI primitives and the interactive map wrapper
supabase/
  migrations/                         — see §5; applied manually via the Supabase SQL Editor, no CLI link
  tests/                              — SQL assertions for RLS policies per feature
docs/
  current-mobile-baseline.md          — per-route UI audit (loading/error/empty states, known bugs) — complements this doc
  liquid-glass-design-system.md       — design token system
  plan-route-domain-map.md            — deep dive on the route-planning domain specifically
```

**Key architectural pattern**: `app/trip/[id]/mobile/TripMobileClient.tsx` is the shell (bottom nav: Overview / Plan / Explore / Bookings / More). Each tab is a separate `*Domain.tsx` component (`PlanRouteDomain`, `ExploreDomain`, `BookingsDomain`, `JournalDomain`, etc.) that owns its own Supabase queries, realtime subscription, and local state. They're siblings, not nested — switching tabs swaps which Domain is mounted.

## 4. Auth model

Tripper does **not** use email-based auth in its UI, despite running on Supabase Auth (which is email-based under the hood).

- Users sign up with a **username** (`^[a-zA-Z0-9_]{3,30}$`) + password (≥6 chars).
- `app/api/auth/sign-up/route.ts` (server, uses the Supabase **admin** client) maps `username` → `username@accounts.tripper.app` and calls `auth.admin.createUser` with `email_confirm: true`, storing the real username in `user_metadata`.
- Login accepts either a username or a legacy email (`lib/auth/username.ts: loginIdentifierToEmail`) — the "legacy email" path exists for accounts created before this migration to username auth.
- Session/cookie handling is standard Supabase SSR (`lib/supabase/*`).
- **Do not** assume `auth.users.email` is a real, contactable email address anywhere in this codebase — it's a synthetic placeholder for the vast majority of users.

## 5. Data model (Supabase / Postgres)

Migrations are **applied manually** by the project owner via the Supabase SQL Editor — there is no `supabase db push` / CLI link in this workflow. This means the migration files on disk can be ahead of the live database. `scripts/check-pending-migrations.sql` is a standing script that checks live schema state (table/column/bucket existence) against the migration list — run it (in the SQL Editor) before assuming a recent feature's schema exists in production.

Chronological migration list (oldest → newest) as of this writing:

```
000_full_schema.sql, 001_initial_schema.sql, 002_fix_profile_trigger.sql,
003_add_stops_expenses_photos.sql, 004_stops_place_fields.sql, 005_activities.sql,
006_activity_order.sql, 007_trips_focus_location.sql, 008_trip_persistence.sql,
009_trip_countries.sql, 010_packing_items.sql, 011_journal.sql,
012_trip_members_authorization.sql, 013_create_trip_with_stops.sql,
014_reorder_trip_stops.sql, 015_drop_legacy_pins_budget.sql, 016_trip_domain_realtime.sql,
20260715231929_journal_photo_privacy.sql, 20260715233000_validate_create_trip_with_stops.sql,
20260716005552_active_schema_grants_and_account_deletion.sql, 20260716120000_itinerary_items.sql,
20260716215756_add_itinerary_visit_duration.sql, 20260716220137_add_itinerary_place_identity.sql,
20260716233000_reservations.sql, 20260716234500_optimize_itinerary_day_apply.sql,
20260717010000_expense_splits.sql, 20260717020000_settlements.sql,
20260717030000_expense_receipts.sql, 20260717040000_trip_readiness.sql,
20260717230803_trip_collaboration.sql, 20260717233029_travel_mode_events.sql
```

### Core entities (see `types/index.ts` for exact shapes)

- **`Trip`** — title, vibe (`Road|Fly|Camp|Beach|Mountain|Backpack`), dates, currency, invite code, focus location.
- **`TripCountry`** — the country (or countries) a trip is scoped to; drives country-filtered Mapbox geocoding and Google Places search (see §7). Selected in wizard step 3.
- **`TripMember`** / **`MemberRole`** (`owner|editor|viewer`) — membership + role. `owner`/`editor` = `canEdit`; only `owner` = `canManageTrip`. RLS in `012_trip_members_authorization.sql` is the real enforcement.
- **`Stop`** — a geographic waypoint on the route (lat/lng/name/place fields), ordered.
- **`ItineraryItem`** (+ `ItineraryItemType`, `ItineraryItemStatus`) — day-by-day planned activities/stays/transport, with a status machine (`planned → on_the_way → arrived/completed/skipped`, see `lib/travel-mode.ts: STATUS_TRANSITIONS`). This is the "Days" view under Plan.
- **`RouteSegment`** — a Mapbox Directions leg between two stops (distance/duration/geometry), used for both the map polyline and derived stats (total km, drive hours).
- **`Reservation`** (+ `ReservationType`, `ReservationPaymentStatus`, `ReservationStatus`) / **`ReservationAttachment`** — Bookings tab. Attachments live in the `trip-documents` Storage bucket (created by `20260716233000_reservations.sql`).
- **`Expense`** (+ `ExpenseCategory`) / **`ExpenseSplit`** (`equal|exact|percentage`) / **`Settlement`** (`settled|reopened`) / **`ExpenseReceipt`** — Budget tab. Splits always reconcile to the expense total (UI enforces this live, see `AddExpenseSheet.tsx`); settlements track "who owes whom."
- **Packing / readiness** (`app/trip/[id]/mobile/prep/prep-logic.ts`) — `PackingItemRow` (category, assignee, quantity, priority, scope `everyone|personal|shared`) and `TripTaskRow` (category `packing|reservation|document|payment|vehicle|custom`). `computeReadiness()` derives the overall % shown at the top of the Prep screen.
- **`JournalEntry`** / **`JournalPhoto`** — daily notes + photos, feed the trip recap (§9). Photos live in the `trip-photos` bucket.
- **`TripEvent`** (`TripEventType`: `arrived|completed|photo|note|unplanned|expense-link`) — "travel mode" live event stream, merged with itinerary/journal into a single timeline via `lib/travel-mode.ts: mergeDayStory`.
- **`TripComment`** / **`TripCommentEntityType`** / **`TripActivity`** (`TripActivityType`) — collaboration layer: comments attachable to various entities, plus an activity feed of "meaningful trip changes."

### Realtime

`lib/supabase/trip-realtime.tsx` centralizes per-trip Postgres Changes subscriptions; individual Domains subscribe to just the tables they render and apply changes via small `applyRealtimeChange`-style reducers (see `prep-logic.ts` for the pattern used in Packing).

## 6. Primary user flow (verified live, 2026-07-22)

1. **Sign up** (`/sign-up`) → username + password → auto-logged-in → redirected to `/dashboard`.
2. **Create trip** (`/trips/new`, 5-step wizard, single `NewTripClient.tsx`, all state local until final submit):
   1. Name + vibe (emoji picker: Road/Fly/Camp/Beach/Mountain/Backpack)
   2. Dates (optional — trip can be dateless; unlocks countdown/day-plans/packing reminders when set)
   3. **Country** — searchable, map-based picker (`lib/trip-country-selection.ts` + generated country dataset `lib/country-data.generated.ts`, built by `scripts/generate-country-data.mjs`). This is what later scopes Mapbox place search and Google Places search to the trip's country.
   4. Budget (optional, currency picker USD/EUR/GBP/TRY)
   5. Summary + invite code generation → submits via a single Supabase RPC: `create_trip_with_stops` (see `013_create_trip_with_stops.sql`, validated further in `20260715233000_validate_create_trip_with_stops.sql`)
3. **Plan → Route tab**: add stops via a country-scoped Mapbox geocoding search sheet ("Search is limited to [Country]"). Each added stop triggers a live Mapbox Directions recompute (distance/duration toast: "Route updated · Xh Ym added"). "Optimize" reorders stops via Mapbox Optimization API (`014_reorder_trip_stops.sql` for persistence).
4. **Plan → Days tab**: per-day itinerary (`ItineraryItem`s), status transitions, drag-reorder (`20260716234500_optimize_itinerary_day_apply.sql`).
5. **Bookings tab**: add flights/stays/car rentals/etc. via a 4-step sheet (Basics → When & where → Payment → Documents); list view with type/status filters.
6. **Explore tab**: place search scoped to "Near [stop name]" chips, backed by `/api/places/search` (Google Places New, server-side key — see §7). Results include photos, address, a Google Maps deep link; can be added into the trip (as a Place/Activity/Stay/etc. via the same "Add to trip" sheet used from the map).
7. **More → Budget**: category-grouped expense list, settlement summary ("All settled up" / who-owes-whom), add-expense sheet with live equal/exact/percentage split reconciliation.
8. **More → Packing** (Trip Readiness): category-grouped checklist with per-item assignee/quantity/priority, overall % readiness bar, filter chips (All/Mine/Unassigned/Remaining), "Browse starter list" template import.
9. **More → Journal**: daily notes/photos + the **Trip Recap** card (interactive preview map + a "Preview & share recap" flow that renders a shareable PNG — see §9).
10. Other **More** entries: Members (role management), Activity (change feed), Export (.ics calendar), Offline access (local trip download).

## 7. Place search architecture (two independent providers)

This is a common point of confusion — Tripper uses **two different geocoding/place providers for two different jobs**, not one:

| Job | Provider | Entry point | Scoping |
|---|---|---|---|
| "Add a stop" search (route planning) | **Mapbox Geocoding API** | `lib/mapbox/geocoding.ts`, used from `PlanRouteDomain.tsx` | Restricted to the trip's selected country |
| "Explore" tab (restaurants/cafes/attractions/etc.) | **Google Places API (New)** | `app/api/places/search|autocomplete|details|photo/route.ts` → `lib/google-places/client.ts` | Scoped to "near [stop]" (lat/lng + radius), not raw text country filtering |

The Google Places integration is **server-only** — the browser never sees the API key. `lib/google-places/client.ts: apiKey()` reads `process.env.GOOGLE_PLACES_API_KEY` and throws a `configuration` `GooglePlacesError` (mapped to HTTP 503) if it's unset. **This is a distinct env var from `GOOGLE_MAPS_API_KEY`** (used elsewhere for a browser-side Maps key) — they are easy to conflate and the app will silently 503 on every Explore search if only `GOOGLE_MAPS_API_KEY` is set. `lib/google-places/rate-limit.ts` enforces a per-user rate limit server-side.

## 8. Route/map rendering — two different code paths, do not conflate

1. **Interactive in-app map** (`react-map-gl` + Mapbox GL JS, WebGL): used live throughout Plan/Explore/Overview. Real vector tiles, real interactivity, `mapbox://styles/mapbox/dark-v11`.
2. **Static exported images** (Mapbox **Static Images API**, plain HTTPS `GET` returning a PNG): used for non-interactive, shareable output — currently only the trip recap card (§9). This does *not* use `mapbox-gl` at all; it's a server-rendered raster image fetched with `fetch()` and drawn onto an HTML5 `<canvas>`. Path + numbered pin markers are composited by Mapbox itself (via the Static API's overlay syntax), not drawn client-side — this guarantees pixel-perfect alignment to real roads/coastline, which a naive lat/lng→pixel linear projection cannot.

If a future feature needs a "snapshot" of a route/map (export, print, social share), reach for pattern #2 and look at `lib/recap-image.ts: fetchRouteBasemap` as the reference implementation, rather than trying to screenshot the live WebGL canvas (fragile, requires the map to be mounted and idle).

## 9. Trip recap image (`lib/recap-image.ts`)

Generates a 1080×1920 (Instagram-story-format) shareable PNG summarizing the trip, triggered from Journal → "Preview & share recap" → "Share selected recap." Users opt in/out of individual fields (photo count, memory count, expense count, a quote from a journal entry, etc.) via a privacy sheet — private data (confirmation numbers, precise per-item costs, member debt) is never included by design (allowlist in `lib/travel-mode.ts: allowlistedRecapPayload`).

Rendering pipeline (`shareTripRecap`):
1. `loadRecapAssets()` — in parallel: load a real Inter `FontFace` (see the `next/font` gotcha in §2), fetch a Mapbox **Static Images API** basemap with the route path + numbered stop pins baked in server-side (`fetchRouteBasemap`, falls back to `undefined` if offline/unconfigured), and fetch the optional journal photo.
2. `renderRecapCanvas()` — pure synchronous draw: background gradient/glow, header, the route panel (real map if available, otherwise a hand-drawn vector fallback using a simple equirectangular projection), stats row, branding footer.
3. `canvas.toBlob()` → `navigator.share()` (native share sheet, mobile) or a plain file download, with a text-only fallback if canvas rendering fails entirely.

**Known limitation**: the vector fallback path (no Mapbox token / offline) uses a naive linear lat/lng→pixel projection (no Mercator correction) — acceptable as a degraded fallback, but don't reuse that projection function (`projectRoute`) anywhere accuracy matters.

## 10. Things that look like bugs but are current-state, not defects

- **"Visited" counts that look low** (e.g. `0/1`): recap's `plannedCount` = `ItineraryItem` count, not stop count. A trip with 2 stops but no itinerary items yet will show `0/0` or `1/1` — correct given the current definition, just easy to misread as broken.
- **Explore search 503s locally**: almost always the `GOOGLE_PLACES_API_KEY` vs `GOOGLE_MAPS_API_KEY` mixup from §7, not a code bug. Check env vars before debugging the request path.
- **A newly-added migration's feature "doesn't exist" in a live/staging environment**: check `scripts/check-pending-migrations.sql` before assuming the code is broken — the migration may simply not have been run yet (see §5).

## 11. Where to go deeper

- Per-route UI audit (loading/empty/error states, specific known bugs): `docs/current-mobile-baseline.md`
- Route-planning domain internals: `docs/plan-route-domain-map.md`
- Design token system: `docs/liquid-glass-design-system.md`
- Realtime collaboration design: `docs/collaboration-realtime-strategy.md`
- Mobile regression checklist (manual QA pass): `docs/mobile-regression-checklist.md`
