import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addedPlaceIds,
  buildCreateTripPayload,
  buildCreateTripPayloadFromRoute,
  buildRouteStopsPayload,
  buildStopInsertPayload,
  editableTrips,
  findRouteDuplicate,
  type PlaceForRoute,
  type RouteForClone,
  type StopLike,
} from '../lib/discover/add-to-route.ts'

const PLACE: PlaceForRoute = { id: 'tr-cappadocia', name: 'Cappadocia', lat: 38.6431, lng: 34.8286 }
const POI_CATEGORY = { defaultStopNights: 0 as const }
const CITY_CATEGORY = { defaultStopNights: 1 as const }

test('first stop for a trip is the origin at order_index 0', () => {
  const payload = buildStopInsertPayload(PLACE, POI_CATEGORY, 'trip-1', 0, 'user-1')
  assert.equal(payload.order_index, 0)
  assert.equal(payload.stop_type, 'origin')
  assert.equal(payload.nights, 0)
  assert.deepEqual(payload, {
    trip_id: 'trip-1',
    name: 'Cappadocia',
    lat: 38.6431,
    lng: 34.8286,
    address: null,
    order_index: 0,
    stop_type: 'origin',
    nights: 0,
    created_by: 'user-1',
  })
})

test('Nth stop for a trip is a destination appended at the end', () => {
  const payload = buildStopInsertPayload(PLACE, POI_CATEGORY, 'trip-1', 3, 'user-1')
  assert.equal(payload.order_index, 3)
  assert.equal(payload.stop_type, 'destination')
})

test('nights comes from the category, not a hardcoded default', () => {
  assert.equal(buildStopInsertPayload(PLACE, POI_CATEGORY, 'trip-1', 1, 'user-1').nights, 0)
  assert.equal(buildStopInsertPayload(PLACE, CITY_CATEGORY, 'trip-1', 1, 'user-1').nights, 1)
})

test('editableTrips drops viewer-role trips', () => {
  const trips = [
    { id: 'a', role: 'owner' },
    { id: 'b', role: 'viewer' },
    { id: 'c', role: 'editor' },
  ]
  assert.deepEqual(editableTrips(trips).map((t) => t.id), ['a', 'c'])
})

test('editableTrips returns empty for an all-viewer list', () => {
  assert.deepEqual(editableTrips([{ id: 'a', role: 'viewer' }]), [])
})

test('findRouteDuplicate matches on name and close distance', () => {
  const stops: StopLike[] = [{ id: 'stop-1', name: 'Cappadocia', lat: 38.6432, lng: 34.8287 }]
  const match = findRouteDuplicate(PLACE, stops)
  assert.ok(match)
  assert.equal(match?.kind, 'stop')
  assert.equal(match?.reason, 'name_and_distance')
})

test('findRouteDuplicate does not match a same-named place far away', () => {
  const stops: StopLike[] = [{ id: 'stop-1', name: 'Cappadocia', lat: 10, lng: 10 }]
  assert.equal(findRouteDuplicate(PLACE, stops), null)
})

test('findRouteDuplicate does not match an unrelated place', () => {
  const stops: StopLike[] = [{ id: 'stop-1', name: 'Pamukkale', lat: 37.9, lng: 29.1 }]
  assert.equal(findRouteDuplicate(PLACE, stops), null)
})

test('addedPlaceIds is empty when the trip has no stops', () => {
  assert.deepEqual(addedPlaceIds([PLACE], []), new Set())
})

test('addedPlaceIds marks only places already on the route', () => {
  const other: PlaceForRoute = { id: 'tr-pamukkale', name: 'Pamukkale', lat: 37.9, lng: 29.1 }
  const stops: StopLike[] = [{ id: 'stop-1', name: 'Cappadocia', lat: 38.6431, lng: 34.8286 }]
  const added = addedPlaceIds([PLACE, other], stops)
  assert.deepEqual([...added], ['tr-cappadocia'])
})

test('buildCreateTripPayload sends an explicit nights: 0 for a day-stop category', () => {
  const payload = buildCreateTripPayload(PLACE, POI_CATEGORY, { name: 'Turkey', flag: '🇹🇷' })
  assert.equal(payload.p_stops[0].nights, 0)
  assert.equal(payload.p_stops[0].stop_type, 'origin')
  assert.equal(payload.p_countries[0].flag, '🇹🇷')
  assert.equal(payload.p_focus_lat, PLACE.lat)
})

test('buildCreateTripPayload omits nights for a city, relying on the RPC default of one night', () => {
  const payload = buildCreateTripPayload(PLACE, CITY_CATEGORY, { name: 'Turkey' })
  assert.equal('nights' in payload.p_stops[0], false)
  assert.equal(payload.p_countries[0].flag, null)
})

const ROUTE: RouteForClone = {
  name: 'Cappadocia Loop',
  country: 'Turkey',
  emoji: '🎈',
  description: 'Fairy chimneys and hot-air balloons.',
  waypoints: [
    { name: 'Nevşehir', lat: 38.624, lng: 34.715 },
    { name: 'Göreme', lat: 38.644, lng: 34.829 },
    { name: 'Ürgüp', lat: 38.628, lng: 34.911 },
  ],
}

test('buildCreateTripPayloadFromRoute mirrors the retired handleUseRoute call: no nights key at all', () => {
  const payload = buildCreateTripPayloadFromRoute(ROUTE)
  assert.equal(payload.p_title, 'Cappadocia Loop')
  assert.equal(payload.p_stops.length, 3)
  for (const stop of payload.p_stops) assert.equal('nights' in stop, false)
  assert.equal(payload.p_stops[0].stop_type, 'origin')
  assert.equal(payload.p_stops[1].stop_type, 'destination')
  assert.equal(payload.p_stops[2].stop_type, 'destination')
  assert.deepEqual(payload.p_stops.map((s) => s.order_index), [0, 1, 2])
  // The odd-but-deliberate legacy substitution: a route has no country flag
  // of its own, so its own emoji fills that slot.
  assert.equal(payload.p_countries[0].flag, '🎈')
  assert.equal(payload.p_focus_lat, ROUTE.waypoints[0].lat)
  assert.equal(payload.p_focus_lng, ROUTE.waypoints[0].lng)
})

test('buildRouteStopsPayload appends every waypoint as a destination when the trip already has stops', () => {
  const payload = buildRouteStopsPayload(ROUTE, 'trip-1', 2, 'user-1')
  assert.equal(payload.length, 3)
  assert.deepEqual(payload.map((s) => s.order_index), [2, 3, 4])
  for (const stop of payload) {
    assert.equal(stop.stop_type, 'destination')
    // Unlike a direct handleAddStop-style insert, nights must be explicit here:
    // the stops table's own column default is 0, not the RPC's 1.
    assert.equal(stop.nights, 1)
    assert.equal(stop.trip_id, 'trip-1')
    assert.equal(stop.created_by, 'user-1')
  }
})

test('buildRouteStopsPayload makes the first waypoint the origin only when the trip has zero stops', () => {
  const empty = buildRouteStopsPayload(ROUTE, 'trip-1', 0, 'user-1')
  assert.equal(empty[0].stop_type, 'origin')
  assert.equal(empty[1].stop_type, 'destination')

  const nonEmpty = buildRouteStopsPayload(ROUTE, 'trip-1', 1, 'user-1')
  assert.equal(nonEmpty[0].stop_type, 'destination')
})
