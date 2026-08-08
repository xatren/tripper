# Discover + Explore — Unified Map Experience

**Status:** Phases 1 and 2 shipped (2026-08-08). Phases 3–6 open. See §16 for per-phase notes.
**Author:** analysis pass over the repository at `main` (2026-08-08).
**Scope:** merge the two discovery surfaces into one map-first page, define its data, state, and component architecture, and stage the work.

> **Progress**
> - **Phase 1 — done.** Country-framed full-bleed map at `/explore`.
> - **Phase 2 — done.** Curated dataset, category rail, clustered GeoJSON pin layers.
> - **Phase 3 — next.** `DraggableSheet` extracted from Map Home; place cards and the detail sheet.
> - **Blocked before Phase 4:** the §18.1 provider-geography question still needs a yes/no.

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
- **Attribution (§18.3) is partly discharged:** the sheet carries a persistent "Places from Wikidata · photos from Wikimedia Commons" credit. Per-file `imageAttribution` is carried on every row and must surface in the Phase 3 detail sheet.
- `tests/discover-categories.test.mts`, `tests/discover-query.test.mts`, and a new rail/list case in `tests/accessibility-contracts.test.mts`. Full suite green.

- **Create:** `lib/discover/categories.ts`, `discover-query.ts`, `discover-places.generated.ts`, `scripts/generate-discover-places.mjs`, `components/discover/DiscoverCategoryRail.tsx`.
- **Change:** `DiscoverMapLayers.tsx` (cluster layers, category icons via `addImage`), `DiscoverClient.tsx` (category state, `?cat=` param).
- Seed 5–10 countries in the first pass; the rest is data work that does not block code.
- **Risks:** dataset licensing and attribution (Wikidata CC0; OSM ODbL requires attribution — surface it near the Mapbox attribution). Icon registration must survive `style.load` re-fires.
- **Tests:** `tests/discover-categories.test.mts` (every category resolves; live categories carry `minZoom` and `placesCategory`), `tests/discover-query.test.mts` (country filter, category filter, bbox including dateline, rank slice, paging).

### Phase 3 — Draggable sheet and place cards

**Goal:** the three-state sheet, synchronized with markers, with Map Home migrated onto the shared component.

- **Create:** `components/mobile/DraggableSheet.tsx` plus module CSS, `DiscoverResultsList.tsx`, `DiscoverPlaceCard.tsx`, `DiscoverPlaceSheet.tsx`.
- **Change:** `app/dashboard/DashboardClient.tsx` and `MapHome.module.css` → consume `DraggableSheet` (behavior-identical), `components/mobile/index.ts` export.
- **Risks:** the Map Home migration is the riskiest edit in the plan — it touches a shipped screen with existing tests. Do it as its own commit, diffed against current behavior. Card↔marker scroll sync can loop (card selects → map moves → `moveend` → reselect); break it with a `selectionSource` ref.
- **Tests:** `tests/map-home.test.mts` must pass unchanged; `tests/accessibility-contracts.test.mts` extended for the sheet handle (`aria-expanded`, 44 px) and card buttons; new `tests/discover-sheet.test.mts` for level transitions from drag deltas (extract a pure `levelFromGesture(level, delta)` for testability).

### Phase 4 — Add to Route

**Goal:** curated places reach a trip's `stops`; Places results reach `itinerary_items`.

- **Create:** `lib/discover/add-to-route.ts` (stop payload, `nights` from category, `stop_type`, duplicate gating), `components/discover/AddToRouteButton.tsx`.
- **Change:** `AddPlaceToTripSheet.tsx` (Route/Itinerary target toggle), `DiscoverClient.tsx` (insert, optimistic, rollback, toast), `app/explore/page.tsx` (fetch active-trip stops/items for the "already added" set).
- **Reuse verbatim:** `findPlaceDuplicate`, `create_trip_with_stops`, `tripCapabilitiesForRole`, the `showToast` retry contract.
- **Risks:** the §9.2 provider-geography constraint — **resolve the Tier-B decision before starting this phase**, or scope it to curated-only as recommended. `nights` semantics: a wrong default silently lengthens the trip (`20260808120000`).
- **Tests:** `tests/discover-add-to-route.test.mts` — payload for first vs Nth stop, `nights` per category, `order_index`, viewer rejection, duplicate detection against both stops and items, no-trip → create-trip payload shape (including the deliberate `nights` omission for cities).

### Phase 5 — Live layers, performance, mobile polish

- Wire `food` / `museums` / `stays` to `/api/places/search` with the zoom gate and the explicit "Search this area" button.
- Session result cache; debounced `moveend`; `content-visibility` on the list.
- Desktop rail breakpoint (§13); hover preview.
- Delete `GoogleExploreMap.tsx` and its import.
- **Risks:** rate-limit behavior under rapid category switching — reuse the `AbortController` plus sequence-number pattern from `GooglePlacesExplorer`; do not invent a new one.
- **Tests:** extend `tests/google-places.test.mts` for the discover query shape; manual pass against `docs/mobile-regression-checklist.md`.

### Phase 6 — States, animation, cleanup

- Empty / loading / error / offline states for all 17 cases in §15.
- Move the visited-countries stat block to `/profile`.
- Delete: `ExploreClient.tsx`, `ExploreMapbox.tsx`, `CountryCard.tsx`, `EmptyCountries.tsx`, `StarField.tsx`, `explore-ui.tsx`, `DiscoverCard.tsx`, `explore-routes-data.ts`, `CATEGORY_CHIPS`, the `mode` prop on `GooglePlacesExplorer`.
- Update `docs/app-flow-overview.md`, `docs/current-mobile-baseline.md`, `docs/mobile-regression-checklist.md`.
- **Risks:** deleting `mode` from `GooglePlacesExplorer` touches the live trip Explore tab — verify against `tests/explore-logic.test.mts` and a manual trip-tab pass.

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

### Blocking — decide before Phase 4

1. **Can Google Places coordinates be persisted on a `stops` row?** `insertPlace` deliberately says no for itinerary items. Stops cannot exist without coordinates. Recommendation: curated-only "Add to Route" for v1 (§9.2). This needs a yes/no, not a guess.

### High

2. **Where does the curated dataset come from, and who maintains it?** The plan proposes a build-time Wikidata/OSM seeder plus manual `rank` curation. If nobody will curate, the whole "Must Visit" premise degrades to whatever the query returns, and the feature is worth reconsidering.
3. **Attribution obligations.** OSM/ODbL requires attribution; Wikidata images carry per-file licenses. This needs a visible attribution surface next to the existing Mapbox attribution (`components/explore/ExploreAttribution.tsx` exists and may be the right home).
4. **The Map Home migration in Phase 3** touches a shipped screen. Mitigation: a separate commit, behavior-identical, existing tests green.

### Medium

5. **Region/state data does not exist.** `stops.state` is unpopulated and `TripCountry` has no subdivision. The card's second line comes from the curated `region` field only; live Places results have no region and must fall back to `formattedAddress`.
6. **Curated images.** Wikidata `P18` images vary widely in quality and aspect ratio. Budget for a curation/crop pass, or ship a category-gradient placeholder (the existing `empty-state-art.tsx` and `MapHome.module.css` gradient vocabulary is a fine fallback).
7. **Design-system split.** Discover should land on CSS Modules plus the Liquid Glass tokens in `globals.css` (per `docs/liquid-glass-design-system.md`), not the inline `DUSK`/`SUNSET_GRADIENT` style of the old page. That is a real rewrite, not a port.
8. **Bundle size** if the world dataset ships eagerly. Mitigated by per-country dynamic import; measure before committing.

### Open questions

9. Should the "countries visited / trips / nights" passport block move to `/profile`, or stay as a Discover layer? The plan recommends Profile — Discover should look forward.
10. Should Discover subscribe to trip realtime, or refetch on focus? The plan says refetch: cheaper and sufficient.
11. Is `/discover` wanted as a real URL redirecting to `/explore`, or is the nav label enough?
12. Should the `routes` layer's "Use This Route" keep creating a **new** trip, or gain an "append to current trip" option? Appending a six-waypoint template into an existing route is a bigger UX question than a single place add.
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
