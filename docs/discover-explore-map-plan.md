# Discover + Explore — Unified Map Experience

**Status:** Phases 1–9 shipped (2026-08-09). See §16 for per-phase notes.
**Author:** analysis pass over the repository at `main` (2026-08-08).
**Scope:** merge the two discovery surfaces into one map-first page, define its data, state, and component architecture, and stage the work.

> **Progress**
> - **Phase 1 — done.** Country-framed full-bleed map at `/explore`.
> - **Phase 2 — done.** Curated dataset, category rail, clustered GeoJSON pin layers.
> - **Phase 3 — done (2026-08-08).** `DraggableSheet` extracted from Map Home; place cards and the detail sheet.
> - **Phase 4 — done (2026-08-08).** Add to Route, curated-only per the §18.1 decision below.
> - **Phase 5 — done (2026-08-08).** Live `food`/`museums`/`stays` layers, zoom-gated with an explicit "Search this area" button; desktop rail (§13) with hover preview; `GoogleExploreMap.tsx` deleted.
> - **Phase 6 — done (2026-08-08).** §15 edge cases 9–12/14 confirmed already covered by Phases 1–5's implementation; case 13 (a stop added elsewhere while Discover is open) was genuinely missing and got a `visibilitychange` refetch of the active trip's stops. `GooglePlacesExplorer`'s `mode` prop and the entire `mode === 'global'` branch are deleted — the component is unambiguously trip-scoped now, and `ExploreDomain.tsx` was updated to match. The "visited countries / trips / nights" stat block moved from the old globe view to `/profile`, with `getCountryCount` upgraded to prefer `trips.countries` (falling back to the legacy description regex for pre-redesign trips). `ExploreClient.tsx`, `ExploreMapbox.tsx`, `CountryCard.tsx`, `EmptyCountries.tsx`, `StarField.tsx`, `explore-ui.tsx`, `DiscoverCard.tsx`, and `explore-routes-data.ts` are deleted; `explore-logic.ts`'s `CATEGORY_CHIPS` is deleted (its other exports stay, still used by the dead-but-untouched `app/trip/[id]/mobile/explore/*.tsx` files and `tests/explore-logic.test.mts`). The `ROUTES` template data was never migrated to Tier C during Phase 2 as this doc originally implied — it's ported verbatim into `lib/discover/discover-routes.generated.ts` (with `countryCode` added) as part of this cleanup so deleting `explore-routes-data.ts` doesn't lose it; the `routes` category chip itself stays deliberately unwired (no line-layer renderer or route cards exist yet — flagged as a separate follow-up, not built here). Docs (`app-flow-overview.md`, `current-mobile-baseline.md`, `mobile-regression-checklist.md`) updated to describe Discover as the entire `/explore` experience. Full suite green (338/338), `tsc --noEmit` clean, `eslint` clean.
> - **Phase 7 — done (2026-08-08).** The `routes` chip Phase 6 left deliberately unwired now renders: a `DiscoverMapLayers` line layer (§5.2, dateline-safe camera fit reused from the places pins), `DiscoverRouteCard`/`DiscoverRouteResultsList`/`DiscoverRouteSheet` as a parallel sibling component set (not a union type threaded through the place-shaped ones — §11 kept intact), and a "Use This Route" flow ported from the retired `ExploreClient.handleUseRoute`. Full suite green (347/347), `tsc --noEmit` clean, `eslint` clean.
> - **§18.1 resolved (Phase 4):** curated places get "Add to Route" (`stops`); Google Places results are unaffected. **Revisited in Phase 5:** now that live results exist in Discover, they get "Save to itinerary" via the existing `AddPlaceToTripSheet` — see §16 Phase 5 for the exact wiring and its documented simplifications.
> - **§18 open question #12 resolved (Phase 7):** "Use This Route" offers **both** a new trip (primary, unconditional — ships the legacy clone flow verbatim) and "Add to my trip" (secondary, shown only when an editable active trip exists) — see §16 Phase 7.
> - **Phase 8 — done (2026-08-09).** OSM/Wikidata/Commons attribution audit (§18 risk #3): confirmed the seeder is Wikidata-only (no OSM/ODbL obligation), fixed `imageAttribution` to carry real Commons license/author instead of a bare filename, and corrected the persistent credit line in `DiscoverClient.tsx`. See below and §18.
> - **§18 risk #3 resolved (Phase 8):** no ODbL credit owed (no OSM data); Wikidata (CC0) and per-image Wikimedia Commons license/author are now both surfaced — see §16 Phase 8.
> - **Phase 9 — done (2026-08-09).** Design-system rewrite (§18 risk #7): every hardcoded color/blur/shadow/radius in Discover's 10 CSS Modules (`app/explore/Discover.module.css` plus 9 files under `components/discover/`) migrated onto the Liquid Glass token layer (`docs/liquid-glass-design-system.md`). 8 new shared tokens added to `app/globals.css` for values that repeated across files with no existing equivalent (accent-wash/hover/selected states, a success wash, a CTA shadow, a shared image-placeholder gradient, a neutral hover overlay, and two full-bleed map scrims). Mapbox paint-expression colors (`DiscoverMapLayers.tsx`, `lib/discover/categories.ts` `markerColor`) stay literal by design, same rationale as the existing `ACCENT*`/`GLASS_*` domain-ui exception. See §16 Phase 9.
> - **§18 risk #7 resolved (Phase 9):** Discover's CSS Modules now sit fully on the token layer instead of a mix of `var(--color-*)`/`var(--glass-*)` and hardcoded hex/rgba — see §16 Phase 9.

---

## 1. Current architecture analysis

### 1.1 There is no `/discover` route

"Discover" is a **label**, not a page. `components/ui/AppBottomNav.tsx:21`:

```ts
{ id: 'explore' as const, Icon: Compass, label: 'Discover', href: '/explore' },
```

The nav tab id is `explore`, the visible label is `Discover`, and the href is `/explore`. So the product already promises "Discover" and delivers the Explore page. The merge is therefore **not** two routes colliding — it is one route that must absorb a second, better discovery implementation that currently lives inside the trip workspace.

### 1.2 The two real discovery implementations

| | **A. Global Explore** | **B. Trip Explore** |
|---|---|---|
| Route | `/explore` | `/trip/[id]/mobile?section=explore` |
| Entry | `app/explore/page.tsx` → `ExploreClient.tsx` | `app/trip/[id]/mobile/components/ExploreDomain.tsx` |
| Engine | `components/explore/ExploreMapbox.tsx` (Mapbox globe projection) | `components/explore/GooglePlacesExplorer.tsx` |
| Map | Decorative globe, top 50% of viewport, auto-rotating | List-first; optional `GoogleExploreMap` (**Google Maps JS SDK**, second map engine) |
| Data | Hardcoded `ROUTES` array in `components/explore/explore-routes-data.ts` (8 road-trip templates) + countries derived from the user's own trips | Live Google Places (`/api/places/search`, `/api/places/details/[placeId]`, `/api/places/photo`) |
| Categories | None (two tabs: "My Countries" / "Discover") | 9 chips via `lib/google-places/category-map.ts` |
| Primary action | **Use This Route** → `create_trip_with_stops` RPC → brand-new trip | **Add to trip** → `AddPlaceToTripSheet` → insert into `itinerary_items` |
| Country awareness | Reads `trips.countries` for the "visited" globe only | Proximity from `selectedStop` or `trip.focus_lat/lng`; no country concept |
| Bottom sheet | None (a fixed 50/50 split with an `AnimatePresence` preview panel) | `MobileBottomSheet` modal sheets |

**A** is visually ambitious but data-dead (a static array). **B** is data-rich but visually a search results list. Neither is a map-first discovery experience. The unified page needs A's ambition with B's data plumbing.

### 1.3 `GooglePlacesExplorer` already has a dead global mode

`GooglePlacesExplorerProps.mode: 'global' | 'trip'` (line 23). Grep confirms **only** `ExploreDomain.tsx` mounts it, always with `mode="trip"`. The entire `mode === 'global'` branch — the trip picker, the `loadTripData` duplicate-check fetch, the `router.push('/trip/.../mobile?section=plan')` navigation — is written, tested-adjacent, and never executed. This is not waste: it is a **half-finished attempt at exactly the feature this document plans**, and it is the strongest reuse candidate in the repo.

### 1.4 Map implementations (there are four)

1. **`components/map/mapbox/TripboxMap.tsx`** — the real one. `react-map-gl/mapbox`, dark-v11, 3D building extrusions, route `Source`/`Layer` line, React `<Marker>` per point, `<Popup>` for selection, pointer-projection declutter via `lib/map-pins.declutterWaypoints`, `ResizeObserver` → `map.resize()` so a growing sheet doesn't reset the camera. Used by Dashboard (Map Home) and the trip map.
2. **`components/explore/ExploreMapbox.tsx`** — globe-projection decorative map for `/explore`; points + arcs + route path, auto-rotate.
3. **`components/trips/new/CountryGlobe.tsx`** — globe with `mapbox://mapbox.country-boundaries-v1` vector source, worldview filter, and per-ISO-code fill/glow/border layers. **This is the country-highlighting primitive the new page needs.**
4. **`components/explore/GoogleExploreMap.tsx`** — loads `maps.googleapis.com/maps/api/js` at runtime. A second map SDK, a second set of markers, a second visual language.

All Mapbox surfaces share `lib/mapbox/client.ts` (`MAPBOX_TOKEN`, `MAPBOX_DARK_STYLE`, `DEFAULT_PITCH = 55`, `DEFAULT_BEARING = -17.6`, `BUILDING_EXTRUSION_LAYER`) and `lib/mapbox/theme.ts` (`applyAppTheme`, `hideBaseMapLabels`).

### 1.5 The draggable bottom sheet already exists

`app/dashboard/DashboardClient.tsx` implements the exact interaction this plan calls for, and it is good:

- `type SheetLevel = 'collapsed' | 'half' | 'expanded'`, `SHEET_ORDER` array.
- Pointer-capture drag on the handle (`handlePointerDown/Move/Up`), `dragOffset` clamped to ±110 px, a ±45 px threshold to advance one level, and a `dragged` ref so a drag never fires the handle's `onClick`.
- `history.pushState({ mapHomeRoutePreview: true })` on open plus a `popstate` listener, so Android back collapses the sheet instead of leaving the page.
- `sheetHeight` computed from `viewportHeight` per level, fed into the map as `fitPadding.bottom` — **the map reframes itself around the sheet**, which is the single detail that makes a map-first layout feel correct.
- Styling in `app/dashboard/MapHome.module.css` (CSS Modules, not inline styles — the newer convention in this repo).

This is currently welded to Map Home. It must be extracted, not reimplemented.

`components/mobile/MobileBottomSheet.tsx` is a **different thing**: a modal dialog sheet (`role="dialog"`, `aria-modal`, focus trap, Escape, backdrop, `visualViewport` keyboard inset). It is correct for *detail* and *add-to-route* sheets and wrong for the persistent results sheet. Both are needed; do not merge them.

### 1.6 Country selection

`lib/trip-country-selection.ts` is a complete, tested (`tests/country-selection.test.mts`) country system:

- `getCountryOptions(locale)` over `lib/country-data.generated.ts` — ISO alpha-2 `code`, localized `name` via `Intl.DisplayNames`, `flag`, `lat`/`lng`, land `area`, `searchNames` with an alias table.
- `searchCountries`, `selectCountry`, `removeCountry`, `enableMultiCountry`.
- `cameraForCountries(countries) → { latitude, longitude, zoom }` — dateline-safe, area-derived zoom (`6.65 − log10(area) × 0.72`, clamped 1.55–6).
- Serialization plus `COUNTRY_SELECTION_STORAGE_KEY = 'tripper:new-trip:country-selection:v1'` (sessionStorage).

**But its only consumers are the New Trip wizard** (`app/trips/new/NewTripClient.tsx`, `components/trips/new/Step3.tsx`, `Step5.tsx`). It is wizard-scoped and cleared on completion (`Step5.tsx:71`).

Persisted country state lives on the trip: `trips.countries` jsonb (`TripCountry[]`, migration `009_trip_countries`) and `trips.focus_lat` / `focus_lng` (migration `007`). Note that `TripCountry.code` is **optional** — trips created before the country-picker redesign have `name`/`flag`/`lat`/`lng` only.

**There is no user-level "currently selected country" anywhere.** This is the one genuinely new piece of state the feature needs, and §10 defines it without duplicating the above.

### 1.7 Places data layer

Server-proxied, authed, rate-limited — well built:

- `app/api/places/{search,autocomplete,details/[placeId],photo}/route.ts`, all `runtime = 'nodejs'`.
- `requirePlacesUser` → `checkPlacesRateLimit` (Postgres `check_rate_limit` RPC, migration `20260728020000_shared_rate_limiting.sql`, keyed by userId, fails open) → `validate*Params` → `lib/google-places/client.ts`.
- `searchGooglePlaces` picks `places:searchNearby` when there is a location and no query, else `places:searchText` with optional `includedType` and `locationBias`.
- Field masks are cost-tiered: `SEARCH_FIELD_MASK` is Search-Pro-only (id, displayName, formattedAddress, primaryType, location, photos). Rating / hours / phone / website / reviews are deferred to the details call. `fieldMasksAreProductionSafe()` asserts no `*`.
- All responses `Cache-Control: private, no-store`.

**Hard constraints that shape §8:**

| Constraint | Source | Consequence |
|---|---|---|
| `radiusMeters` max **50 000** | `validation.ts` `integer(..., 100, 50_000)` | A circle cannot cover a country. |
| `limit` max **12** | `validation.ts` | No country-wide result set. |
| Rectangle/bbox restriction not exposed | `client.ts` builds only `circle` | Viewport queries need a client change. |
| `!query && (category === 'all' \|\| !location)` → 400 | `validation.ts` | A bare "show me this country" request is currently invalid. |
| `private, no-store` on everything including photos | all four routes | Photos cost a request per card, per view, per user. |

### 1.8 Route / trip model — two different "add" targets

This is the most consequential finding for the Add-to-Route flow.

**`stops`** (migrations `003`, `004`, `008`, `20260808120000`) — the *geographic route backbone*:

```ts
{ id, trip_id, name, description, lat, lng, address, arrival_date, departure_date,
  order_index, stop_type: 'origin'|'destination'|'waypoint'|'overnight',
  nights?: number,   // >= 1 = overnight, defines a trip day; 0 = day stop, adds no day
  state?, day_number?, is_favorite?, rating?, estimated_cost? }
```

- Written directly: `PlanRouteDomain.handleAddStop` inserts `{ trip_id, name, lat, lng, address, order_index: stops.length, stop_type: stops.length === 0 ? 'origin' : 'destination', created_by }`, optimistically appends, and toasts a retry on failure.
- Reordered via the `reorder_trip_stops` RPC (migration `014`); created in bulk via `create_trip_with_stops` (migrations `013`, `20260715233000`).
- `nights` is the overnight/day-stop switch. Trip length comes from `nights`, **not** stop count.

**`itinerary_items`** (migration `20260716120000` plus `20260716215756`, `20260716220137`) — the *day timeline*:

```ts
{ id, trip_id, stop_id, item_type, title, start_at, end_at, all_day, local_date, timezone,
  order_index, lat, lng, address, place_provider: 'google'|'mapbox'|null,
  external_place_id, normalized_address, duration_minutes, status, is_locked, ... }
```

- Written by `GooglePlacesExplorer.insertPlace`.
- **Critical:** the optimistic row carries `lat`/`lng`, but the DB insert deliberately sends `lat: null, lng: null, address: null` — only the Place ID and user planning content are persisted. The inline comment is explicit: *"Provider geography stays session-only in the optimistic row."*

Stops without a linked item are projected into the timeline client-side by `app/trip/[id]/mobile/itinerary-projection.ts` — no backfill needed either way.

**"Add to Route" therefore means `stops`, not `itinerary_items`.** §9 works through what that implies, including the provider-geography constraint that makes it non-trivial.

### 1.9 Supporting systems to reuse

| System | Location | Reuse |
|---|---|---|
| Duplicate detection | `lib/google-places/pure.ts` `findPlaceDuplicate`; `app/trip/[id]/mobile/explore/explore-logic.ts` `findDuplicate` (provider-id OR normalized-title + <75 m) | Checks **both** stops and items. Directly reusable. |
| Trip picker + day picker + duplicate banner | `components/explore/AddPlaceToTripSheet.tsx` (`ExploreTripOption`, `lockedTripId`, `tripDayOptions`) | Solves "multiple available trips" already. |
| Capabilities | `lib/trip-capabilities.ts` → `{ role, canEdit, canManageTrip }` | Gate every write. |
| Map pin hierarchy | `lib/map-pins.ts` `buildRouteMapPins`, `declutterWaypoints`, `tripDayCountFromDates` | Trip-route semantics; **not** for discovery pins. |
| Directions | `lib/mapbox/directions.ts` `getFullRoute`, `LatestRouteRequestController` | Route preview and "adds N min to your route". |
| Deferred map loading | `DeferredBoundary` / `DeferredFailure`, dynamic `import()` of the map module with a `mapFailed` fallback | Established pattern in both Dashboard and ExploreClient. |
| Media safety | `lib/media-url.ts` `safeCoverImageUrl` | Every remote image URL. |
| Toasts | `components/ui/toast` `showToast(msg, kind, { label, onClick })` | Add / undo / retry. |
| Reduced motion | `components/motion/ReducedMotionProvider` `useReducedMotionPreference` | Every `flyTo`/`easeTo`/transition. |
| Pure-logic test convention | `tests/*.test.mts` via `node --experimental-strip-types --test`; modules must avoid `@/` aliases (see the header comment in `explore-logic.ts`) | All new pure logic. |
| A11y contract test | `tests/accessibility-contracts.test.mts` | New controls must satisfy it. |

---

## 2. Problems with the existing separation

1. **Two implementations of "find a place"**, one dead (`ROUTES` array), one hidden inside a trip. A user who has not created a trip can never reach the good one.
2. **`mode: 'global'` is written but unmounted** — the merge is half-built and rotting.
3. **Two map SDKs** ship to the client. `GoogleExploreMap` loads the Google Maps JS API on top of `mapbox-gl` + `react-map-gl`, for a marker list Mapbox already renders better.
4. **The map is decoration, not interface.** `/explore` fixes the globe at 50 % viewport height and auto-rotates it; nothing on it is a destination you can act on.
5. **Discovery cannot feed an existing trip.** `/explore`'s only CTA clones a template into a *brand-new* trip. There is no path from "I found a nice place" to "add it to the trip I already have."
6. **Country context is unused outside the wizard.** The user picks countries in Step 3, then never sees a country-scoped anything again.
7. **`COUNTRY_COORDS` in `explore-routes-data.ts` duplicates `lib/country-data.generated.ts`** with ~50 hand-typed entries and inconsistent naming ("UK" / "United Kingdom", "Turkey" / "Türkiye").
8. **Category taxonomies disagree.** `lib/google-places/category-map.ts` (9 ids) and `explore-logic.ts` `CATEGORY_CHIPS` (9 ids, different fields) are near-duplicates that have already drifted, and the Mapbox-era `searchTerm` field is vestigial now that search goes through Google.
9. **Two visual languages.** `/explore` is inline-styled with `DUSK`/`SUNSET_GRADIENT` from `components/design/tokens`; Dashboard and Trips are CSS Modules over the Liquid Glass token layer in `globals.css`. Discover should land on the newer one.

---

## 3. Proposed unified experience

### 3.1 Information architecture

**`/explore` survives as the single discovery route.** Reasons: the nav already labels it "Discover" and points there (`AppBottomNav.tsx:21`); `app/dashboard/DashboardClient.tsx:332` deep-links to it from the collapsed-state search pill; and it is already auth-gated server-side with profile and trips prefetched (`app/explore/page.tsx`). Changing the URL buys nothing and breaks two call sites plus any PWA cache entry (`scripts/generate-sw-cache-version.mjs`).

Add `app/discover/page.tsx` as a permanent redirect to `/explore` **only** if the marketing name needs a URL. Do not run two implementations.

**The trip-scoped Explore tab stays.** It is a different job: "search near *this stop* and put it on *this day*." It keeps `GooglePlacesExplorer`, which loses its `mode` prop and becomes unambiguously trip-scoped. The new page is not a replacement for it; the two share primitives (§11), not a component.

### 3.2 What the page becomes

A full-bleed Mapbox canvas with three floating layers over it:

```
┌──────────────────────────────────────┐
│  [🇹🇷 Türkiye ▾]        [search 🔍]  │  ← country pill + search (floating, top)
│                                      │
│   ●          ●                       │
│        ●   ⬤(selected)               │  ← map canvas, full viewport
│              ●        ●              │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Must Visit · Parks · Nature · …  │ │  ← category rail (horizontal scroll)
│ ├══════════════════════════════════┤ │  ← drag handle
│ │ ▭ Cappadocia          [+ Route]  │ │
│ │ ▭ Pamukkale           [+ Route]  │ │  ← results sheet: collapsed/half/expanded
│ │ ▭ Ölüdeniz            [✓ Added]  │ │
│ └──────────────────────────────────┘ │
│  [ Map ] [ Trips ] [ Discover ] [ ● ]│  ← AppBottomNav (floating)
└──────────────────────────────────────┘
```

The map is the page. The sheet and the rail float over it, and the map's `fitPadding` accounts for both, exactly as Map Home already does.

---

## 4. UX interaction model

### 4.1 Cold open

1. The server resolves the discover country (§10.1) and passes it as a prop — no client-side flash.
2. The map mounts at `cameraForCountries([country])`, `projection: 'globe'` above zoom ~3 easing into `mercator`, with the country tinted via the `country-boundaries-v1` layers lifted from `CountryGlobe`.
3. The category rail defaults to **Must Visit**. Its pins fade in staggered (respecting reduced motion).
4. The sheet opens at **collapsed** — a one-line summary ("18 must-visit places in Türkiye") plus the first card peeking. The map owns the screen.

### 4.2 Category switch

1. Tap **National Parks** → the active layer's GeoJSON source swaps.
2. The camera `fitBounds` to the new results, but **only if** the results are not already ≥60 % within the current viewport — this avoids a jarring refit when the user has deliberately zoomed into a region.
3. The sheet auto-raises `collapsed → half` on the first category tap of a session, then respects whatever level the user last set.
4. Result count announced via `aria-live="polite"`.

### 4.3 Marker ↔ card synchronization

Single source of truth: `selectedPlaceId`.

| Action | Effect |
|---|---|
| Tap marker | `selectedPlaceId = id`; the card scrolls into view in the sheet with `scrollIntoView({ block: 'nearest' })` and gets a selected border; the sheet raises to `half` if collapsed; the map `easeTo`s the pin *offset upward* so it sits above the sheet, not behind it. |
| Tap card | Same `selectedPlaceId`; the map `easeTo`s with the same offset; no sheet level change. |
| Tap map background | `selectedPlaceId = null`. |
| Pan/zoom the map | **Nothing** for curated layers — the country result set is fixed. For live-provider layers only, a debounced (400 ms) "Search this area" *button* appears; never an automatic refetch. See §8.4. |

The "moving the map updates results" behavior from the brief is deliberately **rejected as a default**: every viewport move on a live-provider layer is a billed Places call against a per-user rate limit that fails open. A manual "Search this area" button is the standard, cheap, predictable pattern, and it makes the cost visible to the user as an intent.

### 4.4 Detail → Add to Route

Tapping a selected card's chevron (or a marker's popup) opens `DiscoverPlaceSheet` — a modal `MobileBottomSheet`, not the draggable one — with photo, name, region, category, a short blurb, and two actions:

- **Add to Route** (primary) → §9.
- **Save to itinerary** (secondary, only when a trip is active) → the existing `AddPlaceToTripSheet` path, unchanged.

After a successful add the card's button flips to a non-interactive **✓ In your route** and the marker gets the route-accent treatment. This state is derived, never stored twice (§10).

---

## 5. Map architecture

### 5.1 A new `DiscoverMap`, not a `TripboxMap` retrofit

`TripboxMap` encodes trip-route semantics deeply: day-number badges, `role: start|end|waypoint`, `kind: overnight|waypoint`, `beyondDates` dashed styling, terminal diamonds, and a per-camera-settle `map.project()` declutter pass over every point. Discovery pins have none of those meanings and many more instances. Forcing both through one component would mean a prop union where half the props are always undefined.

**Recommendation:** `components/discover/DiscoverMap.tsx` as a sibling, sharing `lib/mapbox/client.ts`, `lib/mapbox/theme.ts`, the `.mapboxgl-ctrl-*` styling block, the `ResizeObserver → map.resize()` pattern, and the dynamic-import + `onMapError` fallback convention.

### 5.2 GeoJSON source + clustering, not React markers

This is the central performance decision.

`TripboxMap` renders one React `<Marker>` per point. Each is a real DOM node repositioned by `mapbox-gl` on every frame. At 15–30 trip stops that is fine. At 200–2 000 discovery pins it is not: the declutter effect alone runs `map.project()` per point on every `moveend`, and React reconciles the full marker array on every `selectedId` change.

**Recommendation:**

```
Source (geojson, cluster: true, clusterRadius: 48, clusterMaxZoom: 12)
├── Layer  discover-clusters        (circle, radius/color stepped by point_count)
├── Layer  discover-cluster-count   (symbol, text-field {point_count_abbreviated})
├── Layer  discover-pin             (circle or symbol, icon by category)
└── Layer  discover-pin-selected    (circle, filter ['==', ['get','id'], selectedId])
```

- Clustering, hit-testing, and label collision run on the GPU / in the Mapbox worker. Zero React reconciliation on pan or zoom.
- Selection is a **filter expression change**, not a re-render.
- `queryRenderedFeatures` on click resolves the tapped feature; cluster clicks call `getClusterExpansionZoom` → `easeTo`.
- The only React `<Marker>` retained: the selected-place callout, if a richer popup than `<Popup>` is wanted (≤1 node at a time).

Category icons: register once via `map.addImage()` from an inline SVG sprite at `style.load`, and re-register on style reload, as `TripboxMap.handleLoad` already does for `applyAppTheme`. This avoids any external sprite fetch under the app's CSP posture.

### 5.3 Country framing

Lift the `country-boundaries-v1` layer stack from `CountryGlobe.tsx` into `lib/mapbox/country-layers.ts` (pure config plus `countryFilter(codes)` and `WORLDVIEW_FILTER`) so both the wizard globe and `DiscoverMap` use one definition. Discover uses a subtler treatment than the wizard's `#D16830 @ 0.5` fill — a ~0.12-opacity tint plus the border line, so pins stay legible.

Keep the wizard's `worldview` filter verbatim. It is a deliberate, sensitive choice and must not be re-derived.

### 5.4 Camera policy

| Trigger | Behavior |
|---|---|
| Initial | `cameraForCountries([country])`, `pitch: 0` — a country view should be flat; the 55° trip pitch is for routes |
| Category change | `fitBounds` over results, sheet-aware `padding`, `maxZoom: 9` |
| Place selected | `easeTo` centered on a point offset up by `sheetHeight / 2`, `zoom: max(current, 10)` |
| Cluster tap | `getClusterExpansionZoom` → `easeTo` |
| Sheet level change | No camera move; only `fitPadding` changes (matches Map Home) |
| `prefers-reduced-motion` | Every `duration: 0` |

---

## 6. Bottom-sheet architecture

### 6.1 Extract the Map Home sheet

Create `components/mobile/DraggableSheet.tsx` plus `DraggableSheet.module.css` by lifting from `DashboardClient.tsx` (lines ~113–128, 214–264, 293–300) and `MapHome.module.css`:

```ts
export type SheetLevel = 'collapsed' | 'half' | 'expanded'

export interface DraggableSheetProps {
  level: SheetLevel
  onLevelChange: (level: SheetLevel) => void
  /** Heights in px per level, given the viewport height. Owner-supplied so Map Home keeps its exact numbers. */
  heightFor: (level: SheetLevel, viewportHeight: number) => number
  /** Wire browser-back to collapse (Map Home's history.pushState trick). Default true. */
  historyIntegration?: boolean
  label: string
  header?: ReactNode   // sticky, non-scrolling (the category rail lives here)
  children: ReactNode  // scrolls
}
```

Keep every behavior verbatim: pointer capture, ±110 px clamp, ±45 px threshold, the `dragged` ref guard, `history.pushState`/`popstate`, `aria-expanded` on the handle. Migrating `DashboardClient` onto it is part of Phase 3 and must be behavior-identical (`tests/map-home.test.mts` and the a11y contract test guard this).

### 6.2 Level heights for Discover

| Level | Height | Content |
|---|---|---|
| `collapsed` | 118 px | Result count plus the first card partially visible |
| `half` | `round(vh × 0.45)` | ~3 cards; the primary browsing state |
| `expanded` | `max(390, vh − 170)` | Full list; the map is reduced to a strip |

`fitPadding.bottom = min(vh − 150, sheetHeight + 92 + 18)` — the Map Home formula, where 92 is the floating-nav clearance.

### 6.3 Virtualization

**Not in the initial build.** Curated country layers are 20–150 items. Below ~200 rows with fixed-height cards, `content-visibility: auto` plus `contain-intrinsic-size` gets most of the win for zero dependency and zero scroll-position complexity. Revisit only if a category exceeds ~300 items — and the fix there is server-side paging (§8.5), not a virtualizer.

---

## 7. Category / layer architecture

### 7.1 Recommended taxonomy

Two layer *kinds*, because they have different data sources, different costs, and different zoom behavior. Making that distinction structural — rather than presenting ten visually identical chips — is what keeps the system honest.

**Curated layers** (own data, country-scoped, free, work at any zoom):

| id | label | icon | notes |
|---|---|---|---|
| `must_visit` | Must Visit | ★ | Default. Curated top ~20 per country. |
| `national_parks` | National Parks | 🌲 | |
| `nature` | Nature | 🏞 | Waterfalls, canyons, lakes, caves, hot springs |
| `viewpoints` | Scenic Views | 👁 | |
| `landmarks` | Landmarks | 🏛 | Historic sites, monuments, ruins |
| `cities` | Cities & Towns | 🏙 | Route-relevant: these become overnight stops |
| `beaches` | Beaches | 🏖 | |
| `hidden_gems` | Hidden Gems | 💎 | A cross-cutting flag, not a place type |
| `routes` | Road Trips | 🛣 | The existing `ROUTES` templates, as polylines |

**Live layers** (Google Places, viewport-scoped, billed, gated to zoom ≥ 10):

| id | maps to |
|---|---|
| `food` | `restaurants` + `cafes` in `category-map.ts` |
| `museums` | `museums` |
| `stays` | `hotels` |

Rationale for splitting the brief's flat list: "Museums" and "Food" are dense, city-scale, and change often — perfect for Places. "National Parks" and "Beaches" are sparse, country-scale, stable, and photogenic — terrible for a 50 km-radius billed API and perfect for a curated table. Trying to serve both from one mechanism forces either a bad UX (empty country-zoom results) or a bad bill.

### 7.2 One taxonomy module

Create `lib/discover/categories.ts` — **no `@/` imports**, so `tests/discover-categories.test.mts` can load it:

```ts
export type DiscoverSource = 'curated' | 'places'

export interface DiscoverCategory {
  id: DiscoverCategoryId
  label: string
  source: DiscoverSource
  /** Curated: matches DiscoverPlace.categories. Places: the GooglePlaceCategoryId to proxy. */
  placesCategory?: 'restaurants' | 'cafes' | 'museums' | 'hotels'
  /** Live layers are hidden below this zoom, where a 50 km circle is meaningless. */
  minZoom?: number
  /** Default when this category's place becomes a stop. */
  defaultStopNights: 0 | 1
  markerColor: string
}
```

`defaultStopNights` is the bridge to §9: a `cities` result added to a route defaults to `nights: 1` (an overnight that creates a trip day); a `viewpoints` result defaults to `nights: 0` (a day stop you drive through). This respects `20260808120000_stop_overnight_semantics.sql` instead of working around it.

Adding a category later is one entry in this array plus, for curated layers, tagging rows in the dataset. No component changes.

### 7.3 Retire the duplicate taxonomies

`explore-logic.ts` `CATEGORY_CHIPS` is Mapbox-era; its `searchTerm` field is unused now that search goes through Google. Delete it. `lib/google-places/category-map.ts` stays as the Places-provider mapping and becomes an implementation detail that `lib/discover/categories.ts` references by id.

---

## 8. Data strategy

### 8.1 What exists today

- **Coordinates:** yes — `stops.lat/lng`, `trips.focus_lat/lng`, `trips.countries[].lat/lng`, `ROUTES[].waypoints[]`, and Google Places `location`.
- **Country metadata:** yes — `lib/country-data.generated.ts` (code, name, nativeNames, flag, lat, lng, area) for every country.
- **State/region metadata:** **no.** `stops.state` exists as a nullable column and is unpopulated. The brief's "State / province / region" card line has no source today.
- **Images:** partially. Google photos exist but only via the authed `private, no-store` `/api/places/photo` proxy. Curated destinations have **no** images (`ROUTES` uses emoji). There is a `trip-photos` Supabase Storage bucket and `lib/trip-photo.ts` / `lib/media-url.ts`.
- **A destination database:** **no.** `ROUTES` (8 road-trip templates, 123 lines) is the entire owned destination corpus.
- **Mapbox POI data:** not used for discovery. `lib/mapbox/geocoding.ts` exists for place lookup; POI search moved to Google.

### 8.2 Why the current Places integration cannot serve country-scale discovery

Restating §1.7's constraints as a conclusion: `searchNearby` maxes at a 50 km circle; `searchText` maxes at 12 results here (20 upstream); `validateSearchParams` rejects a location-less category query outright. "Show me every national park in Türkiye" is **not expressible** against this API surface, and making it expressible would mean paginating dozens of billed Text Search calls per country per user with `no-store` caching. That is the wrong shape for stable, curated content.

### 8.3 Recommended three-tier model

**Tier A — curated, owned (the backbone).**

Start as a **generated static module**, exactly mirroring the existing `lib/country-data.generated.ts` convention:

```
lib/discover/discover-places.generated.ts   // built by scripts/generate-discover-places.mjs
```

```ts
export interface DiscoverPlace {
  id: string                  // stable slug: 'tr-cappadocia'
  name: string
  countryCode: string         // ISO 3166-1 alpha-2, joins to country-data.generated
  region: string | null       // state/province — fills the card's second line
  lat: number
  lng: number
  categories: DiscoverCategoryId[]   // a place can be both 'nature' and 'must_visit'
  rank: number                // 0–100, drives Must Visit selection and label priority
  blurb: string | null        // <= 140 chars
  imageUrl: string | null     // https, validated by safeCoverImageUrl
  imageAttribution: string | null
  suggestedHours: number | null
}
```

Seeding: a build-time script against **Wikidata SPARQL** (`P31` instance-of national park / beach / museum / mountain, `P17` country, `P625` coordinates, `P18` image) and/or **OpenStreetMap via Overpass**, both openly licensed with attribution, both queryable offline into a committed artifact. Manual curation on top for `must_visit` and `rank`. **This is a build-time dependency, not a runtime one** — no new production API, no new key, no new failure mode, no per-user cost.
**As shipped (Phase 2), the "and/or" resolved to Wikidata only** — `scripts/generate-discover-places.mjs` never queries Overpass/OSM. See §18 risk #3 (Resolved, Phase 8) for what that means for attribution.

Size check: ~120 places × ~200 bytes ≈ 24 KB per country. Ship the full world only if it stays under ~500 KB gzipped; otherwise emit one module per country and dynamic-`import()` by code — the country is known at render time, so this is a clean split.

**Promote to Postgres** (a `discover_places` table plus a `discover_places_in_bbox(bbox, categories, limit)` RPC, RLS `select` for `authenticated`) once the dataset outgrows the bundle or needs editing without a deploy. Designing the static shape to match the future row shape makes that migration a swap of one fetch function.

**Tier B — live provider (existing, unchanged where possible).**

`food` / `museums` / `stays` reuse `/api/places/search` verbatim: `{ category, lat, lng, radius: 50000, limit: 12 }` from the viewport center, gated to zoom ≥ 10, fired only on an explicit "Search this area". No API change needed for the first release.

**Tier C — routes.**

`ROUTES` moves from `components/explore/explore-routes-data.ts` into `lib/discover/discover-routes.generated.ts` with `countryCode` added, rendered as a `line` layer plus cards, keeping the existing `create_trip_with_stops` "Use this route" flow intact.

### 8.4 Geographic filtering strategy

| Layer | Filter | Where |
|---|---|---|
| Curated | `place.countryCode === country.code`, then `categories.includes(active)` | Pure function `filterDiscoverPlaces()` in `lib/discover/discover-query.ts`, alias-free and unit-tested |
| Curated, dense zoom | Optional bbox narrowing from `map.getBounds()` for the *sheet list only* — pins always show the full country set so the map never looks empty | Same module |
| Live | Viewport center plus a 50 km circle, on demand | Existing `/api/places/search` |

Bounding-box math (dateline-safe, mirroring `cameraForCountries`'s wrapped-longitude handling) belongs in `lib/discover/discover-query.ts` with its own test.

### 8.5 Caching

| Data | Strategy |
|---|---|
| Curated places | Static import → in the JS bundle → HTTP-cached by Next's immutable asset hashing. Free. |
| Curated places (post-Postgres) | Route handler with `Cache-Control: public, s-maxage=86400, stale-while-revalidate` — safe because the content is **not user-specific**, unlike every existing `/api/places/*` route. |
| Places results | Client-side `Map<queryKey, results>` for the session, keyed like the existing `queryKey` in `GooglePlacesExplorer` (`${q}|${category}|${lat}|${lng}|${nonce}`). Never persisted — provider terms and the `no-store` posture. |
| Photos | Curated images are plain `https` URLs → normal browser cache. Google photos stay on the authed proxy and appear **only in the detail sheet**, never in list cards. |

That last row matters: putting Google photos on list cards would mean 12 authed, uncacheable, rate-limited image requests per category tap.

### 8.6 Scalability

- The curated corpus is bounded by curation (~100–200 per country); clustering handles rendering.
- Live layers are bounded by `limit: 12` server-side.
- A country with a huge corpus degrades gracefully: `rank`-ordered `slice(0, N)` for pins with a "showing top N" note, and the full list paged in the sheet (`sliceByPage` in the pure query module).
- The Mapbox source holds all features regardless; clustering is O(n log n) in the worker, comfortable to ~10⁴.

---

## 9. Add-to-Route integration

### 9.1 The two targets, decided

**Primary — "Add to Route" writes a `stops` row.** A discovery place is a geographic waypoint on the journey, which is precisely what `stops` models. The payload mirrors `PlanRouteDomain.handleAddStop` exactly:

```ts
{ trip_id, name, lat, lng, address,
  order_index: stops.length,
  stop_type: stops.length === 0 ? 'origin' : 'destination',
  nights: category.defaultStopNights,   // 1 for cities, 0 for POIs — see §7.2
  created_by: currentUserId }
```

Appending at `order_index: stops.length` is deliberate: inserting mid-route is a Plan-screen decision with a drag handle and an optimize preview (`route-optimizer.ts`, `reorder_trip_stops`). Discover appends; Plan arranges. The success toast offers **"Reorder in Plan"** as its action.

**Secondary — "Save to itinerary" writes an `itinerary_items` row** via the untouched `AddPlaceToTripSheet` → `insertPlace` path, for a museum or restaurant that belongs on a day rather than on the route.

### 9.2 ⚠ Open blocker: provider geography on stops

`GooglePlacesExplorer.insertPlace` deliberately persists `lat: null, lng: null, address: null` for Google-sourced items, keeping only `external_place_id`. The comment is unambiguous about this being a deliberate constraint, not an oversight.

But **a stop without `lat`/`lng` cannot exist** — it is the route backbone; Directions, map pins, and `create_trip_with_stops` all require coordinates.

Therefore:

| Source | May become a stop? |
|---|---|
| **Tier A curated** (our own Wikidata/OSM-derived coordinates) | ✅ Yes — the coordinates are ours. This is the main "Add to Route" path and it is unblocked. |
| **Tier C routes** | ✅ Yes — already done today by `handleUseRoute`. |
| **Tier B Google Places** | ❌ **Not without resolution.** Options: (a) offer only "Save to itinerary" for Places results — zero risk, ships now; (b) resolve the place to independent coordinates via `lib/mapbox/geocoding.ts` before inserting; (c) obtain a legal read that persisting `location` alongside a stored Place ID is permitted. |

**Recommendation: ship (a).** Curated places — which are the entire point of the country-scale Must Visit / Parks / Beaches experience — get **Add to Route**. Google-sourced results get **Save to itinerary**, matching exactly what the app does today. The button label is therefore driven by `category.source`, which the taxonomy already carries. Revisit (b)/(c) as a separate decision; do not let it block Phases 1–4.

### 9.3 Edge cases

| Case | Behavior |
|---|---|
| **No active trip** | The button reads **"Start a trip here"** → `create_trip_with_stops` with `p_countries: [country]`, `p_focus_lat/lng`, and this place as `order_index: 0`, `stop_type: 'origin'` — the `handleUseRoute` pattern from `ExploreClient.tsx:220`. Omit `nights` for cities (the RPC reads an omitted count as one night per `20260808120000`); send `nights: 0` explicitly for day-stop POIs. Then `router.push('/trip/{id}/mobile?section=plan')`. |
| **Exactly one editable trip** | One-tap add, no sheet. Toast: `Added {name} to {trip}` plus "Reorder in Plan". |
| **Multiple trips** | Open `AddPlaceToTripSheet` with its existing trip picker, extended with a Route/Itinerary target toggle. Remember the last-used trip in the discover session state. |
| **Viewer role** | The `trips` prop already carries `role`; `AddPlaceToTripSheet` already filters `role !== 'viewer'`. If every trip is viewer-only, show "Start a trip here". |
| **Duplicate** | `findPlaceDuplicate` (checks stops **then** items) → the sheet's existing duplicate banner with "View existing". For curated places, also match on `id` if a `discover_place_id` column is added later; until then, name plus <75 m distance is sufficient. |
| **Already in route** | The card button renders `✓ In your route`, `disabled`, `aria-disabled`. Derived per render from the active trip's stops (§10) — never a second state store. |
| **Place in a different country than the trip** | Allow it, with an inline note: "Not in {trip country}". Multi-country trips are first-class (`enableMultiCountry`, `trips.countries[]`). Do not block. |
| **Offline / insert fails** | Optimistic append plus rollback plus `showToast(..., 'error', { label: 'Retry' })` — the `handleAddStop` contract verbatim. |
| **Unauthenticated** | Cannot occur: `app/explore/page.tsx` redirects to `/login`. If guest login is enabled (`app/api/auth/guest`), guests hit the same capability gates. |
| **Realtime collision** | The trip page subscribes via `lib/supabase/trip-realtime.tsx`, so a stop added from Discover appears in an open Plan tab. Discover itself does **not** subscribe — it refetches the active trip's stops on focus, which is cheaper and sufficient. |

---

## 10. State management

### 10.1 Selected country — the one new piece of state

No user-level country state exists (§1.6). Introduce it **without** a second picker, resolved server-side in `app/explore/page.tsx` by this precedence:

1. `?country=TR` search param — deep links, shareable, back/forward-friendly.
2. `localStorage['tripper:discover:country:v1']` — the user's last explicit Discover choice, hydrated client-side and reconciled after mount.
3. The featured trip's first country — reuse `selectFeaturedTrip()` from `lib/map-home.ts` (already used by Dashboard), then `trip.countries[0]` by `selectionOrder`.
4. Any most-recently-updated trip's first country.
5. Fall back to a world view (`cameraForCountries([])` → `{ 18, 8, zoom: 1.15 }`) with an empty state that prompts a country choice.

Changing the country writes the URL (`router.replace`, shallow) **and** localStorage. One value, two durable homes, no React duplicate.

The picker itself reuses `getCountryOptions()` and `searchCountries()` in a `MobileBottomSheet` — the Step 3 UI without the wizard's multi-select. **Do not** reuse `COUNTRY_SELECTION_STORAGE_KEY`; that key belongs to the wizard and is deleted on wizard completion.

Legacy-data note: `TripCountry.code` is optional. Add `resolveCountryCode(name)` to `lib/trip-country-selection.ts`, matching against `searchNames` via the existing `normalizeCountrySearch`, so pre-redesign trips still resolve.

### 10.2 Ownership table

| State | Owner | Storage | Rationale |
|---|---|---|---|
| Selected country | `DiscoverClient` | URL param + localStorage | Shareable, survives reload; §10.1 |
| Active category | `DiscoverClient` | URL param `?cat=` | Back button returns to the previous layer |
| Map viewport | **mapbox-gl instance** | Not React state | Read imperatively via `mapRef`; mirroring it into state causes a render per frame |
| "Search this area" pending | `DiscoverClient` | React state | Set by a debounced `moveend`, cleared on fetch |
| Curated places (all) | Module import | — | Static, immutable |
| Visible places | Derived `useMemo` | — | `filterDiscoverPlaces(all, country, category, bbox?)` |
| Live results | `DiscoverClient` | React state + session `Map` cache | Mirrors `GooglePlacesExplorer.searchState` |
| Selected place id | `DiscoverClient` | React state | Single source for both the marker filter and the card highlight |
| Sheet level | `DiscoverClient` | React state + `history.state` | Map Home's pattern |
| Active trip + stops + items | Server component → props; refetch on `visibilitychange` | — | The trip page owns live editing; Discover reads |
| "Already added" set | Derived `useMemo` over stops + items | — | **Never stored.** A `Set` of normalized keys via `findPlaceDuplicate` inputs |
| Add-in-flight | `DiscoverClient` | React state | Disables the button; matches `saving` in `insertPlace` |

No context provider. `DiscoverClient` is one client component below a server component that has already fetched profile, trips, and the active trip's stops — mirroring `app/explore/page.tsx`'s existing shape. Reach for context only if prop depth exceeds ~3 levels, which this tree does not.

---

## 11. Component architecture

```
app/explore/page.tsx                          (server: auth, profile, trips,
│                                              featured/active trip + its stops,
│                                              resolved country)
└── app/explore/DiscoverClient.tsx            (client: all state from §10.2)
    ├── components/discover/DiscoverMap.tsx            NEW — GeoJSON + clusters (§5)
    │   ├── lib/mapbox/country-layers.ts               NEW — extracted from CountryGlobe
    │   └── components/discover/DiscoverMapLayers.tsx  NEW — Source/Layer definitions
    ├── components/discover/DiscoverTopBar.tsx         NEW — country pill + search entry
    │   └── components/discover/CountryPickerSheet.tsx NEW — wraps MobileBottomSheet,
    │                                                   reuses getCountryOptions/searchCountries
    ├── components/mobile/DraggableSheet.tsx           NEW — extracted from DashboardClient (§6.1)
    │   ├── components/discover/DiscoverCategoryRail.tsx NEW — sticky header slot
    │   └── components/discover/DiscoverResultsList.tsx  NEW
    │       └── components/discover/DiscoverPlaceCard.tsx NEW — image, name, region,
    │                                                        meta line, AddToRouteButton
    ├── components/discover/DiscoverPlaceSheet.tsx     NEW — detail, uses MobileBottomSheet
    ├── components/discover/AddToRouteButton.tsx       NEW — the four states of §9
    ├── components/explore/AddPlaceToTripSheet.tsx     REUSED — plus a target toggle
    └── components/ui/AppBottomNav.tsx                 REUSED — unchanged
```

Pure logic (alias-free, unit-tested per repo convention):

```
lib/discover/categories.ts                   NEW — taxonomy (§7.2)
lib/discover/discover-query.ts               NEW — filter, bbox, rank, paging
lib/discover/add-to-route.ts                 NEW — stop payload builder, nights
                                                   resolution, duplicate gating
lib/discover/discover-places.generated.ts    NEW — Tier A dataset
lib/discover/discover-routes.generated.ts    NEW — Tier C (from explore-routes-data)
scripts/generate-discover-places.mjs         NEW — build-time seeder
```

### Reused as-is

`lib/mapbox/{client,theme,directions,geocoding}.ts` · `lib/trip-country-selection.ts` (plus one new `resolveCountryCode`) · `lib/country-data.generated.ts` · `lib/map-home.ts` `selectFeaturedTrip` · `lib/google-places/*` (whole stack, unchanged) · `lib/trip-capabilities.ts` · `lib/media-url.ts` · `components/mobile/MobileBottomSheet.tsx` · `components/motion/ReducedMotionProvider` · `components/ui/toast` · `components/ui/deferred-boundary`.

### Retired

| File | Disposition |
|---|---|
| `app/explore/ExploreClient.tsx` | Replaced by `DiscoverClient`. |
| `components/explore/ExploreMapbox.tsx` | Replaced by `DiscoverMap`. |
| `components/explore/{CountryCard,EmptyCountries,StarField,explore-ui}.tsx` | Belong to the globe view. The "countries visited / trips / nights" stat block is a **passport**, not discovery — relocate it to `/profile`. |
| `components/explore/DiscoverCard.tsx` | Superseded by `DiscoverPlaceCard`; the route-template preview folds into the `routes` layer. |
| `components/explore/explore-routes-data.ts` | `ROUTES` → `discover-routes.generated.ts`; **`COUNTRY_COORDS` deleted** (duplicates `country-data.generated.ts` with inconsistent names). |
| `components/explore/GoogleExploreMap.tsx` | **Delete** — removes the second map SDK. Places results render on `DiscoverMap`. |
| `GooglePlacesExplorer` `mode` prop and `mode === 'global'` branch | Delete; the component becomes unambiguously trip-scoped. |
| `explore-logic.ts` `CATEGORY_CHIPS` | Superseded by `lib/discover/categories.ts`. Keep `findDuplicate` / `distanceMeters` / `normalizeTitle`. |

---

## 12. Mobile behavior

- Full-bleed map behind `100svh`; safe-area insets on the top bar and via `AppBottomNav`'s existing `env(safe-area-inset-bottom)`.
- All touch targets ≥ 44 px (`tests/accessibility-contracts.test.mts`).
- Sheet drag uses pointer capture with `touch-action: none` on the handle only, so the card list keeps native momentum scrolling.
- Map gestures: one-finger pan, pinch zoom, `dragRotate: false` and `pitch: 0` — rotation on a country view is disorienting and costs frames.
- The sheet at `expanded` still leaves ~170 px of map: the user must never lose the canvas.
- Android back: collapses the sheet, then closes the detail sheet, then leaves — the `history.pushState` ladder from Map Home.
- Marker tap targets: `circle-radius` ≥ 9 px with an invisible `circle-stroke-width` halo for hit area at low zoom.
- Photos: `loading="lazy"`, `decoding="async"`, fixed 16:10 boxes to prevent layout shift while scrolling.
- Reduced motion: no staggered pin fade, no camera flights, instant sheet transitions.

## 13. Desktop behavior

Same components, one breakpoint. At ≥ 1024 px the `DraggableSheet` renders as a **fixed left rail** (400 px, full height, no drag handle, `level` locked to `expanded`) with the map filling the remainder — the standard map-app layout. `fitPadding` swaps from bottom-weighted to left-weighted. The category rail sits at the top of the rail. Hovering a card previews its marker (`hoveredPlaceId`, a `case` expression on the pin layer's `circle-radius`) — a mobile-impossible affordance worth having.

No separate desktop component: one `isWide` boolean from a `matchMedia('(min-width: 1024px)')` hook drives the layout class and the padding shape.

## 14. Performance considerations

| Concern | Mitigation |
|---|---|
| Marker count | GeoJSON source plus native clustering (§5.2). No React node per pin. |
| Selection re-render | A Mapbox `filter` expression, not a React array map. |
| Viewport churn | The map viewport is **never** React state. `moveend` is debounced 400 ms and only sets a boolean. |
| Bundle | `mapbox-gl` stays behind the existing dynamic `import()` plus `DeferredBoundary` pattern. Deleting `GoogleExploreMap` removes the Google Maps JS API entirely. |
| Dataset size | Static module, per-country split if > ~500 KB gzipped (§8.3). |
| Images | Curated `https` URLs, browser-cached, lazy. Google photos confined to the detail sheet. |
| List scroll | `content-visibility: auto` plus `contain-intrinsic-size`; no virtualizer until >300 rows. |
| Sheet drag | `transform: translateY()` only, on a `will-change: transform` element. Never animate `height`. |
| Map resize | The existing `ResizeObserver → map.resize()` from `TripboxMap`, which explicitly does not touch the camera. |
| Mobile GPU | `pitch: 0`, no 3D building extrusions on Discover, no fog above zoom 4, no auto-rotate. |
| Re-renders | `useMemo` on every derived collection; `useCallback` on every handler passed to the map; the "already added" `Set` computed once per stops change. |

## 15. Edge cases

| # | Case | Behavior |
|---|---|---|
| 1 | Country has no curated places | Empty state: "We haven't mapped {country} yet" plus a nudge to the Food/Museums live layers and "Search a place". Never a blank map. |
| 2 | Category empty for the country | Same shape, scoped: "No national parks mapped in {country} yet." |
| 3 | `NEXT_PUBLIC_MAPBOX_TOKEN` missing | The `MapFallback` pattern; the sheet still renders the full list. Discovery degrades to a list, not to nothing. |
| 4 | Map fails to load / offline | `onMapError → setMapFailed(true)` plus a `navigator.onLine` listener — both already in `DashboardClient`. |
| 5 | Places rate-limited (429) | `GooglePlaceErrorCode = 'rate_limited'` with `retryAfterSeconds`; inline message plus retry. Curated layers unaffected — the point of the split. |
| 6 | Places misconfigured (no key) | Live categories hidden entirely rather than shown-then-erroring. |
| 7 | Legacy trip country without `code` | `resolveCountryCode(name)`; unresolvable → world view. |
| 8 | Trip spans multiple countries | The country pill lists them; switching is one tap. Adding across countries is allowed (§9.3). |
| 9 | Two places at identical coordinates | A cluster of 2 at any zoom; expansion caps at `maxZoom`, so the sheet is the disambiguator. |
| 10 | Dateline-crossing country (Fiji, US, RU) | `cameraForCountries` already handles wrapped longitude; the new bbox helper must too, with a test. |
| 11 | Very large country (RU, CA) | `area`-derived zoom already handles framing; `rank`-capped pin count handles density. |
| 12 | Add fires twice (double tap) | A `savingId` guard plus `disabled`, mirroring `saving` in `insertPlace`. |
| 13 | Stop added elsewhere while Discover is open | Refetch stops on `visibilitychange`; the duplicate check catches the race at insert time regardless. |
| 14 | Sheet expanded with the keyboard open (search) | Search lives in a `MobileBottomSheet`, which already handles `visualViewport` insets. |
| 15 | `prefers-reduced-motion` | §12. |
| 16 | Guest user | Same capability gates; `trips` is empty, so "Start a trip here" appears everywhere. |
| 17 | Deep link to a live category at zoom < 10 | Show the curated default with a note that the layer needs a closer view. Never a silent empty. |

---

## 16. Implementation phases

### Phase 1 — Shell and map-first layout ✅ shipped 2026-08-08

**Goal:** `/explore` is a full-bleed map framed on the resolved country, with a static sheet. No categories, no data beyond the country.

- **Create:** `app/explore/DiscoverClient.tsx`, `components/discover/DiscoverMap.tsx`, `DiscoverMapLayers.tsx`, `DiscoverTopBar.tsx`, `CountryPickerSheet.tsx`, `lib/mapbox/country-layers.ts`, `Discover.module.css`.
- **Change:** `app/explore/page.tsx` (resolve country, fetch featured-trip stops), `lib/trip-country-selection.ts` (add `resolveCountryCode`), `components/trips/new/CountryGlobe.tsx` (import the extracted layers).
- **Reuse:** `cameraForCountries`, `getCountryOptions`, `searchCountries`, `selectFeaturedTrip`, `MobileBottomSheet`, `DeferredBoundary`, `AppBottomNav`.
- Keep `ExploreClient.tsx` on disk but unmounted until Phase 6, so the old page can be restored in one line.
- **Risks:** country resolution has five branches — get it wrong and users land on the wrong continent. Legacy `TripCountry` without `code`.
- **Tests:** `tests/discover-country.test.mts` (resolution precedence including legacy names, dateline, empty); extend `tests/country-selection.test.mts` for `resolveCountryCode`.

### Phase 2 — Categories and map layers ✅ shipped 2026-08-08

**Goal:** the category rail switches GeoJSON layers over curated data; clustering works.

**What landed, and where it diverged from this section:**

- `lib/discover/categories.ts`, `lib/discover/discover-query.ts` (both alias-free), `lib/discover/discover-places.generated.ts`, `scripts/generate-discover-places.mjs`, `components/discover/DiscoverCategoryRail.tsx` + module CSS. `DiscoverMapLayers`, `DiscoverMap`, `DiscoverClient`, `Discover.module.css` and `app/explore/page.tsx` changed as planned.
- **The taxonomy ships 7 curated + 3 live categories, not 9 + 3.** `hidden_gems` and `routes` are deliberately *absent* from `DISCOVER_CATEGORIES`: neither has data yet, and a chip that can only ever render an empty state is worse than no chip. `hidden_gems` needs a human curation pass; `routes` lands with Tier C. Both are documented at the foot of `categories.ts`.
- **The rail renders curated layers only.** Live chips join it in Phase 5, when they are actually wired to `/api/places/search`.
- **Category icons are not registered via `map.addImage()`.** Pins are `circle` layers coloured by the active category, plus a rank-sorted `symbol` label layer. One category renders at a time, so a per-feature icon sprite bought nothing; revisit only if several layers ever render at once.
- **The seeder is resumable.** A full seed is dozens of slow public-endpoint queries, so each country is cached under `scripts/.discover-cache/` (gitignored); `--refresh` bypasses it. Queries run **one Wikidata class at a time** — a 7-class `VALUES` union with subclass traversal reliably 504s on large countries.
- **`must_visit` is a per-category quota, not a global top-N.** Sitelink counts run an order of magnitude higher for cities than for waterfalls, so a global cut made Must Visit a list of cities in every country.
- The seeder filters historical entities (`P576`, `Q19953632`) and reads `P131` only from statements without an end qualifier — otherwise Constantinople outranks Cappadocia and cities show Ottoman-era vilayets as their region.
- **Attribution (§18 risk #3), fully resolved in Phase 8:** the sheet carried a persistent "Places from Wikidata · photos from Wikimedia Commons" credit from Phase 2 on; Per-file `imageAttribution` is carried on every row and surfaces in the Phase 3 detail sheet. See §16 Phase 8 for the full audit and the fix to `imageAttribution`'s content.
- `tests/discover-categories.test.mts`, `tests/discover-query.test.mts`, and a new rail/list case in `tests/accessibility-contracts.test.mts`. Full suite green.

- **Create:** `lib/discover/categories.ts`, `discover-query.ts`, `discover-places.generated.ts`, `scripts/generate-discover-places.mjs`, `components/discover/DiscoverCategoryRail.tsx`.
- **Change:** `DiscoverMapLayers.tsx` (cluster layers, category icons via `addImage`), `DiscoverClient.tsx` (category state, `?cat=` param).
- Seed 5–10 countries in the first pass; the rest is data work that does not block code.
- **Risks:** dataset licensing and attribution (Wikidata CC0; Commons per-file images carry their own license, often CC-BY-SA, which requires author credit — not OSM/ODbL, since the seeder never queries Overpass; see §18 risk #3, resolved Phase 8). Icon registration must survive `style.load` re-fires.
- **Tests:** `tests/discover-categories.test.mts` (every category resolves; live categories carry `minZoom` and `placesCategory`), `tests/discover-query.test.mts` (country filter, category filter, bbox including dateline, rank slice, paging).

### Phase 3 — Draggable sheet and place cards ✅ shipped 2026-08-08

**Goal:** the three-state sheet, synchronized with markers, with Map Home migrated onto the shared component.

**What landed, and where it diverged from this section:**

- `components/mobile/DraggableSheet.tsx` + `DraggableSheet.module.css` landed as planned, with one addition: the pure `level`/`delta` → `SheetLevel` mapping lives in **`lib/mobile/draggable-sheet.ts`** (alias-free, no JSX), not inline in the component, so `tests/discover-sheet.test.mts` can load it under `node --experimental-strip-types` per the repo's pure-logic test convention. `DraggableSheet.tsx` re-exports both `SheetLevel` and `levelFromGesture` so `components/mobile/index.ts`'s export surface is unchanged.
- `DraggableSheetProps` matches §6.1 exactly (`level`, `onLevelChange`, `heightFor`, `historyIntegration`, `label`, `header`, `children`) plus one addition: `className`, so a consumer's existing visual shell class (`.routeSheet`, `.sheet`) still applies alongside the shared `.sheet`/`.handle`/`.header`/`.content` structure — both screens' shell CSS (border/background/blur/shadow) was already byte-for-byte identical, so nothing needed reconciling beyond dropping the now-dead `.routeSheet.collapsed/.half/.expanded` height rules and the old `.sheetHandle` block from `MapHome.module.css`.
- The Map Home migration (`app/dashboard/DashboardClient.tsx`) is behavior-identical for drag/tap/history, with one structural change: `.sheetActions` (Open trip / Edit route) moved from `position: absolute` pinned-at-bottom to a flowed flex footer inside a new `.expandedBody` wrapper (flex column: `.stopList` grows, `.sheetActions` stays put). The old `calc(100% - 180px)` on `.stopList` was calibrated against `.routeSheet`'s *total* height including the handle and heading, which no longer holds once those become `DraggableSheet`'s own header — a flex-based footer sidesteps re-deriving that pixel budget and also stays correct regardless of whether the "Edit route" button renders (capability-gated). `tests/map-home.test.mts` (pure `selectFeaturedTrip` logic) passed unchanged, as did the full suite (319/319).
- `DiscoverResultsList.tsx` and `DiscoverPlaceCard.tsx` landed as planned, splitting `Discover.module.css`'s old `.row`/`.thumb`/`.rowText` etc. into `DiscoverPlaceCard.module.css`. One addition beyond §11: the card is a `<span>` wrapping two buttons — `.rowMain` (select, toggles `selectedPlaceId`) and a `.detailButton` chevron that only renders once selected, opening `DiscoverPlaceSheet` (§4.4's "tap a selected card's chevron"). Card↔marker sync uses `data-place-id` + `scrollIntoView`, same as Phase 2; no loop risk materialized because `selectFromMap` (marker tap) and `selectPlace` (card tap) are the only two writers of `selectedPlaceId` and neither is triggered by the map's `moveend`.
- `DiscoverPlaceSheet.tsx` shipped as an informational modal only — photo, region, category pill, suggested hours, blurb, and **`imageAttribution`**, discharging the per-file Commons credit obligation (§18.3) that the list view cannot carry. It intentionally has **no Add to Route / Save to itinerary actions yet** — those are `AddToRouteButton`, explicitly Phase 4, and wiring them now would mean building against the unresolved §18.1 provider-geography question.
- The sheet-raise behavior (§4.2's "auto-raises collapsed → half on the first category tap") is simplified to "raises on every category tap while collapsed," not tracked per-session — a session-scoped exception would need extra state for a one-time UX nicety that composes fine either way.
- `tests/discover-sheet.test.mts` (the pure gesture mapping), `tests/accessibility-contracts.test.mts` extended for both the shared sheet handle contract and the relocated card markup. Full suite green (319/319); `tsc --noEmit` and `eslint` clean on every touched/new file.

- **Risks:** the Map Home migration is the riskiest edit in the plan — it touches a shipped screen with existing tests. Done as its own commit, diffed against current behavior. Card↔marker scroll sync can loop (card selects → map moves → `moveend` → reselect); did not materialize — see above.
- **Tests:** `tests/map-home.test.mts` passes unchanged; `tests/accessibility-contracts.test.mts` extended for the sheet handle (`aria-expanded`, 44 px) and card buttons; new `tests/discover-sheet.test.mts` for level transitions from drag deltas, backed by the extracted pure `lib/mobile/draggable-sheet.ts`.

### Phase 4 — Add to Route ✅ shipped 2026-08-08

**Goal:** curated places reach a trip's `stops`; Places results reach `itinerary_items`.

**What landed, and where it diverged from this section:**

- **Scoped to curated-only, as §9.2/§18.1 recommended.** Discover shows only curated categories until Phase 5 wires live Places layers in, so there are no Google-sourced results in Discover today for a "Save to itinerary" path to serve. `AddPlaceToTripSheet.tsx` was **not** given a Route/Itinerary toggle — that toggle only earns its keep once Phase 5 lands a Places result inside Discover; building it now against nothing would be speculative. The itinerary path (`insertPlace`/`AddPlaceToTripSheet`) is untouched.
- `lib/discover/add-to-route.ts` landed exactly as planned (alias-free, `node --experimental-strip-types`-loadable): `buildStopInsertPayload` (mirrors `PlanRouteDomain.handleAddStop`'s payload, plus an explicit `nights` from `category.defaultStopNights` that `handleAddStop` itself leaves to the DB default), `editableTrips`, `findRouteDuplicate` (thin wrapper over `findPlaceDuplicate` from `lib/google-places/pure.ts` — no new dedup algorithm), `addedPlaceIds`, and `buildCreateTripPayload` for the no-trip case.
- `components/discover/AddToRouteButton.tsx` + module CSS landed as planned, with its four states (added / saving / start-a-trip / add-to-route) exactly per §9.3. **One placement change from §11:** the button lives in `DiscoverPlaceSheet` (the detail modal) only, not in the compact 56 px `DiscoverPlaceCard` row — the card already carries the `✓ In your route` badge from Phase 3, and a second interactive control in that row would fight the existing `rowMain`/`detailButton` layout for space. §4.4 already names the detail sheet as the primary Add-to-Route surface, so this isn't a scope cut, just picking the one surface the plan actually specifies.
- **Multiple-editable-trips picker is a small dedicated sheet inside `AddToRouteButton`** (`MobileBottomSheet` + a plain trip-name list), not a reuse of `AddPlaceToTripSheet` — the latter is itinerary-shaped (date/time fields, duplicate banner wired to `itinerary_items`) and curated Add-to-Route needs none of that, just "which trip." Reusing it would have meant threading a itinerary-only component through a route-only call path.
- `app/explore/page.tsx` now fetches `trip_members` (`trip_id, role`) alongside `trips`, derives `editableTrips` (owner/editor only, per `tripCapabilitiesForRole`'s rule), picks the **active trip** via `selectFeaturedTrip` over the editable subset (same helper Map Home uses), and fetches that trip's `stops` (`id, name, lat, lng`) for the "already added" set. No `itinerary_items` fetch — irrelevant until Places results exist in Discover.
- `DiscoverClient.tsx`: `addedIds` is a `useMemo` over `addedPlaceIds(places, activeTripStops)`, never stored (§10.2). `addToTrip` inserts via `createClient().from('stops').insert(...)`, reconciling local `activeTripStops` state on success and offering the `handleAddStop`-style `{ label: 'Retry', onClick }` toast on failure; for a non-active trip picked from the multi-trip sheet it does a `head: true, count: 'exact'` lookup to get the right `order_index` first. `startTripWithPlace` calls `create_trip_with_stops` exactly like `ExploreClient.handleUseRoute`, then `router.push('/trip/{id}/mobile?section=plan')` per §9.3 (the legacy `handleUseRoute` omits `?section=plan`; Discover's flow includes it as the plan specifies).
- **`findPlaceDuplicate` is checked against stops only** (curated places never touch `itinerary_items`), so the "duplicate detection against both stops and items" test case from §16's original test list doesn't apply to this scope — `tests/discover-add-to-route.test.mts` covers the stops-only path instead.
- `tests/discover-add-to-route.test.mts` (12 cases: first vs Nth stop payload, `nights` per category, `order_index`/`stop_type`, `editableTrips` viewer filtering, duplicate match/no-match by name+distance, `addedPlaceIds`, create-trip payload's explicit `nights: 0` for day-stops vs the omitted-`nights` city case). Full suite green (331/331); `tsc --noEmit` and `eslint` clean on every touched/new file.

- **Create:** `lib/discover/add-to-route.ts`, `components/discover/AddToRouteButton.tsx`, `components/discover/AddToRouteButton.module.css`, `tests/discover-add-to-route.test.mts`.
- **Change:** `components/discover/DiscoverPlaceSheet.tsx` (renders `AddToRouteButton`), `DiscoverClient.tsx` (insert, rollback, toast, "already added" derivation), `app/explore/page.tsx` (fetch `trip_members`, editable trips, active trip's stops).
- **Reuse verbatim:** `findPlaceDuplicate`, `create_trip_with_stops`, `tripCapabilitiesForRole`'s viewer rule, the `showToast` retry contract, `selectFeaturedTrip`.
- **Risks:** the §9.2 provider-geography constraint — resolved by scoping to curated-only, as recommended. `nights` semantics verified by test: a wrong default silently lengthens the trip (`20260808120000`).
- **Tests:** `tests/discover-add-to-route.test.mts` — see above.

### Phase 5 — Live layers, performance, mobile polish ✅ shipped 2026-08-08

**Goal:** `food` / `museums` / `stays` render real Google Places results on `DiscoverMap`, gated to a sensible zoom and fetched only on explicit intent; the desktop rail from §13 lands; the second map SDK is gone.

**What landed, and where it diverged from this section:**

- `lib/discover/discover-live.ts` (new, alias-free, `node --experimental-strip-types`-loadable) bridges a `GooglePlaceSearchResult` into the exact `DiscoverPlace` shape `DiscoverMap`/`DiscoverResultsList`/`DiscoverPlaceCard` already render, so no live-specific branch was needed in any of those three components. `mapGooglePlaceToDiscoverPlace` clamps `rank` from the rating signal (`rating * 20`, 0–100); `mergeLiveResultBatches` dedupes the parallel per-type calls a multi-type category fires (`food` → `restaurants` + `cafes`) by `placeId`, keeping the first occurrence; `liveQueryKey` rounds coordinates to 3 decimals (~110 m) for the session cache, mirroring `GooglePlacesExplorer`'s `queryKey` convention. `liveDiscoverId`/`isLiveDiscoverId`/`rawPlaceId` give a live result a `google:`-prefixed id so `DiscoverClient.openDetail` can route it without a second id table. `tests/discover-live.test.mts` covers all of it.
- **`DiscoverCategoryRail` gained an optional `zoom` prop, not a second rail.** A live chip is `disabled`/`aria-disabled` below its `minZoom` (`LIVE_LAYER_MIN_ZOOM = 10`) with a `title` hint — visible but unselectable, never hidden, so a `?cat=food` deep link at country zoom still shows *which* chip the user asked for (§15 case 17). `DiscoverClient` now passes `[...curatedCategories(), ...liveCategories()]` as the rail's `categories`.
- **`DiscoverMap` reports viewport settle, not viewport state.** A new `onViewportSettle?: (viewport) => void` prop fires 400 ms after `onMoveEnd` (and once more, immediately, from `onLoad`, so a live `?cat=` deep link doesn't wait for the user to pan first) — the viewport itself is still never React state inside `DiscoverMap` (§10.2/§14 held); only `DiscoverClient` turns the callback into one `mapViewport` value.
- **Fetching is manual, always** — §4.3's "never an automatic refetch" was taken literally: switching to a live category, or panning while one is active, never fires a request by itself. A "Search this area" / "Search again" button (with a `RefreshCw` icon) is the only trigger, backed by the `AbortController` + sequence-number pattern from `GooglePlacesExplorer` and a `Map<queryKey, results>` session cache (`liveCache`, in a `useRef`, never persisted per §8.5) — the same primitives, not reinvented. A cache hit resolves with zero network calls.
- **§15 case 17, resolved concretely:** while a live category is selected but the map hasn't zoomed past `LIVE_LAYER_MIN_ZOOM`, `DiscoverClient` renders the country's `must_visit` set instead (`fallbackPlaces`) with an explicit "Zoom in to search {category} — showing Must Visit for now" result-count line. Never a blank map, never a silent empty list.
- **§18.1 revisited and resolved for Phase 5, as flagged in §1's progress note:** now that live results actually appear in Discover, the "Save to itinerary" secondary action (§4.4) is wired for them via the existing `AddPlaceToTripSheet`, reused as-is (no new Route/Itinerary toggle component — a live place is never eligible for "Add to Route" at all, so there is nothing to toggle between; the curated detail sheet, `DiscoverPlaceSheet`, keeps its `AddToRouteButton` untouched and is never shown for a live id). The live flow is deliberately narrower than the trip-tab original: always `defaultUnscheduled` (no day/time picker — Discover has no day context to offer), `lockedTripId` is the active trip when one exists, and the duplicate check runs against `activeTripStops` only (name + distance, no `itinerary_items` fetch) since Discover doesn't otherwise load a trip's itinerary. Documented simplification, not an oversight: revisit if a false-negative duplicate on a live save turns out to matter in practice.
- **Desktop rail (§13) is one `isWide` boolean** (`matchMedia('(min-width: 1024px)')`), not a second component. `DraggableSheet` gained a `variant?: 'sheet' | 'rail'` prop (default `'sheet'`, so Map Home is byte-identical): in `'rail'` mode it skips the drag handle entirely and applies a `.rail` class living in `DraggableSheet.module.css` itself (co-located, so its cascade order over the base `.sheet` rule is guaranteed — a cross-module override would not have been). `DiscoverClient` passes `level="expanded"` and `historyIntegration={false}` alongside `variant="rail"` when `isWide`, and swaps `fitPadding` to `{ top: 96, right: 40, bottom: 40, left: 432 }` (left-weighted, matching the 400 px rail).
- **Hover preview** is `hoveredPlaceId` state in `DiscoverClient`, set only when `isWide` (mobile never fires `onMouseEnter`), flowing through `DiscoverResultsList` → `DiscoverPlaceCard` → `DiscoverMap` → `DiscoverMapLayers`, where the `discover-pin` layer's `circle-radius` paint became a `case` expression: hovered wins a flat 13 px, otherwise the original zoom-interpolated radius, exactly as §13 specified.
- **`content-visibility: auto` was already in place** from Phase 3's `DiscoverResultsList.module.css` (`.list { content-visibility: auto; contain-intrinsic-size: auto 60px }`) — nothing to add here.
- **`GoogleExploreMap.tsx` is deleted.** `GooglePlacesExplorer.tsx` lost its `viewMode` state, the list/map toggle buttons, and the `results`/`queryKey` values that only that toggle used — the trip-scoped Explore tab now always renders `ExploreResultsList`. A regression test (`tests/google-places.test.mts`) asserts the file is gone and that `GooglePlacesExplorer.tsx` no longer references it.
- `tests/discover-live.test.mts` (7 cases: id round-trip, DiscoverPlace mapping shape, rank clamping, per-type dedupe, query-key rounding/collision). `tests/google-places.test.mts` extended with the `validateSearchParams` shape Discover's live fetch relies on and the `GoogleExploreMap` removal guard. Full suite green (338/338); `tsc --noEmit` and `eslint` clean on every touched/new file.

- **Create:** `lib/discover/discover-live.ts`, `tests/discover-live.test.mts`.
- **Change:** `app/explore/DiscoverClient.tsx` (live fetch/cache/gate, desktop rail, hover), `app/explore/Discover.module.css` (rail + search-this-area styles), `components/discover/DiscoverMap.tsx` (`onViewportSettle`, `hoveredPlaceId`), `components/discover/DiscoverMapLayers.tsx` (hover `case` expression), `components/discover/DiscoverCategoryRail.tsx` (+`.module.css`, zoom gate), `components/discover/DiscoverResultsList.tsx`/`DiscoverPlaceCard.tsx` (hover pass-through), `components/mobile/DraggableSheet.tsx` (+`.module.css`, `variant="rail"`), `components/explore/GooglePlacesExplorer.tsx` (drop `viewMode`/map toggle), `tests/google-places.test.mts`.
- **Deleted:** `components/explore/GoogleExploreMap.tsx`.
- **Reused verbatim:** `/api/places/search` (no endpoint change), the `AbortController` + sequence-number pattern from `GooglePlacesExplorer`, `AddPlaceToTripSheet`, `findPlaceDuplicate`, `MAPBOX_TOKEN`/`applyAppTheme` conventions.
- **Risks:** rate-limit behavior under rapid category switching — mitigated the same way `GooglePlacesExplorer` does (abort + sequence check), plus fetching is manual so a fast tab-through never fires more than one in-flight request at a time. The desktop rail CSS-cascade risk (a consumer module's class losing to the component's own module) was avoided by keeping the rail's position/size rule inside `DraggableSheet.module.css`.
- **Tests:** `tests/discover-live.test.mts`, `tests/google-places.test.mts` (extended) — see above.

### Phase 6 — States, animation, cleanup ✅ shipped 2026-08-08

**Goal:** close out the remaining §15 edge cases, cut `GooglePlacesExplorer` over to unambiguously trip-scoped, relocate the passport stat block, delete the retired globe surface, and bring the docs in line.

**What landed, and where it diverged from this section:**

- **§15 audit, cases 9–14.** Cases 9 (identical-coordinate cluster), 10 (dateline bbox), 11 (large-country pin density), 12 (double-tap add guard), and 14 (keyboard-safe search sheet) were already fully covered by Phases 2–5's implementation — clustering, `discover-query.ts`'s dateline-safe bbox math, `rankedSlice`, `savingPlaceId`/`AddToRouteButton`'s `saving` guard, and `CountryPickerSheet`'s `MobileBottomSheet` (`visualViewport` insets) respectively — verified by reading the current code, not re-derived. **Case 13 was genuinely missing**: `DiscoverClient.tsx` initialized `activeTripStops` from the server props and only ever updated it locally on a successful insert, with no path to pick up a stop added from an open Plan tab or another device. Added a `visibilitychange` effect that refetches `stops` for `activeTripId` when the tab is foregrounded — the insert-time duplicate check (`findPlaceDuplicate`) still catches the race regardless, exactly as §15 case 13 specifies.
- **`GooglePlacesExplorer` `mode` prop removed entirely**, per §1.3/§11's retirement note. `activeTrip` went from optional to required (the component's only caller, `ExploreDomain.tsx`, always passes one). The dead multi-trip-fetch machinery that only ever ran under `mode === 'global'` — `tripData`, `tripDataLoading`, `tripSequence`, `tripDataRef`, `loadTripData`'s Supabase fetch — is deleted along with it; `AddPlaceToTripSheet`'s `onTripChange`/`tripDataLoading` props stay (the sheet's own effect still calls `onTripChange` on `place` change) but are now a no-op and a constant `false`, since there's only ever one trip in scope. `ExploreDomain.tsx` dropped its `mode="trip"` call site.
- **Passport stat block moved to `/profile`.** The block lived inline in `ExploreClient.tsx` (Countries/Trips/Nights), not in a separable component as §11's retirement table assumed — so nothing needed extracting, only porting. `/profile` already had its own simpler stat block (`ProfileClient.tsx`'s `getCountryCount`), which only parsed the legacy `description` regex and never read `trips.countries`. Upgraded `getCountryCount` to check `trips.countries` first (matching `ExploreClient`'s retired `collectVisitedPlaces` precedence, minus the lat/lng it no longer needs for a plain count) and fall back to the regex only for trips predating that column; `app/profile/page.tsx`'s trips query now selects `countries` alongside the existing fields.
- **Retired files deleted** exactly per §11/§17: `app/explore/ExploreClient.tsx`, `components/explore/{ExploreMapbox,CountryCard,EmptyCountries,StarField,explore-ui,DiscoverCard,explore-routes-data}.{tsx,ts}`, plus `explore-logic.ts`'s `CATEGORY_CHIPS` (its other exports — `findDuplicate`, `distanceMeters`, `normalizeTitle`, `CategoryChip`, `DURATION_STEPS_MIN` — stay, since the dead-but-untouched `app/trip/[id]/mobile/explore/*.tsx` files and `tests/explore-logic.test.mts` still reference them; those files were out of this phase's stated scope and were left alone).
- **§11/§17 flag, resolved:** the `ROUTES` → Tier C migration this doc's own Phase 2 write-up implied ("`hidden_gems` and `routes` are deliberately absent... `routes` lands with Tier C") had never actually happened — `lib/discover/discover-routes.generated.ts` didn't exist before this phase. Rather than delete `explore-routes-data.ts` and lose the six road-trip templates, `DISCOVER_ROUTES` was ported verbatim into that path with one addition (`countryCode`, resolved by hand for the six countries involved). The `routes` category chip itself is **still not wired** into `DISCOVER_CATEGORIES` or any map layer — that needs a `line`-layer renderer and route cards that don't exist yet, so it stays a documented follow-up rather than being built as a side effect of a cleanup pass.
- `docs/app-flow-overview.md`, `docs/current-mobile-baseline.md`, `docs/mobile-regression-checklist.md` updated: the `/explore` entries now describe `DiscoverClient.tsx` and `lib/discover/`, note the old globe surface is gone, and the regression checklist gained a "Phase 6 — states, cleanup regressions" section covering the six items above.
- No test referenced any of the deleted files or `CATEGORY_CHIPS`. Full suite green (338/338); `tsc --noEmit` and `eslint` clean.

- **Risks:** deleting `mode` from `GooglePlacesExplorer` touches the live trip Explore tab — verified against `tests/explore-logic.test.mts` (unaffected, since it doesn't import `GooglePlacesExplorer`) plus a manual read of the trip-tab call path; a live manual pass in a running dev instance is still recommended before shipping to production.
- **Tests:** existing suite only — no new test files were needed for this phase's changes (state/behavior additions were covered by manual code-path verification against already-tested pure modules: `discover-query.ts`, `add-to-route.ts`).

### Phase 7 — Road trip routes layer ✅ shipped 2026-08-08

**Goal:** the `routes` chip Phase 6 deliberately left unwired renders on the map as a line layer, has its own cards and detail sheet, and a "Use This Route" CTA that clones (or appends) `DISCOVER_ROUTES` into a trip.

**What landed, and where it diverged from this section:**

- `lib/discover/categories.ts` gained a `routes` entry in `DISCOVER_CATEGORIES` (`source: 'curated'`, `markerColor: '#8b96ad'` — a slate-gray distinct from every warm/saturated place color already in use, reading as "road" rather than competing with a place category). The "Deferred" footer comment was rewritten: only `hidden_gems` remains deferred; `routes` now documents where its three new sibling components and its map layer live. **`defaultStopNights` is set to `1` but goes unread for this category** — a route is not itself a place that becomes one stop; its `waypoints` become several, each explicitly `nights: 1` via `lib/discover/add-to-route.ts`'s new route-specific payload builders (documented in the field's own doc comment, not silently left ambiguous).
- `lib/discover/discover-routes.generated.ts`'s `DiscoverRoute` interface gained an `id: string` field (hand-assigned stable slugs, e.g. `it-amalfi-coast`, `us-route-66` — the file is manually curated despite its `.generated` name, matching how `countryCode` was added by hand in Phase 6) needed for map feature properties, list `key`s, and selection.
- `lib/discover/discover-query.ts` gained `filterDiscoverRoutes()` (country-only, alphabetised — routes have no `rank` to sort by) and `routesToLineFeatureCollection()` (one `LineString` feature per route, mirroring `placesToFeatureCollection`'s numeric-id-plus-slug-in-properties shape). `boundsForPlaces`/`shouldRefitCamera` were **widened, not duplicated** — their parameter type changed from `DiscoverPlace[]` to a new structural `LatLng` interface, which a route's waypoints satisfy exactly like a `DiscoverPlace` does, so route-bounds camera fitting reuses the existing dateline-safe math instead of a second copy of it.
- `components/discover/DiscoverMapLayers.tsx` gained a second, unclustered GeoJSON source (`discover-routes`) with one `line` layer (`discover-route-line`): `line-width`/`line-opacity` are `case` expressions keyed on `selectedPlaceId` (reused, not a second selection id — see below), so the selected route reads as the foreground line while the others dim rather than disappear. **A waypoint-dot circle layer was planned but dropped**: circle layers require Point geometry and the route source is LineString-only, so rendering per-waypoint dots would have needed a second GeoJSON source just for that — the line alone satisfies §5.2/point 2 of this phase without the extra source.
- `components/discover/DiscoverMap.tsx`: a new optional `routes` prop (default `[]`), an `isRouteCategory` derivation, and three effects mirroring the places ones — category-results fit (over all filtered routes' waypoints), selection fit (over just the selected route's waypoints, via `fitBounds` rather than the single-point `easeTo` places use, since a route selection previews a polyline, not one pin), and `interactiveLayerIds` swapping to `DISCOVER_ROUTE_INTERACTIVE_LAYERS` so the map never hit-tests a layer that isn't mounted for the current category. `handleClick`'s existing generic fallback (`feature.properties?.id`) needed no change — it already resolves a route-line click exactly like a place-pin click.
- **`selectedPlaceId` is reused as the route selection id, not duplicated into a `selectedRouteId`.** `chooseCategory` already clears it on every category switch, so a place id and a route id are never live at the same time — one piece of state serves both, matching §10.2's "no context provider, minimal state" posture.
- `components/discover/DiscoverRouteCard.tsx` + `.module.css`, `DiscoverRouteResultsList.tsx` (reuses `DiscoverResultsList.module.css`'s `<ul>` shell — it's category-agnostic), and `DiscoverRouteSheet.tsx` + `.module.css` landed as **a parallel sibling set, not a union type threaded through `DiscoverPlaceCard`/`DiscoverResultsList`/`DiscoverPlaceSheet`** — the least-invasive path per §11's component tree: a route has no image/region/rank/`AddToRouteButton`-style four-state add, and forcing both shapes through one set of components would mean a prop union where half the props are always undefined for one side or the other (the same reasoning §5.1 already used for `DiscoverMap` vs `TripboxMap`).
- **§18 open question #12, resolved:** `DiscoverRouteSheet` carries two actions — primary **"Use This Route"** (always available, clones into a brand-new trip) and secondary **"Add to {trip title}"** (shown only when an editable active trip exists, appends every waypoint as sequential stops). Appending mirrors exactly what single-place "Add to Route" already does (§9.1 "Discover appends; Plan arranges") — a whole route is not a special case, just several appends in one insert — so both halves of the open question shipped rather than picking one.
- `lib/discover/add-to-route.ts` gained `buildCreateTripPayloadFromRoute()` (ported **verbatim** from the retired `ExploreClient.handleUseRoute`'s `create_trip_with_stops` call — no `nights` key on any stop, relying on the RPC's own default of one night per omitted stop, `20260808120000_stop_overnight_semantics.sql`, rather than restating that contract; `p_countries[0].flag: route.emoji` is the same odd-but-deliberate legacy substitution, kept rather than "fixed" since a route template genuinely has no country flag of its own) and `buildRouteStopsPayload()` for the append path (a **direct** `stops` insert, not the RPC — so `nights: 1` must be explicit per waypoint, since the `stops` table's own column default is `0`, not the RPC's `1`; getting this wrong would silently turn every appended waypoint into a day stop instead of matching what "Use This Route" would have created).
- `DiscoverClient.tsx`: `routesForCountry` (`filterDiscoverRoutes` over `DISCOVER_ROUTES`), `isRouteCategory`, `detailRouteId`/`detailRoute`, and `routeActionRouteId`/`routeActionKind: 'clone' | 'append' | null` (a route's own in-flight state — distinct from `savingPlaceId`, since a route's "in flight" spans two different actions rather than one insert). `startTripFromRoute` mirrors `startTripWithPlace`'s guard-and-redirect shape exactly; `appendRouteToTrip` mirrors `addToTrip`'s `attempt`-plus-retry-toast shape exactly. The category-count tally (`counts`, feeding the rail's per-chip numbers) needed one addition: routes never appear in the place-tally loop (no `DiscoverPlace` is ever tagged `'routes'`), so `tally.routes` is set separately from `filterDiscoverRoutes(...).length`. `openDetail`/`closeDetail` branch on `isRouteCategory` to route to `DiscoverRouteSheet` instead of `DiscoverPlaceSheet`/`AddPlaceToTripSheet`; `<MapComponent>` now always receives `routes={routesForCountry}` (harmless outside the `routes` category — `DiscoverMap` only builds the line collection when `isRouteCategory` is true).
- `tests/discover-query.test.mts` extended with `filterDiscoverRoutes` (country scope, case-insensitivity, alphabetical order), `routesToLineFeatureCollection` (coordinate order, empty input), and a case proving `boundsForPlaces`/`shouldRefitCamera` work over raw waypoints, not just `DiscoverPlace`. `tests/discover-add-to-route.test.mts` extended with `buildCreateTripPayloadFromRoute` (no `nights` key, `flag: route.emoji`, origin/destination assignment) and `buildRouteStopsPayload` (explicit `nights: 1`, origin-only-when-trip-empty). `tests/discover-categories.test.mts`'s two tests that asserted `'routes'` was still an unknown/never-overnight category were updated to match the new entry (a pre-existing-test fallout, not new coverage). Full suite green (347/347); `tsc --noEmit` and `eslint` clean on every touched/new file.

- **Create:** `components/discover/DiscoverRouteCard.tsx` + `.module.css`, `DiscoverRouteResultsList.tsx`, `DiscoverRouteSheet.tsx` + `.module.css`.
- **Change:** `lib/discover/categories.ts` (`routes` entry), `discover-query.ts` (`filterDiscoverRoutes`, `routesToLineFeatureCollection`, widened `LatLng` bounds helpers), `discover-routes.generated.ts` (`id` field), `add-to-route.ts` (`buildCreateTripPayloadFromRoute`, `buildRouteStopsPayload`), `components/discover/DiscoverMapLayers.tsx` (route line layer), `DiscoverMap.tsx` (`routes` prop, route camera effects, `interactiveLayerIds` swap), `app/explore/DiscoverClient.tsx` (route state, handlers, rendering), `tests/discover-query.test.mts`, `tests/discover-add-to-route.test.mts`, `tests/discover-categories.test.mts`.
- **Reused verbatim:** `create_trip_with_stops` (via `buildCreateTripPayloadFromRoute`, byte-for-byte the retired `handleUseRoute` payload shape), `findPlaceDuplicate`'s absence — routes are deliberately **not** duplicate-checked against existing stops (a 4–6-waypoint bulk append has no single-item "already added" concept the way one place does; §9.3 doesn't extend to this), `MobileBottomSheet`, the `showToast` retry contract, `boundsForPlaces`/`shouldRefitCamera` (widened, not reimplemented).
- **Risks:** reusing `selectedPlaceId` across two id spaces (place ids and route ids) relies on category switches always clearing it first — verified by reading `chooseCategory`, which already did this before Phase 7 for the live-vs-curated switch. The dropped waypoint-dot layer is a minor visual gap (only the line itself previews a route, not its individual stops) — flagged here rather than silently scoped out.
- **Tests:** `tests/discover-query.test.mts`, `tests/discover-add-to-route.test.mts` (both extended), `tests/discover-categories.test.mts` (two pre-existing tests updated for the new category) — see above.

### Phase 8 — OSM/Wikidata/Commons attribution audit ✅ shipped 2026-08-09

**Goal:** close §18 risk #3 — verify the curated dataset's actual data sources and make sure every legally required credit is visible somewhere in the Discover UI, replacing the guess (`ExploreAttribution.tsx`) this plan originally floated as "may be the right home."

**What landed, and where it diverged from this section:**

- **`ExploreAttribution.tsx` was the wrong component, confirmed by reading it.** It renders a static `"Google Maps"` label and is used only by `ExploreResultsList.tsx`/`GooglePlaceDetailSheet.tsx` in the trip-scoped Explore tab (`app/trip/[id]/mobile`) — nothing to do with Discover's Wikidata/Commons data. No component was renamed or repurposed; Discover keeps its own attribution surface in `DiscoverClient.tsx`.
- **OSM/Overpass audit: not used.** Read `scripts/generate-discover-places.mjs` end to end — it queries Wikidata SPARQL only (`ENDPOINT = 'https://query.wikidata.org/sparql'`); there is no Overpass call anywhere in the repo. §8's "and/or OpenStreetMap via Overpass" phrasing never became real. **Conclusion: no ODbL attribution is owed.** Only two obligations remain: Wikidata's CC0 (no attribution legally required, credited by courtesy) and each image's individual Wikimedia Commons license.
- **`imageAttribution` carried a source label, not a real attribution.** `commonsImage()` built `"Wikimedia Commons · <filename>"` from the `P18` image URL alone — no license, no author. Most Commons files are CC-BY-SA, which requires author credit; a filename satisfies no license's terms. Fixed by adding `fetchCommonsAttribution()` to the seeder: after the country data is collected (cache-hit or fresh), it batches every place's image filename through the Commons API (`action=query&prop=imageinfo&iiprop=extmetadata`, 50 titles/request, the API's non-bot ceiling) to pull `LicenseShortName` and `Artist`, formats `imageAttribution` as `"{artist} · Wikimedia Commons · {license}"` (degrading gracefully — `"Wikimedia Commons"` alone, or `"Wikimedia Commons · {license}"` with no artist, or `"{artist} · Wikimedia Commons"` with no license — when Commons has no metadata for a field), and caches the result by filename in `scripts/.discover-cache/commons-attribution.json` (gitignored, same convention as the per-country SPARQL cache) so a re-run only fetches files new to the dataset. This runs on **every** invocation, including a fully cache-hit one, since it's keyed by filename rather than by country — the existing `TR IT ES FR GR JP PT NO US` seed was re-run against the live Commons API (no SPARQL re-fetch; all nine countries hit their existing cache) to backfill real attribution across all 1,352 committed places (1,319 with images, 1,308 distinct Commons filenames among them).
- **The persistent credit line in `DiscoverClient.tsx`'s sheet footer** (`.credit`, present since Phase 2) said `"Places from Wikidata · photos from Wikimedia Commons"` — accurate as far as it went, but didn't name CC0/per-image licensing and, with the OSM question now closed, needed no ODbL mention added. Changed to `"Places: Wikidata (CC0) · Photos: Wikimedia Commons, per-image license"` with a `title` tooltip carrying the full sentence (author/license is on each place's detail sheet) — the visible line is short because `.creditText` is a single `nowrap`/ellipsis line by design (§16 Phase 2's CSS). **Suppressed for the `routes` category**: `DISCOVER_ROUTES` (`discover-routes.generated.ts`) is hand-curated with no external data source (confirmed reading the file — no OSM/Wikidata/Commons reference anywhere in it, ported from the legacy `explore-routes-data.ts` in Phase 6), so showing a Wikidata/Commons credit while browsing routes would be actively wrong, not just superfluous.
- **`DiscoverPlaceSheet.tsx`'s per-file credit line needed no code change** — it already renders `place.imageAttribution` verbatim (§16 Phase 3); it now shows the enriched string automatically once the dataset regenerated.
- `tests/discover-places.test.mts` (new): every place with a non-null `imageUrl` has a non-empty `imageAttribution`; every non-null `imageAttribution` mentions `"Wikimedia Commons"` and is never a bare filename (regex-rejects a trailing image extension); every place without an image has `imageAttribution === null`. Pure-logic, no network — asserts against the committed generated file, same convention as `tests/discover-categories.test.mts`. Full suite green (350/350, including the 3 new cases); `tsc --noEmit` and `eslint` clean on every touched/new file.

- **Change:** `scripts/generate-discover-places.mjs` (`filenameFromImageUrl`, `fetchCommonsAttribution`, `formatCommonsAttribution`, enrichment pass before output), `lib/discover/discover-places.generated.ts` (regenerated — same places, upgraded `imageAttribution`), `app/explore/DiscoverClient.tsx` (credit line text + `routes` suppression).
- **Create:** `tests/discover-places.test.mts`, `scripts/.discover-cache/commons-attribution.json` (gitignored, not committed).
- **Reused verbatim:** `DiscoverPlaceSheet.tsx`'s existing `place.imageAttribution` render, the seeder's existing per-country cache/retry/rate-limit conventions (mirrored for the new Commons cache), `discover-routes.generated.ts`'s existing hand-curated-with-no-license status (verified, not changed).
- **Risks:** the Commons API's `extmetadata` is community-entered and occasionally missing `Artist`/`LicenseShortName` even for CC-BY-SA files — the seeder degrades to a shorter but still-accurate string rather than failing the build; a small number of places may show `"Wikimedia Commons"` with no author until Commons' own data improves. This is inherent to the Commons metadata's own completeness, not something the seeder can fix.
- **Tests:** `tests/discover-places.test.mts` — see above.

### Phase 9 — Design-system rewrite ✅ shipped 2026-08-09

**Goal:** close §18 risk #7 — move Discover's CSS Modules fully onto the Liquid Glass token layer (`docs/liquid-glass-design-system.md`), replacing the mix of `var(--color-*)`/`var(--glass-*)` and hardcoded hex/rgba that had accumulated across Phases 1–7.

**What was found, and what changed:**

- **Audit confirmed the doc's premise.** `DUSK`/`SUNSET_GRADIENT` (the old inline-styled `/explore`) were already gone — deleted with `ExploreClient.tsx` in Phase 6 — but none of Discover's 10 CSS Modules had fully migrated to the token layer either: `app/explore/Discover.module.css` and all 9 files under `components/discover/` (`AddToRouteButton`, `CountryPicker`, `DiscoverCategoryRail`, `DiscoverPlaceCard`, `DiscoverPlaceSheet`, `DiscoverResultsList`, `DiscoverRouteCard`, `DiscoverRouteSheet`, `DiscoverTopBar`) mixed `var(--color-*)`/`var(--radius-*)` calls with hardcoded `rgba(255, 255, 255, 0.13)`-style fills/borders, several `#08081e`/`#111334`-class hex literals, and duplicated gradients/shadows. `DiscoverResultsList.module.css` was the one file already clean (it only ever held layout rules).
- **Every repeated value became a token; one-off values were normalized to the nearest existing token or left as a documented exception.** Where a value repeated 2+ times across files with no home in the existing table, a new token was added to `app/globals.css` (grouped under a `Phase 9` comment, immediately after the existing scrim tokens) rather than duplicating a local constant per file — the same reuse-over-duplication call the rest of the token layer already makes:
  - `--scrim-map-top` / `--scrim-map-bottom` — Discover's full-bleed map scrims are shaped for a viewport-height canvas, not a card header/footer, so they're siblings of `--scrim-top`/`--scrim-bottom` rather than reuses of them; same base color.
  - `--color-accent-wash`, `--color-accent-border-hover`, `--color-accent-border-selected` — the repeated "chip/card/row is selected or hovered" accent tint, consolidated from several near-identical alpha values (`.4`/`.42`/`.45` border, `.1`/`.12` fill) that had drifted apart independently in `CountryPicker`, `DiscoverPlaceCard`, `DiscoverRouteCard`, `DiscoverCategoryRail`, `DiscoverTopBar`, `Discover.module.css`, and `DiscoverRouteSheet` — a genuine, if small, visual normalization, not just a rename.
  - `--color-success-wash` / `--color-success-wash-text` — the "✓ In your route" / "✓ Added" badge treatment, identical in `AddToRouteButton.module.css` and `DiscoverPlaceCard.module.css`.
  - `--shadow-accent-cta` — the primary-CTA drop shadow, paired with the existing `--gradient-accent-cta` token (see below).
  - `--gradient-image-placeholder` — the photo/thumb "no image yet" gradient, byte-identical across `DiscoverPlaceCard`, `DiscoverPlaceSheet`, and `DiscoverRouteCard`.
  - `--overlay-hover-fill` / `--overlay-border-hover` — the neutral (non-accent) hover wash used on transparent icon/row buttons already nested inside a blurred sheet; deliberately not a fourth glass tier, since stacking another `backdrop-filter` on a child of an already-blurred surface is wasted paint for a 1–2 px visual difference.
  - `--gradient-map-fallback` — the map-failed empty-state art. Its two radial highlights were already tuned to echo `--color-info` (blue) and `--color-ai` (violet); made that relationship explicit with `color-mix(in srgb, var(--color-info) 34%, transparent)` instead of re-deriving a third pair of literal `rgba()` values that would drift from the source tokens over time.
- **Where an existing token was the closest match, values were normalized onto it instead of adding a new one** — the more common case: `.chip`/`.tripOption`/`.suggestion`/`.creditAction`/`.secondaryButton` fills and borders (`rgba(255,255,255,.055)`/`rgba(255,255,255,.13)`) mapped exactly onto `--glass-standard-fill`/`--glass-standard-border`; the persistent results sheet (`.sheet`/`.sheetRail` in `Discover.module.css`) and the top-bar pills (`DiscoverTopBar.module.css`) moved their border/blur onto `--glass-elevated-border`/`--glass-elevated-blur`, since the design doc's glass-tier table names sheets and headers as elevated-tier surfaces explicitly; the `#f5a623 → #ff8a1f` button gradient used on every primary CTA (`AddToRouteButton`, `Discover.module.css`'s search-this-area/credit-action-primary, `DiscoverRouteSheet`'s primary button) was replaced with the existing `--gradient-accent-cta` token — the design doc already names that token for exactly this "FAB / primary CTA" role, so this is a real consolidation, not a lookalike swap, and produces a small, intentional visual change (a warmer 3-stop gradient instead of a flat 2-stop one). `.thumb`/`.thumbFallback`/`.emoji` border-radius (`9px`) normalized to `--radius-8` (1px difference, imperceptible); `DiscoverTopBar`'s pill radius (`18px`) normalized to `--radius-16` (2px difference).
- **Two values were kept literal, with the reason written into the CSS as a comment rather than silently left as-is:** `DiscoverCategoryRail.module.css`'s `.count` badge background (`rgba(0, 0, 0, 0.28)`) needs a neutral dark scrim that reads against both the default translucent-white chip and the brighter active chip — no white-based glass fill token fits, and `--glass-elevated-fill` is a near-opaque navy tuned for full-screen sheets, wrong at chip scale. `DiscoverTopBar.module.css`'s `.countryPill`/`.searchButton` fill (`rgba(9, 9, 28, 0.76)`) and both floating shells' `box-shadow` (`Discover.module.css` `.sheet`/`.sheetRail`, `DiscoverTopBar` pills) stay bespoke: `--glass-elevated-shadow`'s negative-y offset assumes a bottom-pinned element with nothing below it, but these surfaces float with a gap on every side, so they need an ordinary shadow instead. `.dot`'s `border-radius: 50%` was left alone — it's a geometric constant for a perfect circle, not a design-token candidate.
- **Expected exceptions, confirmed by reading the code, not migrated:** `components/discover/DiscoverMapLayers.tsx` (Mapbox `paint` expressions — `ACCENT`, per-feature `markerColor`, `'#ffc766'`, `'#ffffff'`, `'#0b0b22'`) and `lib/discover/categories.ts`'s `markerColor` field on every `DiscoverCategory`. Both are evaluated off the DOM by the Mapbox GL worker and cannot read a CSS custom property — `DiscoverMapLayers.tsx` already carried a one-line comment saying so before this phase. Same rationale as the existing `ACCENT*`/`GLASS_*` exception in `components/mobile/domain-ui.tsx` (see [[Liquid Glass Token Layer]] in project memory).
- **Verification:** `npx tsc --noEmit` clean; `npx eslint app/explore components/discover` clean; full suite green (350/350) — `tests/accessibility-contracts.test.mts`'s Discover assertions check markup/ARIA/min-height contracts, not literal color strings, so they were unaffected by the token swap and needed no changes. Manually verified in a running dev server (`/explore`, desktop rail layout): category switching, the accent-selected row state, the success-wash "✓ In your route" badge, the image-placeholder gradient on unloaded photos, and the elevated-glass detail sheet with its CTA-gradient button all render unchanged from before the migration.

- **Change:** `app/globals.css` (8 new Phase-9 tokens), `app/explore/Discover.module.css`, `components/discover/AddToRouteButton.module.css`, `components/discover/CountryPicker.module.css`, `components/discover/DiscoverCategoryRail.module.css`, `components/discover/DiscoverPlaceCard.module.css`, `components/discover/DiscoverPlaceSheet.module.css`, `components/discover/DiscoverRouteCard.module.css`, `components/discover/DiscoverRouteSheet.module.css`, `components/discover/DiscoverTopBar.module.css`.
- **Unchanged (no hardcoded design values to migrate):** `components/discover/DiscoverResultsList.module.css`.
- **Excluded by design (documented, not migrated):** `components/discover/DiscoverMapLayers.tsx`, `lib/discover/categories.ts` (`markerColor`) — Mapbox paint-expression colors, same class of exception as `ACCENT*`/`GLASS_*` in `domain-ui.tsx`.
- **Risks:** the accent-wash/border alpha consolidation (`.4`/`.42`/`.45` → one `.42` token) is a genuine, if minor, visual change across several components at once — flagged here rather than silently absorbed into "just a refactor." The CTA gradient swap (`accent → #ff8a1f` → `--gradient-accent-cta`) is the same kind of change, scoped to every primary Discover CTA.
- **Tests:** no new test files — this phase changed CSS Module values only, verified by the existing suite staying green plus the manual browser pass above; no test in the repo asserts literal color/gradient strings from these files.

---

## 17. Files expected to change

**New**

```
app/explore/DiscoverClient.tsx
app/explore/Discover.module.css
components/discover/DiscoverMap.tsx
components/discover/DiscoverMapLayers.tsx
components/discover/DiscoverTopBar.tsx
components/discover/CountryPickerSheet.tsx
components/discover/DiscoverCategoryRail.tsx
components/discover/DiscoverResultsList.tsx
components/discover/DiscoverPlaceCard.tsx
components/discover/DiscoverPlaceSheet.tsx
components/discover/AddToRouteButton.tsx
components/mobile/DraggableSheet.tsx
components/mobile/DraggableSheet.module.css
components/discover/DiscoverResultsList.tsx
components/discover/DiscoverResultsList.module.css
components/discover/DiscoverPlaceCard.tsx
components/discover/DiscoverPlaceCard.module.css
components/discover/DiscoverPlaceSheet.tsx
components/discover/DiscoverPlaceSheet.module.css
lib/mobile/draggable-sheet.ts               NEW — pure levelFromGesture, not in §11's original list
lib/mapbox/country-layers.ts
lib/discover/categories.ts
lib/discover/discover-query.ts
lib/discover/add-to-route.ts
lib/discover/discover-places.generated.ts
lib/discover/discover-routes.generated.ts
scripts/generate-discover-places.mjs
tests/discover-country.test.mts
tests/discover-categories.test.mts
tests/discover-query.test.mts
tests/discover-sheet.test.mts
tests/discover-add-to-route.test.mts
components/discover/DiscoverRouteCard.tsx           NEW — Phase 7
components/discover/DiscoverRouteCard.module.css     NEW — Phase 7
components/discover/DiscoverRouteResultsList.tsx      NEW — Phase 7
components/discover/DiscoverRouteSheet.tsx           NEW — Phase 7
components/discover/DiscoverRouteSheet.module.css     NEW — Phase 7
tests/discover-places.test.mts                       NEW — Phase 8
```

**Modified**

```
app/explore/page.tsx                                country resolution, active-trip stops/items
app/dashboard/DashboardClient.tsx                   consume DraggableSheet
app/dashboard/MapHome.module.css                    sheet styles move out
components/mobile/index.ts                          export DraggableSheet
components/explore/AddPlaceToTripSheet.tsx          Route/Itinerary target toggle
components/explore/GooglePlacesExplorer.tsx         drop `mode`, drop GoogleExploreMap
components/trips/new/CountryGlobe.tsx               import extracted country layers
lib/trip-country-selection.ts                       + resolveCountryCode
app/trip/[id]/mobile/components/ExploreDomain.tsx   drop `mode` prop
app/trip/[id]/mobile/explore/explore-logic.ts       drop CATEGORY_CHIPS
tests/accessibility-contracts.test.mts              sheet handle + card contracts
docs/app-flow-overview.md, current-mobile-baseline.md, mobile-regression-checklist.md
lib/discover/categories.ts                          Phase 7: `routes` entry
lib/discover/discover-query.ts                      Phase 7: filterDiscoverRoutes, routesToLineFeatureCollection, widened LatLng bounds
lib/discover/discover-routes.generated.ts            Phase 7: `id` field
lib/discover/add-to-route.ts                        Phase 7: buildCreateTripPayloadFromRoute, buildRouteStopsPayload
components/discover/DiscoverMapLayers.tsx            Phase 7: route line layer
components/discover/DiscoverMap.tsx                  Phase 7: routes prop, route camera effects
app/explore/DiscoverClient.tsx                       Phase 7: route state, handlers, rendering
tests/discover-query.test.mts, discover-add-to-route.test.mts, discover-categories.test.mts   Phase 7 coverage
scripts/generate-discover-places.mjs                 Phase 8: Commons attribution enrichment
lib/discover/discover-places.generated.ts             Phase 8: regenerated with real imageAttribution
app/explore/DiscoverClient.tsx                       Phase 8: credit line content, suppressed for routes
app/globals.css                                       Phase 9: 8 new Discover token additions
app/explore/Discover.module.css, components/discover/{AddToRouteButton,CountryPicker,DiscoverCategoryRail,DiscoverPlaceCard,DiscoverPlaceSheet,DiscoverRouteCard,DiscoverRouteSheet,DiscoverTopBar}.module.css   Phase 9: token migration
```

**Deleted (Phase 6)**

```
app/explore/ExploreClient.tsx
components/explore/ExploreMapbox.tsx
components/explore/GoogleExploreMap.tsx
components/explore/CountryCard.tsx
components/explore/EmptyCountries.tsx
components/explore/StarField.tsx
components/explore/explore-ui.tsx
components/explore/DiscoverCard.tsx
components/explore/explore-routes-data.ts
```

**No migration is required for Phases 1–6** as specified. A `discover_places` table plus bbox RPC is a deliberate later step (§8.3), consistent with the repo's manual-apply migration workflow.

---

## 18. Risks and open questions

### Resolved

1. **Can Google Places coordinates be persisted on a `stops` row? — Resolved 2026-08-08: no, ship curated-only.** `insertPlace` deliberately says no for itinerary items; stops cannot exist without coordinates. Phase 4 shipped recommendation (a): curated places get "Add to Route", Google Places results are untouched (they aren't in Discover yet — Phase 5). Options (b) geocoding and (c) a legal read on persisting `location` remain open for whenever Places results need a stop path.

12. **Should the `routes` layer's "Use This Route" keep creating a new trip, or gain an "append to current trip" option? — Resolved 2026-08-08 (Phase 7): both.** `DiscoverRouteSheet` offers "Use This Route" (primary, unconditional — clones into a brand-new trip via `create_trip_with_stops`, ported verbatim from the retired `ExploreClient.handleUseRoute`) and "Add to {trip title}" (secondary, shown only when an editable active trip exists — appends every waypoint as sequential `stops` rows). The append path mirrors §9.1's "Discover appends; Plan arranges" rule already established for single places: a six-waypoint template is just several appends in one insert, not a different kind of operation. See §16 Phase 7 for the exact payload builders (`buildCreateTripPayloadFromRoute`, `buildRouteStopsPayload`).
3. **Attribution obligations — Resolved 2026-08-09 (Phase 8).** `components/explore/ExploreAttribution.tsx`, floated here as "may be the right home," turned out to be the wrong component entirely — it's a trip-scoped `"Google Maps"` label used by `ExploreResultsList`/`GooglePlaceDetailSheet` in the Explore tab (`app/trip/[id]/mobile`), unrelated to Discover's OSM/Wikidata/Commons data. No new component was built in its place; instead the existing persistent credit line in `DiscoverClient.tsx`'s sheet footer (`.credit`) was corrected and kept as the single attribution surface. The dataset audit found: (a) `scripts/generate-discover-places.mjs` queries **Wikidata SPARQL only** — no Overpass/OSM call exists in the codebase — so **no ODbL credit is owed**; (b) Wikidata's own data is CC0 (no attribution required, credited anyway as courtesy); (c) each place's `imageUrl` is a Wikimedia Commons file, individually licensed (commonly CC-BY-SA, which *does* require author credit), and the seeder's `imageAttribution` field previously carried only the bare filename (`"Wikimedia Commons · File.jpg"`) — a source label, not a legally sufficient attribution. Fixed by adding a Commons API (`action=query&prop=imageinfo&iiprop=extmetadata`) enrichment pass to the seeder that fetches each file's real `LicenseShortName`/`Artist` and formats `imageAttribution` as `"{artist} · Wikimedia Commons · {license}"` (falling back gracefully when Commons has no metadata for a file), cached by filename in `scripts/.discover-cache/commons-attribution.json` so re-runs don't re-fetch. The dataset was regenerated against this; all 1,352 places across the 9 seeded countries now carry real per-file credit. `DiscoverPlaceSheet.tsx` already surfaced `imageAttribution` per-file (unchanged). `discover-routes.generated.ts` (Tier C road trips) is hand-curated with no external data source, so it carries no attribution obligation and the credit line is suppressed for the `routes` category. See §16 Phase 8.

7. **Design-system split — Resolved 2026-08-09 (Phase 9).** The inline `DUSK`/`SUNSET_GRADIENT` page was already gone (deleted with `ExploreClient.tsx` in Phase 6), but the CSS Modules that replaced it hadn't fully landed on the token layer either — an audit found hardcoded hex/rgba mixed with `var(--color-*)`/`var(--glass-*)` calls across all 10 of Discover's `.module.css` files. Every hardcoded color/blur/shadow/radius was migrated: repeated values became new shared tokens in `app/globals.css` (accent-wash/hover/selected states, a success wash, a CTA shadow, a shared image-placeholder gradient, a neutral hover overlay, two map scrims), one-off values normalized onto the nearest existing token, and two values kept literal with the reason written into the CSS as a comment. Mapbox paint-expression colors (`DiscoverMapLayers.tsx`, `categories.ts`'s `markerColor`) stay literal by design, matching the existing `ACCENT*`/`GLASS_*` exception. See §16 Phase 9 for the full file-by-file breakdown.

### High

2. **Where does the curated dataset come from, and who maintains it?** The plan proposes a build-time Wikidata/OSM seeder plus manual `rank` curation. If nobody will curate, the whole "Must Visit" premise degrades to whatever the query returns, and the feature is worth reconsidering.
4. **The Map Home migration in Phase 3** touches a shipped screen. Mitigation: a separate commit, behavior-identical, existing tests green.

### Medium

5. **Region/state data does not exist.** `stops.state` is unpopulated and `TripCountry` has no subdivision. The card's second line comes from the curated `region` field only; live Places results have no region and must fall back to `formattedAddress`.
6. **Curated images.** Wikidata `P18` images vary widely in quality and aspect ratio. Budget for a curation/crop pass, or ship a category-gradient placeholder (the existing `empty-state-art.tsx` and `MapHome.module.css` gradient vocabulary is a fine fallback).
8. **Bundle size** if the world dataset ships eagerly. Mitigated by per-country dynamic import; measure before committing.

### Open questions

9. Should the "countries visited / trips / nights" passport block move to `/profile`, or stay as a Discover layer? The plan recommends Profile — Discover should look forward.
10. Should Discover subscribe to trip realtime, or refetch on focus? The plan says refetch: cheaper and sufficient.
11. Is `/discover` wanted as a real URL redirecting to `/explore`, or is the nav label enough?
13. Does the "Search this area" button, rather than automatic viewport refetch, match product intent? It is the cost-safe choice; the brief asked for the automatic version.

---

## Summary of the core recommendations

1. **`/explore` survives** — the nav already calls it Discover. No second route, no parallel implementation.
2. **Build `DiscoverMap` as a sibling of `TripboxMap`**, on GeoJSON sources plus native clustering rather than React markers.
3. **Extract Map Home's three-state draggable sheet** into `components/mobile/DraggableSheet.tsx` and use it in both places. Keep `MobileBottomSheet` for modal detail sheets.
4. **Split categories into curated (own data, country-scale, free) and live (Google Places, viewport-scale, billed)** — the current Places API surface provably cannot do country-scale discovery.
5. **Seed the curated dataset at build time** from Wikidata/OSM into a generated module, mirroring `lib/country-data.generated.ts`. No new runtime dependency.
6. **"Add to Route" writes `stops`, not `itinerary_items`** — and is curated-only until the provider-geography question is settled.
7. **Selected country is the one new piece of state**: URL param plus localStorage, resolved server-side, reusing `getCountryOptions` / `cameraForCountries` / `selectFeaturedTrip` rather than a second picker.
8. **Delete the second map SDK.** `GoogleExploreMap` goes; Places results render on Mapbox.
