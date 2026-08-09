import assert from 'node:assert/strict'
import test from 'node:test'
import type { DiscoverPlace } from '../lib/discover/discover-places.generated.ts'
import type { DiscoverRoute } from '../lib/discover/discover-routes.generated.ts'
import {
  boundsContain,
  boundsForPlaces,
  filterDiscoverPlaces,
  filterDiscoverRoutes,
  hasCuratedCoverage,
  normalizeLongitude,
  placesToFeatureCollection,
  rankedSlice,
  routesToLineFeatureCollection,
  shouldRefitCamera,
  sliceByPage,
} from '../lib/discover/discover-query.ts'

function place(overrides: Partial<DiscoverPlace> & { id: string }): DiscoverPlace {
  return {
    name: overrides.id,
    countryCode: 'TR',
    region: null,
    lat: 0,
    lng: 0,
    categories: ['nature'],
    rank: 50,
    blurb: null,
    imageUrl: null,
    imageAttribution: null,
    suggestedHours: null,
    ...overrides,
  }
}

const FIXTURE: DiscoverPlace[] = [
  place({ id: 'tr-a', name: 'Ararat', lat: 39.7, lng: 44.3, categories: ['must_visit', 'nature'], rank: 85 }),
  place({ id: 'tr-b', name: 'Pamukkale', lat: 37.9, lng: 29.1, categories: ['nature'], rank: 76 }),
  place({ id: 'tr-c', name: 'Istanbul', lat: 41.0, lng: 28.9, categories: ['must_visit', 'cities'], rank: 100 }),
  place({ id: 'it-a', name: 'Etna', countryCode: 'IT', lat: 37.7, lng: 15.0, categories: ['nature'], rank: 80 }),
]

test('filtering scopes to one country and one category, ranked high to low', () => {
  const nature = filterDiscoverPlaces(FIXTURE, { countryCode: 'TR', categoryId: 'nature' })
  assert.deepEqual(nature.map((p) => p.id), ['tr-a', 'tr-b'])

  const all = filterDiscoverPlaces(FIXTURE, { countryCode: 'TR' })
  assert.deepEqual(all.map((p) => p.id), ['tr-c', 'tr-a', 'tr-b'])
})

test('an omitted or lowercase country code behaves sensibly rather than silently emptying the map', () => {
  assert.equal(filterDiscoverPlaces(FIXTURE, { countryCode: 'tr' }).length, 3)
  assert.equal(filterDiscoverPlaces(FIXTURE, { countryCode: '  ' }).length, 4)
  assert.equal(filterDiscoverPlaces(FIXTURE, {}).length, 4)
  assert.equal(filterDiscoverPlaces(FIXTURE, { countryCode: 'ZZ' }).length, 0)
})

test('equal ranks fall back to name order so the list never reshuffles between renders', () => {
  const tied = [place({ id: 'b', name: 'Beta', rank: 40 }), place({ id: 'a', name: 'Alpha', rank: 40 })]
  assert.deepEqual(filterDiscoverPlaces(tied, {}).map((p) => p.name), ['Alpha', 'Beta'])
})

test('longitudes normalise into [-180, 180)', () => {
  assert.equal(normalizeLongitude(181), -179)
  assert.equal(normalizeLongitude(-181), 179)
  assert.equal(normalizeLongitude(540), -180)
  assert.equal(normalizeLongitude(29.1), 29.1)
})

test('bounds containment works across the antimeridian', () => {
  const fiji = { west: 176, south: -19, east: -178, north: -16 }
  assert.ok(boundsContain(fiji, -17.8, 177.4))
  assert.ok(boundsContain(fiji, -17.8, -179.5))
  assert.equal(boundsContain(fiji, -17.8, 100), false)
  // Latitude is still a plain range, whatever the longitude does.
  assert.equal(boundsContain(fiji, -30, 177.4), false)

  const normal = { west: 25, south: 35, east: 45, north: 42 }
  assert.ok(boundsContain(normal, 39.7, 44.3))
  assert.equal(boundsContain(normal, 39.7, 46), false)
})

test('a bounding box over dateline-straddling places stays tight instead of wrapping the globe', () => {
  const fiji = [place({ id: 'a', lat: -17, lng: 177 }), place({ id: 'b', lat: -18, lng: -179 })]
  const bounds = boundsForPlaces(fiji)
  assert.ok(bounds)
  assert.equal(bounds.west, 177)
  assert.equal(bounds.east, -179)
  assert.equal(bounds.south, -18)
  assert.equal(bounds.north, -17)
  // Both members must land inside the box the camera will fit to.
  for (const p of fiji) assert.ok(boundsContain(bounds, p.lat, p.lng))
})

test('a bounding box over ordinary places is the plain min/max', () => {
  const bounds = boundsForPlaces(filterDiscoverPlaces(FIXTURE, { countryCode: 'TR' }))
  assert.deepEqual(bounds, { west: 28.9, south: 37.9, east: 44.3, north: 41 })
  assert.equal(boundsForPlaces([]), null)
})

test('the camera refits only when most results are off-screen', () => {
  const places = filterDiscoverPlaces(FIXTURE, { countryCode: 'TR' })
  const framed = { west: 25, south: 35, east: 45, north: 42 }
  assert.equal(shouldRefitCamera(places, framed), false)

  const elsewhere = { west: -10, south: 35, east: 5, north: 45 }
  assert.equal(shouldRefitCamera(places, elsewhere), true)

  // A viewport holding 1 of 3 places is below the 60 % threshold and must refit.
  const partial = { west: 28, south: 40, east: 30, north: 42 }
  assert.equal(shouldRefitCamera(places, partial), true)

  // No results is not a reason to move the camera; no viewport yet always fits.
  assert.equal(shouldRefitCamera([], framed), false)
  assert.equal(shouldRefitCamera(places, null), true)
})

test('rank capping and paging bound what the map and sheet render', () => {
  const places = filterDiscoverPlaces(FIXTURE, { countryCode: 'TR' })
  assert.deepEqual(rankedSlice(places, 2).map((p) => p.id), ['tr-c', 'tr-a'])
  assert.equal(rankedSlice(places, 0).length, 3)

  assert.deepEqual(sliceByPage(places, 0, 2).map((p) => p.id), ['tr-c', 'tr-a'])
  assert.deepEqual(sliceByPage(places, 1, 2).map((p) => p.id), ['tr-b'])
  assert.deepEqual(sliceByPage(places, 5, 2), [])
  assert.deepEqual(sliceByPage(places, -1, 2), [])
  assert.deepEqual(sliceByPage(places, 0, 0), [])
})

test('GeoJSON carries the slug in properties and a numeric feature id for clustering', () => {
  const collection = placesToFeatureCollection(filterDiscoverPlaces(FIXTURE, { countryCode: 'TR' }), 'must_visit')
  assert.equal(collection.type, 'FeatureCollection')
  assert.equal(collection.features.length, 3)

  const first = collection.features[0]
  assert.equal(first.id, 0)
  assert.deepEqual(first.geometry.coordinates, [28.9, 41.0])
  assert.deepEqual(first.properties, { id: 'tr-c', name: 'Istanbul', rank: 100, category: 'must_visit' })
  assert.deepEqual(collection.features.map((f) => f.id), [0, 1, 2])
})

test('curated coverage distinguishes an unmapped country from an empty category', () => {
  assert.ok(hasCuratedCoverage('TR', ['IT', 'TR']))
  assert.ok(hasCuratedCoverage(' it ', ['IT', 'TR']))
  assert.equal(hasCuratedCoverage('JP', ['IT', 'TR']), false)
  assert.equal(hasCuratedCoverage(null, ['IT', 'TR']), false)
})

function route(overrides: Partial<DiscoverRoute> & { id: string }): DiscoverRoute {
  return {
    name: overrides.id,
    country: 'Turkey',
    countryCode: 'TR',
    lat: 38.6,
    lng: 34.8,
    emoji: '🎈',
    tag: 'Hidden Gem',
    distance: '180 km',
    duration: '3–4 days',
    bestSeason: 'Apr – Jun',
    description: 'A test route.',
    highlights: [],
    waypoints: [
      { name: 'A', lat: 38.6, lng: 34.8 },
      { name: 'B', lat: 38.7, lng: 34.9 },
    ],
    ...overrides,
  }
}

const ROUTE_FIXTURE: DiscoverRoute[] = [
  route({ id: 'tr-b-route', name: 'Bravo Route' }),
  route({ id: 'tr-a-route', name: 'Alpha Route' }),
  route({ id: 'it-route', name: 'Italy Route', country: 'Italy', countryCode: 'IT' }),
]

test('filterDiscoverRoutes scopes to a country and orders alphabetically', () => {
  const tr = filterDiscoverRoutes(ROUTE_FIXTURE, 'TR')
  assert.deepEqual(tr.map((r) => r.id), ['tr-a-route', 'tr-b-route'])

  const all = filterDiscoverRoutes(ROUTE_FIXTURE, null)
  assert.deepEqual(all.map((r) => r.id), ['tr-a-route', 'tr-b-route', 'it-route'])
})

test('filterDiscoverRoutes is case-insensitive and tolerates blank input like filterDiscoverPlaces', () => {
  assert.equal(filterDiscoverRoutes(ROUTE_FIXTURE, 'tr').length, 2)
  assert.equal(filterDiscoverRoutes(ROUTE_FIXTURE, '  ').length, 3)
  assert.equal(filterDiscoverRoutes(ROUTE_FIXTURE, undefined).length, 3)
  assert.equal(filterDiscoverRoutes(ROUTE_FIXTURE, 'ZZ').length, 0)
})

test('routesToLineFeatureCollection produces one LineString per route, waypoints in order', () => {
  const routes = filterDiscoverRoutes(ROUTE_FIXTURE, 'TR')
  const collection = routesToLineFeatureCollection(routes)
  assert.equal(collection.type, 'FeatureCollection')
  assert.equal(collection.features.length, 2)

  const first = collection.features[0]
  assert.equal(first.id, 0)
  assert.equal(first.geometry.type, 'LineString')
  assert.deepEqual(first.geometry.coordinates, [[34.8, 38.6], [34.9, 38.7]])
  assert.deepEqual(first.properties, { id: 'tr-a-route', name: 'Alpha Route' })
})

test('routesToLineFeatureCollection over no routes is an empty FeatureCollection, not a throw', () => {
  assert.deepEqual(routesToLineFeatureCollection([]), { type: 'FeatureCollection', features: [] })
})

test('boundsForPlaces and shouldRefitCamera work over route waypoints too, not just DiscoverPlace', () => {
  const waypoints = ROUTE_FIXTURE[0].waypoints
  const bounds = boundsForPlaces(waypoints)
  assert.ok(bounds)
  assert.deepEqual(bounds, { west: 34.8, south: 38.6, east: 34.9, north: 38.7 })
  assert.equal(shouldRefitCamera(waypoints, null), true)
  assert.equal(shouldRefitCamera(waypoints, bounds), false)
})
