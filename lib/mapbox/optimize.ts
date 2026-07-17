// Mapbox Optimization API v1 — solves the visiting order for up to 12 waypoints.
// First stop stays the departure point and last stays the final destination;
// only the middle stops are reordered.

interface LatLng {
  lat: number
  lng: number
}

export interface OptimizedTrip {
  /** Visiting order as indices into the input `points` (e.g. [0, 2, 1, 3]). */
  order: number[]
  distanceMeters: number
  durationSeconds: number
}

/**
 * Returns the optimized visiting order plus the optimized trip's total
 * distance/duration (so callers can show a before/after comparison), or
 * null when optimization isn't possible.
 */
export async function getOptimizedOrder(
  points: LatLng[],
  opts?: { signal?: AbortSignal; accessToken?: string; fetcher?: typeof fetch },
): Promise<OptimizedTrip | null> {
  const accessToken = opts?.accessToken ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (points.length < 3 || points.length > 12 || !accessToken) return null
  if (opts?.signal?.aborted) return null
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url =
    `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}` +
    `?source=first&destination=last&roundtrip=false&access_token=${encodeURIComponent(accessToken)}`
  try {
    const fetcher = opts?.fetcher ?? fetch
    const res = await fetcher(url, { signal: opts?.signal })
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !Array.isArray(data.waypoints)) return null
    const trip = data.trips?.[0]
    if (!trip) return null
    // waypoints[i].waypoint_index = position of input point i in the optimized trip
    const order: number[] = new Array(points.length)
    data.waypoints.forEach((wp: { waypoint_index: number }, inputIndex: number) => {
      order[wp.waypoint_index] = inputIndex
    })
    if (order.some((v) => typeof v !== 'number')) return null
    return { order, distanceMeters: trip.distance, durationSeconds: trip.duration }
  } catch {
    return null
  }
}
