import { MAPBOX_TOKEN } from './client'

// Mapbox Optimization API v1 — solves the visiting order for up to 12 waypoints.
// First stop stays the departure point and last stays the final destination;
// only the middle stops are reordered.

interface LatLng {
  lat: number
  lng: number
}

/**
 * Returns the optimized visiting order as indices into `points`
 * (e.g. [0, 2, 1, 3]), or null when optimization isn't possible.
 */
export async function getOptimizedOrder(points: LatLng[]): Promise<number[] | null> {
  if (points.length < 3 || points.length > 12 || !MAPBOX_TOKEN) return null
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url =
    `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}` +
    `?source=first&destination=last&roundtrip=false&access_token=${MAPBOX_TOKEN}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !Array.isArray(data.waypoints)) return null
    // waypoints[i].waypoint_index = position of input point i in the optimized trip
    const order: number[] = new Array(points.length)
    data.waypoints.forEach((wp: { waypoint_index: number }, inputIndex: number) => {
      order[wp.waypoint_index] = inputIndex
    })
    if (order.some((v) => typeof v !== 'number')) return null
    return order
  } catch {
    return null
  }
}
