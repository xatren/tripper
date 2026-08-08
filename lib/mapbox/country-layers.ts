import type { FilterSpecification } from 'mapbox-gl'

/**
 * Shared country-boundary primitives for every surface that tints a country on
 * the map (the New Trip wizard globe and Discover). One definition so the two
 * screens can never disagree about which polygons a country is made of.
 */
export const COUNTRY_BOUNDARIES_SOURCE_URL = 'mapbox://mapbox.country-boundaries-v1'
export const COUNTRY_BOUNDARIES_SOURCE_LAYER = 'country_boundaries'

/**
 * Deliberate, sensitive choice: disputed polygons are dropped and the Turkish
 * worldview is preferred where Mapbox ships more than one. Lifted verbatim from
 * the wizard globe — do not re-derive it per surface.
 */
export const WORLDVIEW_FILTER: FilterSpecification = [
  'all',
  ['==', ['get', 'disputed'], 'false'],
  ['any', ['==', ['get', 'worldview'], 'all'], ['in', 'TR', ['get', 'worldview']]],
]

/** Worldview-safe filter narrowed to a set of ISO 3166-1 alpha-2 codes. */
export function countryFilter(codes: string[]): FilterSpecification {
  return [
    'all',
    ...WORLDVIEW_FILTER.slice(1),
    ['in', ['get', 'iso_3166_1'], ['literal', codes]],
  ] as FilterSpecification
}
