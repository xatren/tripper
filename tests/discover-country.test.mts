import assert from 'node:assert/strict'
import test from 'node:test'
import { getCountryOptions } from '../lib/trip-country-selection.ts'
import {
  countryByCode,
  firstTripCountry,
  preferStoredCountry,
  resolveDiscoverCountry,
  type DiscoverTripCandidate,
} from '../lib/discover/discover-country.ts'

const options = getCountryOptions('en')
const TODAY = '2026-08-08'

function trip(overrides: Partial<DiscoverTripCandidate> & { id: string }): DiscoverTripCandidate {
  return { updated_at: '2026-01-01T00:00:00Z', ...overrides }
}

test('an explicit country param outranks every trip-derived guess', () => {
  const trips = [trip({ id: 'a', start_date: TODAY, end_date: TODAY, countries: [{ code: 'JP', name: 'Japan' }] })]
  const resolved = resolveDiscoverCountry({ requestedCode: 'tr', trips, options, todayISO: TODAY })
  assert.equal(resolved.country?.code, 'TR')
  assert.equal(resolved.source, 'param')
})

test('an unusable country param falls through instead of stranding the user', () => {
  const trips = [trip({ id: 'a', start_date: TODAY, end_date: TODAY, countries: [{ code: 'JP', name: 'Japan' }] })]
  for (const requestedCode of ['ZZ', 'Türkiye', '', null]) {
    const resolved = resolveDiscoverCountry({ requestedCode, trips, options, todayISO: TODAY })
    assert.equal(resolved.country?.code, 'JP', `expected fallthrough for ${JSON.stringify(requestedCode)}`)
    assert.equal(resolved.source, 'featured-trip')
  }
})

test('the featured (active) trip wins over a more recently updated one', () => {
  const trips = [
    trip({ id: 'recent', updated_at: '2026-08-07T00:00:00Z', countries: [{ code: 'PT', name: 'Portugal' }] }),
    trip({ id: 'active', updated_at: '2026-01-01T00:00:00Z', start_date: '2026-08-01', end_date: '2026-08-20', countries: [{ code: 'GR', name: 'Greece' }] }),
  ]
  const resolved = resolveDiscoverCountry({ trips, options, todayISO: TODAY })
  assert.equal(resolved.country?.code, 'GR')
  assert.equal(resolved.source, 'featured-trip')
})

test('a featured trip with no usable country hands off to the newest trip that has one', () => {
  const trips = [
    trip({ id: 'featured', updated_at: '2026-02-01T00:00:00Z', start_date: '2026-08-01', end_date: '2026-08-20', countries: [] }),
    trip({ id: 'older', updated_at: '2026-03-01T00:00:00Z', countries: [{ code: 'IT', name: 'Italy' }] }),
    trip({ id: 'newer', updated_at: '2026-07-01T00:00:00Z', countries: [{ code: 'ES', name: 'Spain' }] }),
  ]
  const resolved = resolveDiscoverCountry({ trips, options, todayISO: TODAY })
  assert.equal(resolved.country?.code, 'ES')
  assert.equal(resolved.source, 'recent-trip')
})

test('no trips and no param resolves to the world view rather than a guess', () => {
  const resolved = resolveDiscoverCountry({ trips: [], options, todayISO: TODAY })
  assert.equal(resolved.country, null)
  assert.equal(resolved.source, 'none')
})

test('legacy trip countries without a code are recovered from their stored name', () => {
  const legacy = trip({ id: 'legacy', countries: [{ name: 'Turkey' }] })
  assert.equal(firstTripCountry(legacy, options)?.code, 'TR')

  const unresolvable = trip({ id: 'x', countries: [{ name: 'Atlantis' }, { name: 'United Kingdom' }] })
  assert.equal(firstTripCountry(unresolvable, options)?.code, 'GB')
})

test('trip countries are ordered by selectionOrder, not array position', () => {
  const multi = trip({
    id: 'multi',
    countries: [
      { code: 'FR', name: 'France', selectionOrder: 1 },
      { code: 'DE', name: 'Germany', selectionOrder: 0 },
    ],
  })
  assert.equal(firstTripCountry(multi, options)?.code, 'DE')
})

test('a stored country overrides a trip guess but never an explicit deep link', () => {
  const guess = resolveDiscoverCountry({ trips: [trip({ id: 'a', countries: [{ code: 'IT', name: 'Italy' }] })], options, todayISO: TODAY })
  assert.equal(preferStoredCountry(guess, 'NO', options).country?.code, 'NO')
  assert.equal(preferStoredCountry(guess, 'NO', options).source, 'stored')

  const deepLink = resolveDiscoverCountry({ requestedCode: 'TR', trips: [], options, todayISO: TODAY })
  assert.equal(preferStoredCountry(deepLink, 'NO', options).country?.code, 'TR')

  // A junk or absent stored value must leave the resolution untouched.
  assert.deepEqual(preferStoredCountry(guess, 'zzz', options), guess)
  assert.deepEqual(preferStoredCountry(guess, null, options), guess)
})

test('country lookup by code is case-insensitive and rejects non-alpha-2 input', () => {
  assert.equal(countryByCode('tr', options)?.code, 'TR')
  assert.equal(countryByCode(' JP ', options)?.code, 'JP')
  assert.equal(countryByCode('TUR', options), null)
  assert.equal(countryByCode(undefined, options), null)
})
