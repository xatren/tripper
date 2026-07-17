import assert from 'node:assert/strict'
import test from 'node:test'
import {
  categoryFromMapboxCategory,
  distanceMeters,
  findDuplicate,
  formatDurationMinutes,
  normalizeTitle,
  type DuplicateSource,
} from '../app/trip/[id]/mobile/explore/explore-logic.ts'

test('normalizeTitle lowercases, strips accents and punctuation, collapses whitespace', () => {
  assert.equal(normalizeTitle('Café  du   Monde!'), 'cafe du monde')
  assert.equal(normalizeTitle('  Ürgüp Kalesi   '), 'urgup kalesi')
  assert.equal(normalizeTitle(''), '')
})

test('distanceMeters returns 0 for identical points and grows with separation', () => {
  const a = { lat: 41.0082, lng: 28.9784 }
  assert.equal(distanceMeters(a, a), 0)
  // Istanbul -> Ankara is roughly 350km.
  const ankara = { lat: 39.9334, lng: 32.8597 }
  const km = distanceMeters(a, ankara) / 1000
  assert.ok(km > 300 && km < 400, `expected ~350km, got ${km}`)
})

function source(overrides: Partial<DuplicateSource> & { id: string }): DuplicateSource {
  return { title: 'Sample Place', lat: 41.0, lng: 29.0, ...overrides }
}

test('findDuplicate does not match a same-named chain location far away', () => {
  const stops: DuplicateSource[] = [source({ id: 's1', title: 'Café du Monde', lat: 10, lng: 10 })]
  const match = findDuplicate({ title: 'cafe du monde', lat: 41.0, lng: 29.0 }, stops, [])
  assert.equal(match, null)
})

test('findDuplicate does not match a neighboring venue with a different name', () => {
  const items: DuplicateSource[] = [source({ id: 'i1', title: 'Totally Different Name', lat: 41.00001, lng: 29.00001 })]
  const match = findDuplicate({ title: 'Something Else', lat: 41.0, lng: 29.0 }, [], items)
  assert.equal(match, null)
})

test('findDuplicate matches normalized name and nearby coordinates together', () => {
  const items: DuplicateSource[] = [source({ id: 'i1', title: 'Café du Monde', lat: 41.00001, lng: 29.00001 })]
  const match = findDuplicate({ title: 'cafe du monde', lat: 41.0, lng: 29.0 }, [], items)
  assert.ok(match)
  assert.equal(match?.source, 'item')
  assert.equal(match?.reason, 'name_and_distance')
})

test('findDuplicate prefers an available provider id', () => {
  const items: DuplicateSource[] = [source({ id: 'i1', providerId: 'poi.123', title: 'Old Name', lat: 10, lng: 10 })]
  const match = findDuplicate({ providerId: 'poi.123', title: 'New Name', lat: 41, lng: 29 }, [], items)
  assert.ok(match)
  assert.equal(match?.reason, 'provider_id')
})

test('findDuplicate returns null when nothing matches', () => {
  const stops: DuplicateSource[] = [source({ id: 's1', title: 'Somewhere Else', lat: -10, lng: -10 })]
  const items: DuplicateSource[] = [source({ id: 'i1', title: 'Also Elsewhere', lat: 20, lng: 20 })]
  const match = findDuplicate({ title: 'New Place', lat: 41.0, lng: 29.0 }, stops, items)
  assert.equal(match, null)
})

test('findDuplicate ignores rows with no coordinates when only titles match', () => {
  const stops: DuplicateSource[] = [source({ id: 's1', title: 'New Place', lat: null, lng: null })]
  const match = findDuplicate({ title: 'new place', lat: 41.0, lng: 29.0 }, stops, [])
  assert.equal(match, null)
})

test('categoryFromMapboxCategory maps known keywords and falls back otherwise', () => {
  assert.equal(categoryFromMapboxCategory('italian restaurant, food', 'place'), 'restaurant')
  assert.equal(categoryFromMapboxCategory('hotel, lodging', 'place'), 'stay')
  assert.equal(categoryFromMapboxCategory('museum', 'place'), 'activity')
  assert.equal(categoryFromMapboxCategory(undefined, 'activity'), 'activity')
  assert.equal(categoryFromMapboxCategory('some unknown category', 'place'), 'place')
})

test('formatDurationMinutes formats hours/minutes and treats 0 as flexible', () => {
  assert.equal(formatDurationMinutes(0), 'Flexible')
  assert.equal(formatDurationMinutes(45), '45m')
  assert.equal(formatDurationMinutes(60), '1h')
  assert.equal(formatDurationMinutes(90), '1h 30m')
})
