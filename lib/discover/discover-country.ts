// Pure Discover country resolution. Deliberately alias-free (`../` imports only)
// so `tests/discover-country.test.mts` can load it under
// `node --experimental-strip-types`, per the repo's pure-logic test convention.
import { selectFeaturedTrip, type FeaturedTripCandidate } from '../map-home.ts'
import {
  getCountryOptions,
  resolveCountryCode,
  type CountryOption,
} from '../trip-country-selection.ts'

/** The user's last explicit Discover choice. Deliberately not the wizard's key, which is cleared on wizard completion. */
export const DISCOVER_COUNTRY_STORAGE_KEY = 'tripper:discover:country:v1'

/** Structural shape of a `trips` row as far as country resolution is concerned. */
export interface DiscoverTripCandidate extends FeaturedTripCandidate {
  countries?: { code?: string | null; name?: string | null; selectionOrder?: number | null }[] | null
}

export type DiscoverCountrySource = 'param' | 'stored' | 'featured-trip' | 'recent-trip' | 'none'

export interface DiscoverCountryResolution {
  country: CountryOption | null
  source: DiscoverCountrySource
}

/** Case-insensitive alpha-2 lookup. Returns null rather than guessing, so a junk `?country=` param falls through to the next precedence step. */
export function countryByCode(code: string | null | undefined, options: CountryOption[]): CountryOption | null {
  if (!code) return null
  const normalized = code.trim().toUpperCase()
  if (normalized.length !== 2) return null
  return options.find((option) => option.code === normalized) ?? null
}

/**
 * The first country of a trip, by `selectionOrder` with array order as the
 * backwards-compatible tiebreak. Legacy rows without a `code` are recovered from
 * their stored name; a country that resolves to nothing is skipped rather than
 * failing the whole trip.
 */
export function firstTripCountry(trip: DiscoverTripCandidate, options: CountryOption[]): CountryOption | null {
  const countries = (trip.countries ?? [])
    .map((country, index) => ({ country, index }))
    .sort((a, b) => (a.country.selectionOrder ?? a.index) - (b.country.selectionOrder ?? b.index))

  for (const { country } of countries) {
    const direct = countryByCode(country.code, options)
    if (direct) return direct
    const recovered = country.name ? resolveCountryCode(country.name, options) : null
    const byName = countryByCode(recovered, options)
    if (byName) return byName
  }
  return null
}

export interface ResolveDiscoverCountryInput {
  /** The `?country=` search param — deep links win over everything. */
  requestedCode?: string | null
  trips?: readonly DiscoverTripCandidate[]
  options?: CountryOption[]
  todayISO?: string
}

/**
 * Server-resolvable half of the country precedence: URL param, then the
 * featured trip's first country, then any most-recently-updated trip's first
 * country, then nothing (a world view with a country prompt).
 *
 * `localStorage` sits between the param and the trips but is client-only, so it
 * is layered on after mount by `preferStoredCountry`.
 */
export function resolveDiscoverCountry(input: ResolveDiscoverCountryInput): DiscoverCountryResolution {
  const options = input.options ?? getCountryOptions()
  const trips = input.trips ?? []

  const requested = countryByCode(input.requestedCode, options)
  if (requested) return { country: requested, source: 'param' }

  const featured = selectFeaturedTrip(trips, input.todayISO)
  const featuredCountry = featured ? firstTripCountry(featured, options) : null
  if (featuredCountry) return { country: featuredCountry, source: 'featured-trip' }

  const recent = [...trips].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id))
  for (const trip of recent) {
    const country = firstTripCountry(trip, options)
    if (country) return { country, source: 'recent-trip' }
  }

  return { country: null, source: 'none' }
}

/**
 * Applies the client-only localStorage preference on top of a server
 * resolution. A `?country=` deep link is explicit intent for *this* visit and is
 * never overridden; everything below it is a guess the stored choice outranks.
 */
export function preferStoredCountry(
  resolved: DiscoverCountryResolution,
  storedCode: string | null | undefined,
  options: CountryOption[],
): DiscoverCountryResolution {
  if (resolved.source === 'param') return resolved
  const stored = countryByCode(storedCode, options)
  if (!stored || stored.code === resolved.country?.code) return resolved
  return { country: stored, source: 'stored' }
}
