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

export interface RouteLeg {
  durationText: string
  durationSeconds: number
  distanceMeters: number
}

export interface FullRoute {
  route: RouteSegment
  legs: RouteLeg[]
}

// One Directions response carries both the overview geometry and the per-leg
// stats, so a route only ever costs a single API call. Responses are cached by
// coordinate signature: reordering back, toggling nights, or renaming a stop
// never refetches.
const routeCache = new Map<string, FullRoute>()
const ROUTE_CACHE_MAX = 40

/**
 * Driving route through 2+ waypoints in order, via one Mapbox Directions call:
 * overview polyline plus per-leg distance/duration. Returns null when the
 * request fails or is aborted.
 */
export async function getFullRoute(points: LatLng[], opts?: { signal?: AbortSignal }): Promise<FullRoute | null> {
  if (points.length < 2 || !MAPBOX_TOKEN) return null
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')

  const cached = routeCache.get(coords)
  if (cached) return cached

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
  try {
    const res = await fetch(url, { signal: opts?.signal })
    if (!res.ok) return null
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route) return null

    const full: FullRoute = {
      route: {
        durationText: formatDuration(route.duration),
        durationSeconds: Math.round(route.duration),
        distanceMeters: Math.round(route.distance),
        polylinePath: (route.geometry?.coordinates ?? []).map(([lng, lat]: [number, number]) => ({ lat, lng })),
      },
      legs: Array.isArray(route.legs)
        ? route.legs.map((leg: { duration: number; distance: number }) => ({
            durationText: formatDuration(leg.duration),
            durationSeconds: Math.round(leg.duration),
            distanceMeters: Math.round(leg.distance),
          }))
        : [],
    }

    routeCache.set(coords, full)
    if (routeCache.size > ROUTE_CACHE_MAX) {
      routeCache.delete(routeCache.keys().next().value!)
    }
    return full
  } catch {
    // Aborted or network failure — callers treat null as "no route".
    return null
  }
}

/** Overview-only convenience wrapper around getFullRoute (shares its cache). */
export async function getDrivingRoute(points: LatLng[], opts?: { signal?: AbortSignal }): Promise<RouteSegment | null> {
  return (await getFullRoute(points, opts))?.route ?? null
}
