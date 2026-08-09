/*
 * Pure search/add-to-trip logic for the trip-context Explore tab.
 *
 * No `@/` imports: exercised directly by the node test runner
 * (tests/explore-logic.test.mts), which doesn't resolve path aliases — same
 * convention as itinerary-projection.ts. `ItemTypeId` mirrors
 * `ItineraryItemType` from types/index.ts structurally rather than importing
 * it, for the same reason.
 */

export type ItemTypeId =
  | 'place'
  | 'activity'
  | 'stay'
  | 'flight'
  | 'transport'
  | 'restaurant'
  | 'reservation'
  | 'note'
  | 'free_time'

export interface CategoryChip {
  id: string
  label: string
  /** Term sent to Mapbox search when this chip is active and no free-text query is typed. */
  searchTerm: string
  defaultItemType: ItemTypeId
  /** Default estimated visit duration in minutes; 0 means "flexible / not applicable" (e.g. hotels). */
  defaultDurationMin: number
}

export const DURATION_STEPS_MIN = [30, 45, 60, 90, 120, 180, 240, 360, 480]

/** Compact duration label from raw minutes, e.g. 90 -> "1h 30m". 0 -> "Flexible". */
export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return 'Flexible'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** Lowercase, accent-stripped, punctuation-collapsed title for loose matching. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface LatLng {
  lat: number
  lng: number
}

/** Straight-line distance in meters between two coordinates (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Two places within this radius are treated as "probably the same place" for dedup purposes. */
export const DUPLICATE_DISTANCE_METERS = 75

export interface DuplicateCandidate {
  providerId?: string | null
  title: string
  lat: number
  lng: number
}

export interface DuplicateSource {
  id: string
  providerId?: string | null
  title: string
  lat: number | null
  lng: number | null
}

export interface DuplicateMatch {
  source: 'stop' | 'item'
  id: string
  title: string
  reason: 'provider_id' | 'name_and_distance'
}

/**
 * Provider IDs are compared when available in the current session. They are
 * not persisted from temporary Mapbox responses. Otherwise both normalized
 * title and nearby coordinates must match; either signal alone creates false
 * positives for chains and neighboring venues.
 * Checks stops before items since stops are the trip's route backbone.
 */
export function findDuplicate(
  candidate: DuplicateCandidate,
  stops: DuplicateSource[],
  items: DuplicateSource[],
): DuplicateMatch | null {
  const normalizedCandidate = normalizeTitle(candidate.title)

  const check = (source: 'stop' | 'item', list: DuplicateSource[]): DuplicateMatch | null => {
    for (const entry of list) {
      const providerMatch = !!candidate.providerId && candidate.providerId === entry.providerId
      const titleMatch = normalizedCandidate.length > 0 && normalizeTitle(entry.title) === normalizedCandidate
      const distanceMatch =
        entry.lat != null &&
        entry.lng != null &&
        distanceMeters(candidate, { lat: entry.lat, lng: entry.lng }) < DUPLICATE_DISTANCE_METERS
      if (providerMatch || (titleMatch && distanceMatch)) {
        return { source, id: entry.id, title: entry.title, reason: providerMatch ? 'provider_id' : 'name_and_distance' }
      }
    }
    return null
  }

  return check('stop', stops) ?? check('item', items)
}

const CATEGORY_KEYWORD_MAP: Array<{ keywords: string[]; itemType: ItemTypeId }> = [
  { keywords: ['hotel', 'lodging', 'hostel', 'motel', 'resort'], itemType: 'stay' },
  { keywords: ['restaurant', 'food', 'diner', 'eatery'], itemType: 'restaurant' },
  { keywords: ['cafe', 'coffee', 'bakery'], itemType: 'restaurant' },
  { keywords: ['bar', 'nightclub', 'pub', 'nightlife'], itemType: 'activity' },
  { keywords: ['museum', 'gallery', 'landmark', 'attraction', 'park', 'zoo', 'aquarium', 'theme park'], itemType: 'activity' },
  { keywords: ['airport'], itemType: 'flight' },
  { keywords: ['train station', 'bus station', 'transit', 'station'], itemType: 'transport' },
]

/** Best-effort itinerary item type guess from Mapbox's raw POI category string, else the active chip's default. */
export function categoryFromMapboxCategory(raw: string | undefined, fallback: ItemTypeId): ItemTypeId {
  if (!raw) return fallback
  const lower = raw.toLowerCase()
  for (const entry of CATEGORY_KEYWORD_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) return entry.itemType
  }
  return fallback
}
