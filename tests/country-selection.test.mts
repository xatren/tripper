import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  EMPTY_COUNTRY_SELECTION,
  cameraForCountries,
  enableMultiCountry,
  getCountryOptions,
  parseCountrySelection,
  removeCountry,
  resolveCountryCode,
  searchCountries,
  selectCountry,
  serializeCountrySelection,
} from '../lib/trip-country-selection.ts'

const options = getCountryOptions('en')
const country = (code: string) => {
  const match = options.find((item) => item.code === code)
  assert.ok(match, `Missing test country ${code}`)
  return match
}

test('country search is case- and accent-insensitive and supports common aliases', () => {
  assert.equal(searchCountries(options, 'jAPAn')[0]?.code, 'JP')
  assert.equal(searchCountries(options, 'cote divoire')[0]?.code, 'CI')
  assert.equal(searchCountries(options, 'USA')[0]?.code, 'US')
})

test('resolveCountryCode recovers a code from a legacy country name without matching prefixes', () => {
  assert.equal(resolveCountryCode('Turkey', options), 'TR')
  assert.equal(resolveCountryCode('Türkiye', options), 'TR')
  assert.equal(resolveCountryCode('  united states of america ', options), 'US')
  // Exact match only: a shorter name must not be absorbed by a longer one.
  assert.equal(resolveCountryCode('Guinea', options), 'GN')
  assert.equal(resolveCountryCode('Atlantis', options), null)
  assert.equal(resolveCountryCode('', options), null)
})

test('single-country selection replaces the previous country', () => {
  const japan = selectCountry(EMPTY_COUNTRY_SELECTION, country('JP'))
  const portugal = selectCountry(japan, country('PT'))
  assert.equal(portugal.mode, 'single-country')
  assert.deepEqual(portugal.countries.map((item) => item.code), ['PT'])
  assert.equal(portugal.activeCountryCode, 'PT')
})

test('multi-country selection preserves order and prevents duplicates', () => {
  let state = selectCountry(EMPTY_COUNTRY_SELECTION, country('JP'))
  state = enableMultiCountry(state)
  state = selectCountry(state, country('TH'))
  state = selectCountry(state, country('JP'))
  assert.deepEqual(state.countries.map((item) => [item.code, item.selectionOrder]), [['JP', 0], ['TH', 1]])

  state = removeCountry(state, 'JP')
  assert.deepEqual(state.countries.map((item) => [item.code, item.selectionOrder]), [['TH', 0]])
  assert.equal(state.activeCountryCode, 'TH')
})

test('country selection draft round-trips and rejects malformed state', () => {
  const state = selectCountry(enableMultiCountry(EMPTY_COUNTRY_SELECTION), country('GR'))
  assert.deepEqual(parseCountrySelection(serializeCountrySelection(state)), state)
  assert.equal(parseCountrySelection('{"mode":"unknown","countries":[]}'), null)
  assert.equal(parseCountrySelection('{broken'), null)
})

test('camera framing zooms further into small countries than large countries', () => {
  const portugal = selectCountry(EMPTY_COUNTRY_SELECTION, country('PT')).countries
  const unitedStates = selectCountry(EMPTY_COUNTRY_SELECTION, country('US')).countries
  assert.ok(cameraForCountries(portugal).zoom > cameraForCountries(unitedStates).zoom)
})

test('multi-country camera uses the short path across the international date line', () => {
  let state = selectCountry(enableMultiCountry(EMPTY_COUNTRY_SELECTION), country('FJ'))
  state = selectCountry(state, country('TV'))
  const camera = cameraForCountries(state.countries)
  assert.ok(Math.abs(camera.longitude) > 150)
  assert.ok(camera.zoom > 1)
})

test('plan stop search is hard-filtered to the trip country codes', () => {
  const geocoding = readFileSync(new URL('../lib/mapbox/geocoding.ts', import.meta.url), 'utf8')
  const dialog = readFileSync(new URL('../app/trip/[id]/mobile/DestinationDialog.tsx', import.meta.url), 'utf8')
  const plan = readFileSync(new URL('../app/trip/[id]/mobile/PlanRouteDomain.tsx', import.meta.url), 'utf8')

  assert.match(geocoding, /params\.set\('country', countryCodes\.join\(','\)\)/)
  assert.match(dialog, /forwardSearch\(q, \{ countryCodes:/)
  assert.match(plan, /countryCodes=\{stopSearchCountries\}/)
})
