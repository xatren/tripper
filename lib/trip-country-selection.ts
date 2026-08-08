import { COUNTRY_DATA } from './country-data.generated.ts'
import type { TripCountry } from '@/types'

export type TripCountryMode = 'single-country' | 'multi-country'

export interface CountryOption extends TripCountry {
  /** Stable ISO 3166-1 alpha-2 identifier used by Mapbox boundary filters. */
  code: string
  /** Approximate land area, used only to choose a sensible initial camera zoom. */
  area: number
  searchNames: string[]
}

export interface SelectedTripCountry extends CountryOption {
  selectionOrder: number
}

export interface CountrySelectionState {
  mode: TripCountryMode
  countries: SelectedTripCountry[]
  activeCountryCode: string | null
}

export interface CountryCamera {
  latitude: number
  longitude: number
  zoom: number
}

export const EMPTY_COUNTRY_SELECTION: CountrySelectionState = {
  mode: 'single-country',
  countries: [],
  activeCountryCode: null,
}

export const COUNTRY_SELECTION_STORAGE_KEY = 'tripper:new-trip:country-selection:v1'

const SEARCH_ALIASES: Record<string, string[]> = {
  BO: ['Bolivia'],
  BN: ['Brunei'],
  CD: ['DR Congo', 'Democratic Republic of the Congo'],
  CG: ['Republic of the Congo'],
  CI: ["Cote d'Ivoire", 'Ivory Coast'],
  CZ: ['Czech Republic'],
  GB: ['UK', 'Great Britain'],
  IR: ['Iran'],
  KR: ['South Korea'],
  KP: ['North Korea'],
  LA: ['Laos'],
  MD: ['Moldova'],
  MK: ['North Macedonia'],
  PS: ['Palestine'],
  RU: ['Russia'],
  SY: ['Syria'],
  TR: ['Turkey'],
  TZ: ['Tanzania'],
  US: ['USA', 'United States of America'],
  VA: ['Vatican City'],
  VE: ['Venezuela'],
  VN: ['Vietnam'],
}

export function normalizeCountrySearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function getCountryOptions(locale = 'en'): CountryOption[] {
  let displayNames: Intl.DisplayNames | null = null
  try {
    displayNames = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    // The generated English name remains the dependable fallback.
  }

  return COUNTRY_DATA.map((country) => {
    const localizedName = displayNames?.of(country.code) || country.name
    const searchNames = [
      localizedName,
      country.name,
      ...country.nativeNames,
      ...(SEARCH_ALIASES[country.code] ?? []),
      country.code,
    ]

    return {
      code: country.code,
      name: localizedName,
      flag: country.flag,
      lat: country.lat,
      lng: country.lng,
      area: Math.max(1, country.area),
      searchNames: [...new Set(searchNames)],
    }
  }).sort((a, b) => a.name.localeCompare(b.name, locale))
}

export function searchCountries(countries: CountryOption[], query: string) {
  const needle = normalizeCountrySearch(query)
  if (!needle) return []

  return countries
    .filter((country) => country.searchNames.some((name) => normalizeCountrySearch(name).includes(needle)))
    .sort((a, b) => {
      const aStarts = a.searchNames.some((name) => normalizeCountrySearch(name).startsWith(needle))
      const bStarts = b.searchNames.some((name) => normalizeCountrySearch(name).startsWith(needle))
      return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name)
    })
}

/**
 * Recovers an ISO alpha-2 code from a country name. `TripCountry.code` is
 * optional — trips created before the country-picker redesign carry a name and
 * flag only — so any surface that needs a code for a Mapbox boundary filter has
 * to be able to work backwards from the stored name.
 *
 * Matching is exact against the normalized search names (including aliases),
 * never a prefix: "Guinea" must not resolve to Papua New Guinea.
 */
export function resolveCountryCode(name: string, countries: CountryOption[] = getCountryOptions()): string | null {
  const needle = normalizeCountrySearch(name)
  if (!needle) return null

  const match = countries.find((country) =>
    country.searchNames.some((searchName) => normalizeCountrySearch(searchName) === needle),
  )
  return match?.code ?? null
}

export function selectCountry(state: CountrySelectionState, country: CountryOption): CountrySelectionState {
  const existingIndex = state.countries.findIndex((selected) => selected.code === country.code)

  if (state.mode === 'single-country') {
    const selected = { ...country, selectionOrder: 0 }
    return {
      ...state,
      countries: [selected],
      activeCountryCode: country.code,
    }
  }

  if (existingIndex >= 0) {
    return { ...state, activeCountryCode: country.code }
  }

  return {
    ...state,
    countries: [...state.countries, { ...country, selectionOrder: state.countries.length }],
    activeCountryCode: country.code,
  }
}

export function enableMultiCountry(state: CountrySelectionState): CountrySelectionState {
  return { ...state, mode: 'multi-country' }
}

export function removeCountry(state: CountrySelectionState, code: string): CountrySelectionState {
  const countries = state.countries
    .filter((country) => country.code !== code)
    .map((country, selectionOrder) => ({ ...country, selectionOrder }))

  return {
    ...state,
    countries,
    activeCountryCode: state.activeCountryCode === code
      ? countries.at(-1)?.code ?? null
      : state.activeCountryCode,
  }
}

export function serializeCountrySelection(state: CountrySelectionState) {
  return JSON.stringify(state)
}

export function parseCountrySelection(value: string | null): CountrySelectionState | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<CountrySelectionState>
    if (parsed.mode !== 'single-country' && parsed.mode !== 'multi-country') return null
    if (!Array.isArray(parsed.countries)) return null
    const valid = parsed.countries.every((country) =>
      country && typeof country.code === 'string' && typeof country.name === 'string' &&
      typeof country.flag === 'string' && Number.isFinite(country.lat) && Number.isFinite(country.lng),
    )
    if (!valid) return null

    const countries = (parsed.countries as SelectedTripCountry[]).map((country, selectionOrder) => ({
      ...country,
      area: Number.isFinite(country.area) ? Math.max(1, country.area) : 1,
      searchNames: Array.isArray(country.searchNames) ? country.searchNames : [country.name, country.code],
      selectionOrder,
    }))
    return {
      mode: parsed.mode,
      countries,
      activeCountryCode: countries.some((country) => country.code === parsed.activeCountryCode)
        ? parsed.activeCountryCode ?? null
        : countries.at(-1)?.code ?? null,
    }
  } catch {
    return null
  }
}

function wrappedLongitudeDelta(longitude: number, center: number) {
  return ((longitude - center + 540) % 360) - 180
}

/** Dateline-safe camera framing based on country centers and relative land area. */
export function cameraForCountries(countries: SelectedTripCountry[]): CountryCamera {
  if (countries.length === 0) return { latitude: 18, longitude: 8, zoom: 1.15 }

  if (countries.length === 1) {
    const country = countries[0]
    const zoom = Math.min(6, Math.max(1.55, 6.65 - Math.log10(Math.max(1, country.area)) * 0.72))
    return { latitude: country.lat, longitude: country.lng, zoom }
  }

  const radians = countries.map((country) => country.lng * Math.PI / 180)
  const longitude = Math.atan2(
    radians.reduce((sum, angle) => sum + Math.sin(angle), 0),
    radians.reduce((sum, angle) => sum + Math.cos(angle), 0),
  ) * 180 / Math.PI
  const deltas = countries.map((country) => wrappedLongitudeDelta(country.lng, longitude))
  const latitudes = countries.map((country) => country.lat)
  const longitudeSpan = Math.max(...deltas) - Math.min(...deltas)
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes)
  const span = Math.max(8, longitudeSpan, latitudeSpan * 1.45)

  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude,
    zoom: span > 145 ? 0.75 : Math.min(4.4, Math.max(0.9, 6.9 - Math.log2(span + 1))),
  }
}
