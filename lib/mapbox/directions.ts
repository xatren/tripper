import type { RouteSegment } from '@/types'
import { MAPBOX_TOKEN } from './client'

interface LatLng {
  lat: number
  lng: number
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

function formatDistance(meters: number): string {
  const km = meters / 1000
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`
}

/** Driving route through 2+ waypoints in order, via the Mapbox Directions API. */
export async function getDrivingRoute(points: LatLng[]): Promise<RouteSegment | null> {
  if (points.length < 2 || !MAPBOX_TOKEN) return null
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`

  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) return null

  return {
    durationText: formatDuration(route.duration),
    durationSeconds: Math.round(route.duration),
    distanceText: formatDistance(route.distance),
    distanceMeters: Math.round(route.distance),
    polylinePath: (route.geometry?.coordinates ?? []).map(([lng, lat]: [number, number]) => ({ lat, lng })),
  }
}

export interface RouteLeg {
  durationText: string
  durationSeconds: number
  distanceText: string
  distanceMeters: number
}

/** Per-leg driving distance/duration between each consecutive pair of waypoints, in one Directions API call. */
export async function getRouteLegs(points: LatLng[]): Promise<RouteLeg[]> {
  if (points.length < 2 || !MAPBOX_TOKEN) return []
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=false&access_token=${MAPBOX_TOKEN}`

  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  const legs = data.routes?.[0]?.legs
  if (!Array.isArray(legs)) return []

  return legs.map((leg: { duration: number; distance: number }) => ({
    durationText: formatDuration(leg.duration),
    durationSeconds: Math.round(leg.duration),
    distanceText: formatDistance(leg.distance),
    distanceMeters: Math.round(leg.distance),
  }))
}
