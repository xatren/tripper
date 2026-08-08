// The single Discover taxonomy. Deliberately alias-free (`../` imports only) so
// `tests/discover-categories.test.mts` can load it under
// `node --experimental-strip-types`, per the repo's pure-logic test convention.
//
// This replaces the two near-duplicate lists that had already drifted:
// `explore-logic.ts` CATEGORY_CHIPS (Mapbox-era, retired in Phase 6) and
// `lib/google-places/category-map.ts` (which stays, but only as the provider
// mapping this module references by id).

export type DiscoverSource = 'curated' | 'places'

export type DiscoverCategoryId =
  | 'must_visit'
  | 'national_parks'
  | 'nature'
  | 'viewpoints'
  | 'landmarks'
  | 'cities'
  | 'beaches'
  | 'food'
  | 'museums'
  | 'stays'

/** The Places category ids this taxonomy is allowed to proxy, mirroring `GooglePlaceCategoryId`. */
export type DiscoverPlacesCategory = 'restaurants' | 'cafes' | 'museums' | 'hotels'

export interface DiscoverCategory {
  id: DiscoverCategoryId
  label: string
  /**
   * `curated` layers read the owned dataset: country-scoped, free, legible at any
   * zoom. `places` layers are billed Google queries over a 50 km circle, so they
   * are meaningless at country zoom — hence `minZoom`.
   */
  source: DiscoverSource
  /** Curated: matched against `DiscoverPlace.categories`. Places: the provider categories to query. */
  placesCategories?: DiscoverPlacesCategory[]
  /** Live layers are hidden below this zoom, where a 50 km circle covers a pixel. */
  minZoom?: number
  /**
   * What `nights` a place of this category gets when it becomes a stop. Cities are
   * overnights that create a trip day; a viewpoint is somewhere you drive through.
   * See `20260808120000_stop_overnight_semantics.sql` — a wrong default silently
   * lengthens the trip.
   */
  defaultStopNights: 0 | 1
  /** Literal hex: Mapbox paint expressions are evaluated off the document and cannot read CSS custom properties. */
  markerColor: string
}

/** Zoom at which a 50 km Places circle is a sensible fraction of the viewport. */
export const LIVE_LAYER_MIN_ZOOM = 10

export const DISCOVER_CATEGORIES: readonly DiscoverCategory[] = [
  { id: 'must_visit', label: 'Must Visit', source: 'curated', defaultStopNights: 0, markerColor: '#f5a623' },
  { id: 'national_parks', label: 'National Parks', source: 'curated', defaultStopNights: 0, markerColor: '#3fbf7f' },
  { id: 'nature', label: 'Nature', source: 'curated', defaultStopNights: 0, markerColor: '#4fc3d9' },
  { id: 'viewpoints', label: 'Scenic Views', source: 'curated', defaultStopNights: 0, markerColor: '#c08bf0' },
  { id: 'landmarks', label: 'Landmarks', source: 'curated', defaultStopNights: 0, markerColor: '#e0784a' },
  { id: 'cities', label: 'Cities & Towns', source: 'curated', defaultStopNights: 1, markerColor: '#ff9f6b' },
  { id: 'beaches', label: 'Beaches', source: 'curated', defaultStopNights: 0, markerColor: '#f2d06b' },
  {
    id: 'food',
    label: 'Food',
    source: 'places',
    placesCategories: ['restaurants', 'cafes'],
    minZoom: LIVE_LAYER_MIN_ZOOM,
    defaultStopNights: 0,
    markerColor: '#ff7a7a',
  },
  {
    id: 'museums',
    label: 'Museums',
    source: 'places',
    placesCategories: ['museums'],
    minZoom: LIVE_LAYER_MIN_ZOOM,
    defaultStopNights: 0,
    markerColor: '#9aa8ff',
  },
  {
    id: 'stays',
    label: 'Stays',
    source: 'places',
    placesCategories: ['hotels'],
    minZoom: LIVE_LAYER_MIN_ZOOM,
    defaultStopNights: 1,
    markerColor: '#7fd6a8',
  },
] as const

/** The rail's default layer, and the fallback for any unrecognised `?cat=` value. */
export const DEFAULT_DISCOVER_CATEGORY: DiscoverCategoryId = 'must_visit'

export function isDiscoverCategory(value: string | null | undefined): value is DiscoverCategoryId {
  return DISCOVER_CATEGORIES.some((category) => category.id === value)
}

/** Never throws: an unknown id degrades to the default layer rather than a blank page. */
export function discoverCategory(value: string | null | undefined): DiscoverCategory {
  const found = DISCOVER_CATEGORIES.find((category) => category.id === value)
  if (found) return found
  return DISCOVER_CATEGORIES.find((category) => category.id === DEFAULT_DISCOVER_CATEGORY) as DiscoverCategory
}

export function curatedCategories(): DiscoverCategory[] {
  return DISCOVER_CATEGORIES.filter((category) => category.source === 'curated')
}

export function liveCategories(): DiscoverCategory[] {
  return DISCOVER_CATEGORIES.filter((category) => category.source === 'places')
}

/**
 * Whether a live layer can currently return anything useful. Curated layers are
 * always available — that split is the whole point of the taxonomy (§7.1).
 */
export function categoryAvailableAtZoom(category: DiscoverCategory, zoom: number): boolean {
  return category.minZoom === undefined || zoom >= category.minZoom
}

// Deferred, deliberately absent from DISCOVER_CATEGORIES until they have data:
//   `hidden_gems` — a cross-cutting curation flag, needs a human pass per country.
//   `routes`      — Tier C; lands when `explore-routes-data.ts` moves to
//                   `lib/discover/discover-routes.generated.ts`.
// A chip that can only ever render an empty state is worse than no chip.
