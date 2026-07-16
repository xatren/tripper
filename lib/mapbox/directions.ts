interface LatLng {
  lat: number
  lng: number
}

interface RouteSegment {
  durationText: string
  durationSeconds: number
  distanceMeters: number
  polylinePath: { lat: number; lng: number }[]
}

/** Owns the latest Directions request so stale responses can never win. */
export class LatestRouteRequestController {
  private active: AbortController | null = null

  begin(): AbortController {
    this.active?.abort()
    this.active = new AbortController()
    return this.active
  }

  isCurrent(controller: AbortController): boolean {
    return this.active === controller && !controller.signal.aborted
  }

  cancel(controller: AbortController): void {
    controller.abort()
    if (this.active === controller) this.active = null
  }
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
  /** Directions requests used. Routes above the API waypoint limit are split into overlapping chunks. */
  requestCount: number
}

export const MAPBOX_DIRECTIONS_MAX_COORDINATES = 25

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
export async function getFullRoute(points: LatLng[], opts?: { signal?: AbortSignal; accessToken?: string; fetcher?: typeof fetch }): Promise<FullRoute | null> {
  const accessToken = opts?.accessToken ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (points.length < 2 || !accessToken) return null
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')

  const cached = routeCache.get(coords)
  if (cached) return cached

  try {
    const chunks: LatLng[][] = []
    for (let start = 0; start < points.length - 1; start += MAPBOX_DIRECTIONS_MAX_COORDINATES - 1) {
      chunks.push(points.slice(start, Math.min(points.length, start + MAPBOX_DIRECTIONS_MAX_COORDINATES)))
    }

    const allPath: { lat: number; lng: number }[] = []
    const allLegs: RouteLeg[] = []
    let durationSeconds = 0
    let distanceMeters = 0
    const fetcher = opts?.fetcher ?? fetch

    for (const chunk of chunks) {
      if (opts?.signal?.aborted) return null
      const chunkCoords = chunk.map((point) => `${point.lng},${point.lat}`).join(';')
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${chunkCoords}?geometries=geojson&overview=full&access_token=${encodeURIComponent(accessToken)}`
      const res = await fetcher(url, { signal: opts?.signal })
      if (!res.ok) return null
      const data = await res.json()
      const route = data.routes?.[0]
      if (!route) return null
      const path = (route.geometry?.coordinates ?? []).map(([lng, lat]: [number, number]) => ({ lat, lng }))
      allPath.push(...(allPath.length > 0 ? path.slice(1) : path))
      durationSeconds += Math.round(route.duration)
      distanceMeters += Math.round(route.distance)
      if (Array.isArray(route.legs)) {
        allLegs.push(...route.legs.map((leg: { duration: number; distance: number }) => ({
          durationText: formatDuration(leg.duration),
          durationSeconds: Math.round(leg.duration),
          distanceMeters: Math.round(leg.distance),
        })))
      }
    }

    const full: FullRoute = {
      route: {
        durationText: formatDuration(durationSeconds),
        durationSeconds,
        distanceMeters,
        polylinePath: allPath,
      },
      legs: allLegs,
      requestCount: chunks.length,
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
