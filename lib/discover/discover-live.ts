// Pure helpers bridging live Google Places results into the same shapes
// DiscoverMap / DiscoverResultsList / DiscoverPlaceCard already render for
// curated places (Phase 5, §7.1's "live layers"). Deliberately alias-free
// (`../` imports only) so `tests/discover-live.test.mts` can load it under
// `node --experimental-strip-types`, per the repo's pure-logic test convention.
//
// A live result never becomes a `DiscoverPlace` in the dataset sense — it has
// no rank curation, no region from Wikidata, no owned image — but giving it
// the same field shape means the map layer and the card/list components need
// no live-specific branch at all (§5.2/§6.3 stay true for both sources).

import type { DiscoverCategoryId } from './categories.ts'
import type { DiscoverPlace } from './discover-places.generated.ts'
import type { GooglePlaceSearchResult } from '../google-places/types.ts'

/** Marks a Discover id as sourced from Places rather than the curated dataset, so callers can route the detail sheet without a second id table. */
export const LIVE_PLACE_ID_PREFIX = 'google:'

export function liveDiscoverId(placeId: string): string {
  return `${LIVE_PLACE_ID_PREFIX}${placeId}`
}

export function isLiveDiscoverId(id: string): boolean {
  return id.startsWith(LIVE_PLACE_ID_PREFIX)
}

/** Inverse of `liveDiscoverId`. Returns the id unchanged if it never carried the prefix. */
export function rawPlaceId(discoverId: string): string {
  return isLiveDiscoverId(discoverId) ? discoverId.slice(LIVE_PLACE_ID_PREFIX.length) : discoverId
}

/**
 * A live result rendered through the curated-shaped components. `countryCode`
 * is left blank — live results bypass `filterDiscoverPlaces`'s country filter
 * entirely, since they are already viewport-scoped (§8.4). `rank` is clamped
 * from the rating signal so denser clusters still order sensibly on the map.
 */
export function mapGooglePlaceToDiscoverPlace(result: GooglePlaceSearchResult, category: DiscoverCategoryId): DiscoverPlace {
  const rank = Math.max(0, Math.min(100, Math.round((result.rating ?? 0) * 20)))
  return {
    id: liveDiscoverId(result.placeId),
    name: result.name,
    countryCode: '',
    region: result.formattedAddress,
    lat: result.lat,
    lng: result.lng,
    categories: [category],
    rank,
    blurb: result.primaryTypeLabel,
    // Google photos stay confined to an authed proxy and never appear on list
    // cards, curated or live alike (§8.5) — only the detail flow may fetch one.
    imageUrl: null,
    imageAttribution: null,
    suggestedHours: null,
  }
}

/** Dedupes across the parallel per-type calls a multi-type category (e.g. `food` -> restaurants + cafes) fires, keeping the first — highest-priority — occurrence. */
export function mergeLiveResultBatches(batches: readonly (readonly GooglePlaceSearchResult[])[]): GooglePlaceSearchResult[] {
  const seen = new Set<string>()
  const merged: GooglePlaceSearchResult[] = []
  for (const batch of batches) {
    for (const result of batch) {
      if (seen.has(result.placeId)) continue
      seen.add(result.placeId)
      merged.push(result)
    }
  }
  return merged
}

/**
 * A session-cache key for one live search. Coordinates are rounded to ~110 m
 * (3 decimal places) so a sub-block pan reuses the cached page instead of
 * re-billing the same neighbourhood, mirroring `GooglePlacesExplorer`'s
 * `queryKey` convention without inventing a new one.
 */
export function liveQueryKey(categoryId: DiscoverCategoryId, center: { lat: number; lng: number }): string {
  return `${categoryId}|${center.lat.toFixed(3)}|${center.lng.toFixed(3)}`
}
