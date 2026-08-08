import { distanceMeters, normalizeTitle } from './google-places/pure.ts'

export interface TripPhotoStop {
  id: string
  lat: number
  lng: number
  name?: string
  address?: string | null
  order_index?: number
  stop_type?: string
}

export interface TripPhotoCandidate {
  name: string
  photoRef: string | null
  photoWidth: number | null
  photoHeight: number | null
  lat: number
  lng: number
  /** Present on real provider results; absent in older callers and fixtures. */
  primaryType?: string | null
  userRatingCount?: number | null
}

export interface TripAutoPhoto {
  ref: string
  placeName: string
  width: number | null
  height: number | null
}

/** A trip card is a wide crop, so the search stays inside the destination's own area. */
const LANDMARK_RADIUS_METERS = 30_000

/**
 * How many reviews a place needs before we trust its first photo to be a scene
 * rather than somebody's snapshot. Recognisable scenery clears this easily; the
 * unnamed roadside pin that produced the irrelevant covers does not. Unknown
 * counts (fixtures, older payloads) are not penalised.
 */
const MIN_RATINGS_SCENIC = 300
const MIN_RATINGS_OTHER = 1_000

/**
 * Primary types whose first photo is reliably a place, not a scene: interiors,
 * storefronts, menus, forecourts and lobbies. These are the covers that read as
 * "irrelevant" on a trip card even when the place itself is on the route.
 */
const UNPHOTOGENIC_TYPES = new Set([
  'lodging', 'hotel', 'motel', 'hostel', 'guest_house', 'bed_and_breakfast', 'campground', 'rv_park',
  'restaurant', 'cafe', 'coffee_shop', 'bakery', 'bar', 'night_club', 'meal_takeaway', 'meal_delivery',
  'store', 'supermarket', 'grocery_store', 'shopping_mall', 'convenience_store', 'department_store',
  'clothing_store', 'furniture_store', 'electronics_store', 'book_store', 'gift_shop',
  'gas_station', 'electric_vehicle_charging_station', 'parking', 'car_rental', 'car_repair', 'car_dealer',
  'atm', 'bank', 'pharmacy', 'hospital', 'doctor', 'dentist', 'gym', 'hair_salon', 'spa',
  'airport', 'international_airport', 'bus_station', 'bus_stop', 'train_station', 'subway_station',
  'transit_station', 'transit_depot', 'taxi_stand', 'rest_stop', 'truck_stop',
  'real_estate_agency', 'travel_agency', 'insurance_agency', 'lawyer', 'accounting', 'moving_company',
  'post_office', 'police', 'school', 'university', 'corporate_office', 'storage',
])

/** Primary types that reliably photograph as scenery worth putting behind a trip. */
const SCENIC_TYPES = new Set([
  'tourist_attraction', 'historical_landmark', 'historical_place', 'monument', 'cultural_landmark',
  'museum', 'art_gallery', 'observation_deck', 'plaza', 'town_square',
  'park', 'national_park', 'state_park', 'garden', 'botanical_garden', 'wildlife_park', 'zoo', 'aquarium',
  'beach', 'hiking_area', 'natural_feature', 'scenic_point', 'scenic_lookout', 'marina', 'harbor',
  'church', 'mosque', 'synagogue', 'hindu_temple', 'place_of_worship', 'castle', 'palace', 'fort',
  'amusement_park', 'water_park', 'ski_resort', 'stadium', 'opera_house', 'concert_hall',
])

/** Prefer an explicit destination, falling back to the final ordered stop. */
export function selectTripPhotoStop<T extends TripPhotoStop>(stops: readonly T[]): T | null {
  const ordered = stops
    .filter((stop) => typeof stop.name === 'string' && stop.name.trim().length >= 2
      && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
      && stop.lat >= -90 && stop.lat <= 90 && stop.lng >= -180 && stop.lng <= 180)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  if (ordered.length === 0) return null
  return [...ordered].reverse().find((stop) => stop.stop_type === 'destination') ?? ordered.at(-1) ?? null
}

export function tripPhotoSearchParams(stop: TripPhotoStop): URLSearchParams {
  const name = stop.name!.trim()
  const address = stop.address?.trim() ?? ''
  const query = address
    ? (normalizeTitle(address).includes(normalizeTitle(name)) ? address : `${name}, ${address}`)
    : name

  return new URLSearchParams({
    q: query.slice(0, 120),
    category: 'all',
    lat: String(stop.lat),
    lng: String(stop.lng),
    radius: String(LANDMARK_RADIUS_METERS),
    limit: '8',
  })
}

/** Search specifically for recognizable scenery instead of the city's generic place record. */
export function tripLandmarkSearchParams(stop: TripPhotoStop): URLSearchParams {
  const name = stop.name!.trim()
  return new URLSearchParams({
    q: `${name} iconic landmark`.slice(0, 120),
    category: 'attractions',
    lat: String(stop.lat),
    lng: String(stop.lng),
    radius: String(LANDMARK_RADIUS_METERS),
    limit: '8',
  })
}

function placeNameMatchesStop(stopName: string, placeName: string): boolean {
  const stop = normalizeTitle(stopName)
  const place = normalizeTitle(placeName)
  return !!stop && stop === place
}

function isScenicType(primaryType: string | null | undefined): boolean {
  return !!primaryType && SCENIC_TYPES.has(primaryType)
}

/**
 * Google grows its type vocabulary constantly, so suffix families are matched
 * alongside the explicit list — `japanese_restaurant`, `pet_store` and friends
 * all belong to the same unphotogenic groups.
 */
function isUnphotogenicType(primaryType: string | null | undefined): boolean {
  if (!primaryType) return false
  if (UNPHOTOGENIC_TYPES.has(primaryType)) return true
  return /_(restaurant|store|shop|salon|agency|office|service|repair|parking|station)$/.test(primaryType)
}

/** Unknown review counts pass; a known count below the floor is a rejection. */
function isPopularEnough(candidate: TripPhotoCandidate): boolean {
  const ratings = candidate.userRatingCount
  if (typeof ratings !== 'number' || !Number.isFinite(ratings)) return true
  return ratings >= (isScenicType(candidate.primaryType) ? MIN_RATINGS_SCENIC : MIN_RATINGS_OTHER)
}

function hasUsablePhoto(candidate: TripPhotoCandidate): boolean {
  return typeof candidate.photoRef === 'string'
    && /^places\/[^/]+\/photos\/[^/]+$/.test(candidate.photoRef)
    && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)
}

/**
 * Ranks a usable candidate for a wide trip cover: recognisable subject first,
 * then how well known it is, then a landscape crop, minus a mild penalty for
 * drifting away from the stop the card is actually about.
 */
function coverScore(stop: Pick<TripPhotoStop, 'lat' | 'lng'>, candidate: TripPhotoCandidate): number {
  const ratings = Math.max(1, candidate.userRatingCount ?? 1)
  const landscape = (candidate.photoWidth ?? 0) >= (candidate.photoHeight ?? 0)
  return (isScenicType(candidate.primaryType) ? 40 : 0)
    + Math.min(30, Math.log10(ratings) * 6)
    + (landscape ? 10 : 0)
    - Math.min(20, distanceMeters(stop, candidate) / 2_000)
}

function toAutoPhoto(candidate: TripPhotoCandidate | undefined): TripAutoPhoto | null {
  return candidate?.photoRef ? {
    ref: candidate.photoRef,
    placeName: candidate.name,
    width: candidate.photoWidth,
    height: candidate.photoHeight,
  } : null
}

/**
 * Text Search uses a location bias, not a hard boundary. Require name and
 * distance, and drop places whose own photos are interiors or storefronts —
 * an exactly-named hotel or filling station is still a bad trip cover.
 */
export function selectNearbyTripPhoto(
  stop: Pick<TripPhotoStop, 'name' | 'lat' | 'lng'>,
  results: readonly TripPhotoCandidate[],
  maxDistanceMeters = LANDMARK_RADIUS_METERS,
): TripAutoPhoto | null {
  const eligible = results
    .filter((result) => hasUsablePhoto(result)
      && placeNameMatchesStop(stop.name ?? '', result.name)
      && !isUnphotogenicType(result.primaryType))
    .map((result) => ({ result, distance: distanceMeters(stop, result) }))
    .filter(({ distance }) => distance <= maxDistanceMeters)
    .sort((a, b) => a.distance - b.distance)

  return toAutoPhoto(eligible[0]?.result)
}

/**
 * Choose the best-photographing nearby landmark and explicitly reject the
 * generic city entity, whose photos are often anonymous aerial views. Results
 * are ranked rather than taken in provider order, because an `attractions`
 * text search still returns cafes, hotels and unnamed pins alongside the
 * landmark the card should be showing.
 */
export function selectIconicLandmarkPhoto(
  stop: Pick<TripPhotoStop, 'name' | 'lat' | 'lng'>,
  results: readonly TripPhotoCandidate[],
  maxDistanceMeters = LANDMARK_RADIUS_METERS,
): TripAutoPhoto | null {
  const ranked = results
    .filter((result) => hasUsablePhoto(result)
      && !placeNameMatchesStop(stop.name ?? '', result.name)
      && !isUnphotogenicType(result.primaryType)
      && isPopularEnough(result)
      && distanceMeters(stop, result) <= maxDistanceMeters)
    .sort((a, b) => coverScore(stop, b) - coverScore(stop, a))

  return toAutoPhoto(ranked[0])
}

/**
 * The whole cover decision for one stop, from a single `attractions` search:
 * a nearby landmark if one qualifies, otherwise the stop's own place record.
 * Returning null is a deliberate outcome — the seeded gradient tile beats a
 * photo of somewhere the traveller never went.
 */
export function selectTripCoverPhoto(
  stop: Pick<TripPhotoStop, 'name' | 'lat' | 'lng'>,
  results: readonly TripPhotoCandidate[],
): TripAutoPhoto | null {
  return selectIconicLandmarkPhoto(stop, results) ?? selectNearbyTripPhoto(stop, results)
}
