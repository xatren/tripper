import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  distanceMeters,
  findPlaceDuplicate,
  formatDurationMinutes,
  isValidCoordinate,
  normalizeQuery,
  safeHttpUrl,
  safeHttpsUrl,
  safeTelUrl,
  tripDayOptions,
  type DuplicateSource,
} from '../lib/google-places/pure.ts'
import { googleTypeToItineraryType } from '../lib/google-places/category-map.ts'
import { AUTOCOMPLETE_FIELD_MASK, SEARCH_FIELD_MASK, detailFieldMask, fieldMasksAreProductionSafe } from '../lib/google-places/field-masks.ts'
import { normalizeDetailResponse, normalizeSearchResponse } from '../lib/google-places/schemas.ts'
import { mapUpstreamStatus } from '../lib/google-places/errors.ts'
import { validatePlaceId, validateSearchParams } from '../lib/google-places/validation.ts'

test('query and coordinate validation helpers reject unsafe inputs', () => {
  assert.equal(normalizeQuery('  cafes   in İzmir '), 'cafes in İzmir')
  assert.equal(isValidCoordinate({ lat: 90, lng: -180 }), true)
  assert.equal(isValidCoordinate({ lat: 91, lng: 0 }), false)
  assert.equal(isValidCoordinate({ lat: 0, lng: Number.NaN }), false)
})

test('Google primary type maps to an itinerary type', () => {
  assert.equal(googleTypeToItineraryType('restaurant'), 'restaurant')
  assert.equal(googleTypeToItineraryType('coffee_shop'), 'restaurant')
  assert.equal(googleTypeToItineraryType('hotel'), 'stay')
  assert.equal(googleTypeToItineraryType('museum'), 'activity')
  assert.equal(googleTypeToItineraryType('airport'), 'flight')
  assert.equal(googleTypeToItineraryType('transit_station'), 'transport')
  assert.equal(googleTypeToItineraryType(null), 'place')
})

test('URL allowlists permit only intended protocols', () => {
  assert.equal(safeHttpUrl('https://example.com/a'), 'https://example.com/a')
  assert.equal(safeHttpUrl('//maps.google.com/a'), 'https://maps.google.com/a')
  assert.equal(safeHttpUrl('javascript:alert(1)'), null)
  assert.equal(safeHttpsUrl('http://example.com'), null)
  assert.equal(safeTelUrl('+1 (415) 555-0100'), 'tel:+14155550100')
})

function source(overrides: Partial<DuplicateSource> & Pick<DuplicateSource, 'id'>): DuplicateSource {
  return { id: overrides.id, kind: 'item', provider: null, externalId: null, title: 'Café du Monde', localDate: null, lat: 41, lng: 29, ...overrides }
}

test('duplicates prefer matching Google Place ID', () => {
  const match = findPlaceDuplicate({ provider: 'google', externalId: 'ChIJ123', title: 'Renamed', lat: 0, lng: 0 }, [source({ id: 'i1', provider: 'google', externalId: 'ChIJ123', lat: 50, lng: 50 })])
  assert.equal(match?.reason, 'provider_id')
})

test('duplicate fallback requires both normalized name and nearby coordinates', () => {
  const near = findPlaceDuplicate({ provider: 'google', externalId: null, title: 'cafe du monde', lat: 41.00001, lng: 29.00001 }, [source({ id: 'i1' })])
  assert.equal(near?.reason, 'name_and_distance')
  const far = findPlaceDuplicate({ provider: 'google', externalId: null, title: 'cafe du monde', lat: 10, lng: 10 }, [source({ id: 'i1' })])
  assert.equal(far, null)
  const neighbor = findPlaceDuplicate({ provider: 'google', externalId: null, title: 'Different Venue', lat: 41.00001, lng: 29.00001 }, [source({ id: 'i1' })])
  assert.equal(neighbor, null)
  assert.ok(distanceMeters({ lat: 41, lng: 29 }, { lat: 41.00001, lng: 29.00001 }) < 75)
})

test('duration and dated/unscheduled day helpers are stable', () => {
  assert.equal(formatDurationMinutes(90), '1h 30m')
  assert.equal(formatDurationMinutes(0), 'Flexible')
  assert.deepEqual(tripDayOptions('2026-07-16', '2026-07-18').map((day) => day.value), ['2026-07-16', '2026-07-17', '2026-07-18'])
  assert.deepEqual(tripDayOptions(null, null), [])
})

test('all production field masks are explicit and reviews are feature-selective', () => {
  assert.equal(fieldMasksAreProductionSafe(), true)
  assert.equal([SEARCH_FIELD_MASK, AUTOCOMPLETE_FIELD_MASK, detailFieldMask(true)].some((mask) => mask.includes('*')), false)
  assert.equal(detailFieldMask(false).includes('reviews'), false)
  assert.equal(detailFieldMask(true).split(',').includes('reviews'), true)
  assert.equal(SEARCH_FIELD_MASK.includes('rating'), false)
})

test('provider search/detail responses are normalized to the client allowlist', () => {
  const raw = { places: [{
    id: 'ChIJ123', displayName: { text: 'Museum' }, formattedAddress: '1 Main St',
    primaryType: 'museum', primaryTypeDisplayName: { text: 'Museum' }, location: { latitude: 41, longitude: 29 },
    secretInternalField: 'must not escape', photos: [{ name: 'places/ChIJ123/photos/photo1', widthPx: 800, heightPx: 600, authorAttributions: [] }],
  }] }
  const search = normalizeSearchResponse(raw)
  assert.equal(search.length, 1)
  assert.equal(search[0].placeId, 'ChIJ123')
  assert.equal('secretInternalField' in search[0], false)
  const detail = normalizeDetailResponse({ ...raw.places[0], rating: 4.7, userRatingCount: 123, currentOpeningHours: { openNow: true, weekdayDescriptions: ['Monday: 9–5'] }, websiteUri: 'javascript:bad' })
  assert.equal(detail?.rating, 4.7)
  assert.equal(detail?.openNow, true)
  assert.equal(detail?.websiteUri, null)
})

test('route validation rejects bad coordinates, place IDs, and client field masks', () => {
  assert.throws(() => validateSearchParams(new URLSearchParams({ q: 'x' })))
  assert.throws(() => validateSearchParams(new URLSearchParams({ q: 'museum', lat: '91', lng: '0' })))
  assert.throws(() => validateSearchParams(new URLSearchParams({ q: 'museum', fieldMask: '*' })))
  assert.throws(() => validatePlaceId('../secret'))
  const valid = validateSearchParams(new URLSearchParams({ q: ' museum  in  Paris ', category: 'museums', limit: '10' }))
  assert.equal(valid.query, 'museum in Paris')
})

test('Google upstream statuses map without leaking provider error bodies', () => {
  assert.equal(mapUpstreamStatus(403).code, 'configuration')
  assert.equal(mapUpstreamStatus(429).code, 'quota_exceeded')
  assert.equal(mapUpstreamStatus(503).code, 'provider_unavailable')
})

test('static security contract keeps the server key and provider payload out of clients and DB JSONB', () => {
  const client = readFileSync(new URL('../components/explore/GooglePlacesExplorer.tsx', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../lib/google-places/client.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260716220137_add_itinerary_place_identity.sql', import.meta.url), 'utf8')
  assert.equal(client.includes('GOOGLE_PLACES_API_KEY'), false)
  assert.equal(client.includes('NEXT_PUBLIC_GOOGLE_PLACES_API_KEY'), false)
  assert.equal(server.includes('process.env.GOOGLE_PLACES_API_KEY'), true)
  assert.equal(/add\s+column[^;]*jsonb/i.test(migration), false)
  assert.equal(migration.includes('itinerary_items_trip_external_place_idx'), true)
})

test('Discover live-layer search (Phase 5) builds params validateSearchParams already accepts', () => {
  // Mirrors the exact param shape DiscoverClient.searchThisArea sends for a
  // single placesCategory of a live layer (food/museums/stays) — no new
  // validation surface, no new endpoint.
  const valid = validateSearchParams(new URLSearchParams({ category: 'restaurants', limit: '12', radius: '50000', lat: '41', lng: '29' }))
  assert.equal(valid.category, 'restaurants')
  assert.deepEqual(valid.location, { lat: 41, lng: 29 })
  assert.equal(valid.radiusMeters, 50_000)
  assert.equal(valid.limit, 12)
})

test('the second map SDK (GoogleExploreMap) is fully removed per Phase 5', () => {
  assert.throws(() => readFileSync(new URL('../components/explore/GoogleExploreMap.tsx', import.meta.url), 'utf8'))
  const client = readFileSync(new URL('../components/explore/GooglePlacesExplorer.tsx', import.meta.url), 'utf8')
  assert.equal(client.includes('GoogleExploreMap'), false)
})

test('every Places proxy route requires Supabase auth and returns no server credential', () => {
  const routes = [
    '../app/api/places/search/route.ts',
    '../app/api/places/autocomplete/route.ts',
    '../app/api/places/details/[placeId]/route.ts',
    '../app/api/places/photo/route.ts',
  ]
  for (const route of routes) {
    const sourceText = readFileSync(new URL(route, import.meta.url), 'utf8')
    assert.equal(sourceText.includes('requirePlacesUser(request)'), true, `${route} must authenticate`)
    assert.equal(sourceText.includes('GOOGLE_PLACES_API_KEY'), false, `${route} must not expose the key`)
    assert.equal(sourceText.includes('Cache-Control'), true, `${route} must set explicit cache policy`)
  }
})
