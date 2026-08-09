import assert from 'node:assert/strict'
import test from 'node:test'
import type { GooglePlaceSearchResult } from '../lib/google-places/types.ts'
import {
  isLiveDiscoverId,
  liveDiscoverId,
  liveQueryKey,
  mapGooglePlaceToDiscoverPlace,
  mergeLiveResultBatches,
  rawPlaceId,
} from '../lib/discover/discover-live.ts'

function result(overrides: Partial<GooglePlaceSearchResult> & { placeId: string }): GooglePlaceSearchResult {
  return {
    provider: 'google',
    name: overrides.placeId,
    formattedAddress: '1 Main St',
    primaryType: 'restaurant',
    primaryTypeLabel: 'Restaurant',
    lat: 41,
    lng: 29,
    rating: 4,
    userRatingCount: 120,
    businessStatus: 'OPERATIONAL',
    openNow: true,
    photoRef: null,
    photoWidth: null,
    photoHeight: null,
    ...overrides,
  }
}

test('a live discover id round-trips through the google: prefix', () => {
  const id = liveDiscoverId('ChIJ123')
  assert.equal(id, 'google:ChIJ123')
  assert.equal(isLiveDiscoverId(id), true)
  assert.equal(isLiveDiscoverId('tr-cappadocia'), false)
  assert.equal(rawPlaceId(id), 'ChIJ123')
  // A curated id never carried the prefix, so it passes through unchanged.
  assert.equal(rawPlaceId('tr-cappadocia'), 'tr-cappadocia')
})

test('a Google result maps into the curated DiscoverPlace shape the map/card/sheet already render', () => {
  const place = mapGooglePlaceToDiscoverPlace(result({ placeId: 'ChIJ123', rating: 4.5 }), 'food')
  assert.equal(place.id, 'google:ChIJ123')
  assert.equal(place.countryCode, '')
  assert.deepEqual(place.categories, ['food'])
  assert.equal(place.rank, 90)
  // §8.5: Google photos never appear on list cards, curated or live alike.
  assert.equal(place.imageUrl, null)
})

test('rank is clamped into 0-100 regardless of the rating signal', () => {
  assert.equal(mapGooglePlaceToDiscoverPlace(result({ placeId: 'a', rating: null }), 'food').rank, 0)
  assert.equal(mapGooglePlaceToDiscoverPlace(result({ placeId: 'b', rating: 5 }), 'food').rank, 100)
})

test('merging per-type batches (e.g. food -> restaurants + cafes) dedupes by placeId, keeping the first occurrence', () => {
  const restaurants = [result({ placeId: 'a', name: 'A' }), result({ placeId: 'shared', name: 'Shared (restaurant listing)' })]
  const cafes = [result({ placeId: 'shared', name: 'Shared (cafe listing)' }), result({ placeId: 'c', name: 'C' })]
  const merged = mergeLiveResultBatches([restaurants, cafes])
  assert.deepEqual(merged.map((entry) => entry.placeId), ['a', 'shared', 'c'])
  assert.equal(merged.find((entry) => entry.placeId === 'shared')?.name, 'Shared (restaurant listing)')
})

test('the live query key rounds coordinates to ~110m so a small pan reuses the session cache', () => {
  const a = liveQueryKey('food', { lat: 41.123449, lng: 29.0 })
  const b = liveQueryKey('food', { lat: 41.123451, lng: 29.0 })
  assert.equal(a, b)
  const farther = liveQueryKey('food', { lat: 41.2, lng: 29.0 })
  assert.notEqual(a, farther)
  // Different categories at the same spot must never collide in the cache.
  assert.notEqual(liveQueryKey('food', { lat: 41, lng: 29 }), liveQueryKey('museums', { lat: 41, lng: 29 }))
})
