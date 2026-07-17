import { MAPBOX_TOKEN } from './client'

export interface GeocodeResult {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  /** Mapbox's own POI category (e.g. "restaurant"), when the feature has one. */
  category?: string
}

interface MapboxFeature {
  id: string
  text: string
  place_name: string
  center: [number, number]
  properties?: { category?: string }
}

function toResult(f: MapboxFeature): GeocodeResult {
  return {
    id: f.id,
    name: f.text || f.place_name,
    address: f.place_name,
    lat: f.center[1],
    lng: f.center[0],
    category: f.properties?.category,
  }
}

export interface ForwardSearchOptions {
  proximity?: { lat: number; lng: number }
  /** Mapbox `types` filter, e.g. 'poi' to constrain results to points of interest. */
  types?: string
  /** Required when a result will be persisted beyond the current session. */
  permanent?: boolean
  autocomplete?: boolean
  limit?: number
  signal?: AbortSignal
}

export type ForwardSearchErrorKind = 'network' | 'rate_limited'

export interface ForwardSearchResult {
  results: GeocodeResult[]
  error: ForwardSearchErrorKind | null
}

/** Forward place search (autocomplete-style), optionally biased near a point and/or category-filtered. */
export async function forwardSearch(
  query: string,
  opts: ForwardSearchOptions = {},
): Promise<ForwardSearchResult> {
  const q = query.trim()
  if (!q || !MAPBOX_TOKEN) return { results: [], error: null }

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    autocomplete: String(opts.autocomplete ?? true),
    limit: String(Math.min(10, Math.max(1, opts.limit ?? 6))),
  })
  if (opts.proximity) params.set('proximity', `${opts.proximity.lng},${opts.proximity.lat}`)
  if (opts.types) params.set('types', opts.types)
  if (opts.permanent) params.set('permanent', 'true')

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url, { signal: opts.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return { results: [], error: 'network' }
  }
  if (res.status === 429) return { results: [], error: 'rate_limited' }
  if (!res.ok) return { results: [], error: 'network' }
  const data = await res.json()
  return { results: ((data.features ?? []) as MapboxFeature[]).map(toResult), error: null }
}

/** Reverse geocode a coordinate into a human-readable place. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) return null
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, limit: '1' })
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0] as MapboxFeature | undefined
  return feature ? toResult(feature) : null
}
