import { MAPBOX_TOKEN } from './client'

export interface GeocodeResult {
  id: string
  name: string
  address: string
  lat: number
  lng: number
}

interface MapboxFeature {
  id: string
  text: string
  place_name: string
  center: [number, number]
}

function toResult(f: MapboxFeature): GeocodeResult {
  return {
    id: f.id,
    name: f.text || f.place_name,
    address: f.place_name,
    lat: f.center[1],
    lng: f.center[0],
  }
}

/** Forward place search (autocomplete-style), optionally biased near a point. */
export async function forwardSearch(
  query: string,
  proximity?: { lat: number; lng: number }
): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (!q || !MAPBOX_TOKEN) return []

  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, autocomplete: 'true', limit: '6' })
  if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`)

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return ((data.features ?? []) as MapboxFeature[]).map(toResult)
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
