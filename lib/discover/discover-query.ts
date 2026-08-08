// Pure Discover querying: country/category filtering, dateline-safe bounds, rank
// capping, paging, and the GeoJSON the map source consumes.
//
// Deliberately alias-free (`./` imports only) so `tests/discover-query.test.mts`
// can load it under `node --experimental-strip-types`. It takes the dataset as an
// argument rather than importing it, so tests can use small fixtures.

import type { DiscoverCategoryId } from './categories.ts'
import type { DiscoverPlace } from './discover-places.generated.ts'

/** West/east are normalised to [-180, 180); `west > east` means the box crosses the antimeridian. */
export interface DiscoverBounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * Wraps any longitude into [-180, 180), matching how `cameraForCountries` reasons
 * about the dateline. Values already in range are returned untouched: the modulo
 * round-trip drifts 29.1 to 29.100000000000023, and these coordinates flow
 * straight into `fitBounds` and into identity comparisons.
 */
export function normalizeLongitude(lng: number): number {
  if (lng >= -180 && lng < 180) return lng
  const wrapped = (((lng + 180) % 360) + 360) % 360
  return wrapped - 180
}

/**
 * Dateline-safe containment. A Fiji-shaped box has `west = 176` and `east = -178`,
 * so the longitude test has to become a union of two spans rather than a range.
 */
export function boundsContain(bounds: DiscoverBounds, lat: number, lng: number): boolean {
  if (lat < bounds.south || lat > bounds.north) return false
  const x = normalizeLongitude(lng)
  const west = normalizeLongitude(bounds.west)
  const east = normalizeLongitude(bounds.east)
  return west <= east ? x >= west && x <= east : x >= west || x <= east
}

export interface DiscoverFilter {
  countryCode?: string | null
  categoryId?: DiscoverCategoryId | null
  /** Narrows the *list* only. Pins always render the full country set so the map never looks empty. */
  bounds?: DiscoverBounds | null
}

/**
 * The one filter every curated surface goes through. Ordered by descending rank
 * so callers can `slice` for a top-N without re-sorting.
 */
export function filterDiscoverPlaces(places: readonly DiscoverPlace[], filter: DiscoverFilter): DiscoverPlace[] {
  const code = filter.countryCode?.trim().toUpperCase() || null
  return places
    .filter((place) => {
      if (code && place.countryCode !== code) return false
      if (filter.categoryId && !place.categories.includes(filter.categoryId)) return false
      if (filter.bounds && !boundsContain(filter.bounds, place.lat, place.lng)) return false
      return true
    })
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
}

/** Caps pin density on a huge country. Input is assumed rank-ordered by `filterDiscoverPlaces`. */
export function rankedSlice(places: readonly DiscoverPlace[], limit: number): DiscoverPlace[] {
  return limit > 0 ? places.slice(0, limit) : [...places]
}

/** Zero-based paging for the sheet list. An out-of-range page yields an empty array rather than throwing. */
export function sliceByPage(places: readonly DiscoverPlace[], page: number, pageSize: number): DiscoverPlace[] {
  if (pageSize <= 0 || page < 0) return []
  return places.slice(page * pageSize, page * pageSize + pageSize)
}

/**
 * A bounding box over the given places, dateline-safe: for a set straddling the
 * antimeridian the naive min/max spans almost the whole globe, so the wrapped
 * span is computed too and the narrower of the two wins.
 */
export function boundsForPlaces(places: readonly DiscoverPlace[]): DiscoverBounds | null {
  if (places.length === 0) return null

  let south = Infinity
  let north = -Infinity
  const longitudes: number[] = []
  for (const place of places) {
    south = Math.min(south, place.lat)
    north = Math.max(north, place.lat)
    longitudes.push(normalizeLongitude(place.lng))
  }

  const naiveWest = Math.min(...longitudes)
  const naiveEast = Math.max(...longitudes)
  const naiveSpan = naiveEast - naiveWest

  // The same points measured on a 0–360 axis: this is the narrow span when the
  // set is really a tight cluster sitting on either side of the antimeridian.
  const shifted = longitudes.map((lng) => (lng < 0 ? lng + 360 : lng))
  const shiftedWest = Math.min(...shifted)
  const shiftedEast = Math.max(...shifted)

  if (shiftedEast - shiftedWest < naiveSpan) {
    return { west: normalizeLongitude(shiftedWest), south, east: normalizeLongitude(shiftedEast), north }
  }
  return { west: naiveWest, south, east: naiveEast, north }
}

/**
 * §4.2's refit rule: only reframe the camera when the new results are largely
 * off-screen. Refitting on every category tap fights a user who has deliberately
 * zoomed into one region, which reads as the map undoing their navigation.
 */
export function shouldRefitCamera(
  places: readonly DiscoverPlace[],
  viewport: DiscoverBounds | null,
  visibleThreshold = 0.6,
): boolean {
  if (places.length === 0) return false
  if (!viewport) return true
  const visible = places.filter((place) => boundsContain(viewport, place.lat, place.lng)).length
  return visible / places.length < visibleThreshold
}

export interface DiscoverFeatureProperties {
  id: string
  name: string
  rank: number
  /** The layer that surfaced this place, so the pin can take its category colour. */
  category: DiscoverCategoryId
}

export interface DiscoverFeatureCollection {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    id: number
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: DiscoverFeatureProperties
  }[]
}

/**
 * The map's single source of truth for pins. A numeric `id` is required for
 * Mapbox feature state and cluster bookkeeping; the slug lives in `properties`.
 */
export function placesToFeatureCollection(
  places: readonly DiscoverPlace[],
  category: DiscoverCategoryId,
): DiscoverFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.map((place, index) => ({
      type: 'Feature',
      id: index,
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: { id: place.id, name: place.name, rank: place.rank, category },
    })),
  }
}

/**
 * Whether a country has any curated coverage at all — the difference between
 * "no national parks mapped in X yet" and "we haven't mapped X yet" (§15 cases 1–2).
 */
export function hasCuratedCoverage(countryCode: string | null | undefined, seeded: readonly string[]): boolean {
  if (!countryCode) return false
  return seeded.includes(countryCode.trim().toUpperCase())
}
