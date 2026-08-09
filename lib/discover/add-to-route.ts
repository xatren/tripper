// Pure "Add to Route" logic for Discover (Phase 4). Deliberately alias-free
// (`../` imports only) so tests/discover-add-to-route.test.mts can load it
// under `node --experimental-strip-types`, per the repo's pure-logic test
// convention. Curated-only for v1 (§9.2/§18.1): Google Places results have no
// independent coordinates and cannot become a stop, so this module only ever
// sees `DiscoverPlace` (curated, Wikidata/OSM-derived lat/lng).

import { findPlaceDuplicate, type DuplicateMatch, type DuplicateSource } from '../google-places/pure.ts'
import type { DiscoverCategory } from './categories.ts'
import type { DiscoverPlace } from './discover-places.generated.ts'
import type { DiscoverRoute } from './discover-routes.generated.ts'

export type PlaceForRoute = Pick<DiscoverPlace, 'id' | 'name' | 'lat' | 'lng'>
export type CategoryForRoute = Pick<DiscoverCategory, 'defaultStopNights'>

export interface StopLike {
  id: string
  name: string
  lat: number
  lng: number
}

export interface EditableTripCandidate {
  id: string
  role: string
}

export interface StopInsertPayload {
  trip_id: string
  name: string
  lat: number
  lng: number
  address: null
  order_index: number
  stop_type: 'origin' | 'destination'
  nights: 0 | 1
  created_by: string
}

/**
 * Mirrors `PlanRouteDomain.handleAddStop`'s payload shape exactly (§9.1), plus
 * an explicit `nights` handleAddStop doesn't set — a Plan-added stop has no
 * category to read it from, but a Discover place does, and a wrong default
 * silently lengthens the trip (`20260808120000_stop_overnight_semantics.sql`).
 */
export function buildStopInsertPayload(
  place: PlaceForRoute,
  category: CategoryForRoute,
  tripId: string,
  existingStopCount: number,
  createdBy: string,
): StopInsertPayload {
  return {
    trip_id: tripId,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    address: null,
    order_index: existingStopCount,
    stop_type: existingStopCount === 0 ? 'origin' : 'destination',
    nights: category.defaultStopNights,
    created_by: createdBy,
  }
}

/** Owners and editors can add stops; viewers cannot (`tripCapabilitiesForRole`). */
export function editableTrips<T extends EditableTripCandidate>(trips: readonly T[]): T[] {
  return trips.filter((trip) => trip.role !== 'viewer')
}

/**
 * Curated stops carry no provider id, so the only signal is name plus
 * distance — the same `findPlaceDuplicate` fallback path Explore's Google
 * Places flow uses against `stops` (§9.3 "Duplicate").
 */
export function findRouteDuplicate(place: PlaceForRoute, stops: readonly StopLike[]): DuplicateMatch | null {
  const sources: DuplicateSource[] = stops.map((stop) => ({
    id: stop.id,
    kind: 'stop',
    provider: null,
    externalId: null,
    title: stop.name,
    localDate: null,
    lat: stop.lat,
    lng: stop.lng,
  }))
  return findPlaceDuplicate({ provider: null, externalId: null, title: place.name, lat: place.lat, lng: place.lng }, sources)
}

/** The "already added" set (§10.2) — derived fresh each render, never stored. */
export function addedPlaceIds(places: readonly PlaceForRoute[], stops: readonly StopLike[]): Set<string> {
  const added = new Set<string>()
  if (stops.length === 0) return added
  for (const place of places) {
    if (findRouteDuplicate(place, stops)) added.add(place.id)
  }
  return added
}

export interface CreateTripCountry {
  name: string
  flag?: string | null
}

export interface CreateTripFromPlacePayload {
  p_title: string
  p_description: string | null
  p_total_budget: number
  p_vibe: string
  p_countries: { name: string; flag: string | null; lat: number; lng: number }[]
  p_focus_lat: number
  p_focus_lng: number
  p_stops: Array<{ name: string; lat: number; lng: number; order_index: 0; stop_type: 'origin'; nights?: 0 }>
}

/**
 * The "Start a trip here" payload (§9.3), mirroring `ExploreClient.handleUseRoute`'s
 * `create_trip_with_stops` call. The RPC treats an omitted `nights` as one
 * night, so a day-stop category (`defaultStopNights: 0`) must say `nights: 0`
 * explicitly rather than relying on the default; a city/stay omits it.
 */
export function buildCreateTripPayload(
  place: PlaceForRoute,
  category: CategoryForRoute,
  country: CreateTripCountry,
): CreateTripFromPlacePayload {
  const stop: CreateTripFromPlacePayload['p_stops'][number] = {
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    order_index: 0,
    stop_type: 'origin',
  }
  if (category.defaultStopNights === 0) stop.nights = 0

  return {
    p_title: place.name,
    p_description: null,
    p_total_budget: 0,
    p_vibe: 'Road',
    p_countries: [{ name: country.name, flag: country.flag ?? null, lat: place.lat, lng: place.lng }],
    p_focus_lat: place.lat,
    p_focus_lng: place.lng,
    p_stops: [stop],
  }
}

// --- Phase 7: routes (Tier C) ---------------------------------------------
//
// §18 open question #12, resolved: "Use This Route" offers **both** a new
// trip (primary, unconditional) and "Add to my trip" (secondary, only when
// an editable active trip exists) — appending every waypoint as sequential
// stops mirrors exactly what a single-place "Add to Route" already does
// (§9.1 "Discover appends; Plan arranges"), so a whole route is not a
// special case, just several appends in one insert. A route is never
// eligible for the multi-trip picker `AddToRouteButton` shows for a single
// place (§9.3) — with 4-6 waypoints per route, asking which of several
// trips to dump them all into is a Plan-screen decision, not a Discover one;
// the active trip (the same one Map Home features) is the only target.

export type RouteWaypointForClone = Pick<DiscoverRoute['waypoints'][number], 'name' | 'lat' | 'lng'>
export type RouteForClone = Pick<DiscoverRoute, 'name' | 'country' | 'emoji' | 'description' | 'waypoints'>

export interface CreateTripFromRoutePayload {
  p_title: string
  p_description: string | null
  p_total_budget: number
  p_vibe: string
  p_countries: { name: string; flag: string | null; lat: number; lng: number }[]
  p_focus_lat: number
  p_focus_lng: number
  p_stops: Array<{ name: string; lat: number; lng: number; order_index: number; stop_type: 'origin' | 'destination' }>
}

/**
 * The "Use This Route" → new-trip payload, ported verbatim from the retired
 * `ExploreClient.handleUseRoute`'s `create_trip_with_stops` call: no `nights`
 * key on any stop, relying on the RPC's own default of one night per omitted
 * stop (`20260808120000_stop_overnight_semantics.sql`) rather than restating
 * that contract here. `flag: route.emoji` is the same odd-but-deliberate
 * substitution the legacy code made — a route template has no country flag
 * of its own, only its own emoji.
 */
export function buildCreateTripPayloadFromRoute(route: RouteForClone): CreateTripFromRoutePayload {
  const firstWaypoint = route.waypoints[0]
  return {
    p_title: route.name,
    p_description: route.description,
    p_total_budget: 0,
    p_vibe: 'Road',
    p_countries: [{ name: route.country, flag: route.emoji, lat: firstWaypoint?.lat ?? 0, lng: firstWaypoint?.lng ?? 0 }],
    p_focus_lat: firstWaypoint?.lat ?? 0,
    p_focus_lng: firstWaypoint?.lng ?? 0,
    p_stops: route.waypoints.map((waypoint, index) => ({
      name: waypoint.name,
      lat: waypoint.lat,
      lng: waypoint.lng,
      order_index: index,
      stop_type: index === 0 ? 'origin' : 'destination',
    })),
  }
}

export interface RouteStopInsertPayload {
  trip_id: string
  name: string
  lat: number
  lng: number
  address: null
  order_index: number
  stop_type: 'origin' | 'destination'
  nights: 1
  created_by: string
}

/**
 * "Add to my trip" — appends every waypoint as a sequential stop on an
 * existing trip via a direct `stops` insert, not the RPC. Unlike
 * `buildCreateTripPayloadFromRoute`, `nights` must be explicit here: the
 * `stops` table's own column default is `0` (day stop), not the RPC's `1`
 * (`20260808120000_stop_overnight_semantics.sql`), so relying on omission
 * would silently turn every appended waypoint into a day stop instead of
 * matching what "Use This Route" would have created.
 */
export function buildRouteStopsPayload(
  route: Pick<RouteForClone, 'waypoints'>,
  tripId: string,
  existingStopCount: number,
  createdBy: string,
): RouteStopInsertPayload[] {
  return route.waypoints.map((waypoint, index) => ({
    trip_id: tripId,
    name: waypoint.name,
    lat: waypoint.lat,
    lng: waypoint.lng,
    address: null,
    order_index: existingStopCount + index,
    stop_type: existingStopCount === 0 && index === 0 ? 'origin' : 'destination',
    nights: 1,
    created_by: createdBy,
  }))
}
