'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Marker, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import type mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { animate } from 'framer-motion'
import { MAPBOX_TOKEN, MAPBOX_DARK_STYLE, DEFAULT_PITCH, DEFAULT_BEARING, BUILDING_EXTRUSION_LAYER } from '@/lib/mapbox/client'
import { applyAppTheme } from '@/lib/mapbox/theme'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'

const ACCENT_LIGHT = '#f8c04a'
/** How much closer (in zoom levels) the chase camera gets vs. the full-route overview. */
const CHASE_ZOOM_BOOST = 3.5

interface LatLng {
  lat: number
  lng: number
}

export interface RouteReplayPoint extends LatLng {
  id: string
  label: number
  title: string
}

interface RouteReplayMapProps {
  points: RouteReplayPoint[]
  routePath: LatLng[]
  /** Total replay time in seconds. */
  duration?: number
  height?: number
}

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function bearingBetween(a: LatLng, b: LatLng) {
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Cumulative distance (meters) at each vertex of the route polyline. */
function buildCumulative(path: LatLng[]) {
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineMeters(path[i - 1], path[i]))
  return cum
}

/** The polyline index + interpolated point at a given traveled distance. */
function sampleAtDistance(path: LatLng[], cum: number[], dist: number) {
  if (path.length === 0) return null
  const total = cum[cum.length - 1]
  if (dist <= 0) return { point: path[0], index: 0 }
  if (dist >= total) return { point: path[path.length - 1], index: path.length - 1 }
  let i = 1
  while (i < cum.length && cum[i] < dist) i++
  const segStart = cum[i - 1]
  const segEnd = cum[i]
  const t = segEnd > segStart ? (dist - segStart) / (segEnd - segStart) : 0
  const a = path[i - 1]
  const b = path[i]
  return { point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, index: i }
}

const emptyLine = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [] as number[][] }, properties: {} }

export function RouteReplayMap({ points, routePath, duration = 7, height = 220 }: RouteReplayMapProps) {
  const reducedMotion = useReducedMotionPreference()
  const mapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [car, setCar] = useState<{ lat: number; lng: number; bearing: number } | null>(null)
  const [revealed, setRevealed] = useState<boolean[]>(() => points.map(() => false))
  const [playToken, setPlayToken] = useState(0)

  const cumulative = useMemo(() => buildCumulative(routePath), [routePath])
  const totalMeters = cumulative[cumulative.length - 1] ?? 0

  const stopDistances = useMemo(
    () =>
      points.map((p) => {
        let best = Infinity
        let bestDist = 0
        routePath.forEach((rp, i) => {
          const d = haversineMeters(rp, p)
          if (d < best) {
            best = d
            bestDist = cumulative[i]
          }
        })
        return bestDist
      }),
    [points, routePath, cumulative]
  )

  const bounds = useMemo(() => {
    if (routePath.length === 0) return null
    const lats = routePath.map((p) => p.lat)
    const lngs = routePath.map((p) => p.lng)
    return {
      sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
      ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
    }
  }, [routePath])

  const timeoutsRef = useRef<number[]>([])
  const animControlsRef = useRef<ReturnType<typeof animate> | null>(null)

  const clearPending = useCallback(() => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t))
    timeoutsRef.current = []
    animControlsRef.current?.stop()
    animControlsRef.current = null
    mapRef.current?.getMap().stop()
  }, [])

  const showCompletedRoute = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map || !bounds || routePath.length < 2) return

    clearPending()
    setCar(null)
    setRevealed(points.map(() => true))
    map.fitBounds([bounds.sw, bounds.ne], {
      padding: 36,
      duration: 0,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
    })
    const traveledSource = map.getSource('journal-traveled-route') as mapboxgl.GeoJSONSource | undefined
    traveledSource?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: routePath.map((p) => [p.lng, p.lat]) },
      properties: {},
    })
  }, [bounds, clearPending, points, routePath])

  /**
   * Cinematic sequence: wide establishing shot of the whole route, zoom in on
   * the start, chase the car marker along the real road geometry, then pull
   * the camera back out to the full-route overview once it arrives.
   */
  const playSequence = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map || !bounds || routePath.length < 2 || totalMeters <= 0) return

    clearPending()
    setRevealed(points.map(() => false))
    setCar(null)

    const traveledSource = map.getSource('journal-traveled-route') as mapboxgl.GeoJSONSource | undefined
    traveledSource?.setData(emptyLine)

    // 1. establishing shot — the whole route, instantly framed
    map.fitBounds([bounds.sw, bounds.ne], { padding: 36, duration: 0, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING })
    const chaseZoom = Math.min(17, map.getZoom() + CHASE_ZOOM_BOOST)
    const start = routePath[0]

    const t1 = window.setTimeout(() => {
      // 2. zoom in to the starting point
      map.flyTo({ center: [start.lng, start.lat], zoom: chaseZoom, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING, duration: 1400, essential: false })

      const t2 = window.setTimeout(() => {
        // 3. chase the marker along the real route geometry
        animControlsRef.current = animate(0, 1, {
          duration,
          ease: 'linear',
          onUpdate: (v) => {
            const dist = v * totalMeters
            const sample = sampleAtDistance(routePath, cumulative, dist)
            if (!sample) return
            const lookahead = sampleAtDistance(routePath, cumulative, Math.min(totalMeters, dist + 25))
            const bearing = lookahead ? bearingBetween(sample.point, lookahead.point) : 0
            setCar({ ...sample.point, bearing })
            setRevealed(stopDistances.map((d) => dist >= d - 40))
            map.jumpTo({ center: [sample.point.lng, sample.point.lat], zoom: chaseZoom, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING })

            traveledSource?.setData({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: routePath.slice(0, sample.index + 1).map((p) => [p.lng, p.lat]) },
              properties: {},
            })
          },
          onComplete: () => {
            // 4. pull back out to reveal the finished route
            map.fitBounds([bounds.sw, bounds.ne], { padding: 36, duration: 1600, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING })
          },
        })
      }, 1500)
      timeoutsRef.current.push(t2)
    }, 500)
    timeoutsRef.current.push(t1)
  }, [routePath, cumulative, totalMeters, duration, points, stopDistances, bounds, clearPending])

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    applyAppTheme(map)
    map.on('style.load', () => applyAppTheme(map))
    setMapReady(true)
  }, [])

  useEffect(() => {
    if (!mapReady || !bounds) return
    if (reducedMotion) showCompletedRoute()
    else playSequence()
    return () => clearPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, bounds, playToken, reducedMotion])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => mapRef.current?.resize())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const center = bounds
    ? { lat: (bounds.sw[1] + bounds.ne[1]) / 2, lng: (bounds.sw[0] + bounds.ne[0]) / 2 }
    : { lat: 0, lng: 0 }

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', fontSize: 13 }}>
        Mapbox token not configured
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height, background: '#06061c' }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 8, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING }}
        onLoad={handleLoad}
        mapStyle={MAPBOX_DARK_STYLE}
        style={{ width: '100%', height: '100%' }}
        interactive={false}
        attributionControl={false}
        logoPosition="bottom-right"
      >
        <Layer {...BUILDING_EXTRUSION_LAYER} />

        {/* full route, dim, for context */}
        <Source
          id="journal-full-route"
          type="geojson"
          data={{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: routePath.map((p) => [p.lng, p.lat]) },
            properties: {},
          }}
        >
          <Layer
            id="journal-full-route-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': 'rgba(255,255,255,.25)', 'line-width': 3 }}
          />
        </Source>

        {/* traveled portion, animated in by RouteReplayMap via setData() */}
        <Source id="journal-traveled-route" type="geojson" data={emptyLine}>
          <Layer
            id="journal-traveled-route-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': ACCENT_LIGHT, 'line-width': 4, 'line-opacity': 0.95 }}
          />
        </Source>

        {points.map((p, i) => (
          <Marker key={p.id} latitude={p.lat} longitude={p.lng} anchor="center" style={{ opacity: revealed[i] ? 1 : 0, transition: reducedMotion ? 'none' : 'opacity .3s ease' }}>
            <div
              style={{
                width: 22, height: 22, borderRadius: '50%', background: '#0a0a1e',
                border: `2px solid ${ACCENT_LIGHT}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: ACCENT_LIGHT,
              }}
            >
              {p.label}
            </div>
          </Marker>
        ))}

        {car && (
          <Marker latitude={car.lat} longitude={car.lng} anchor="center" rotation={car.bearing - DEFAULT_BEARING}>
            <div
              style={{
                width: 16, height: 16, borderRadius: '50%', background: ACCENT_LIGHT,
                boxShadow: `0 0 0 4px rgba(245,192,74,.28), 0 0 14px 2px rgba(245,140,0,.8)`,
                border: '2px solid #1a0f00',
              }}
            />
          </Marker>
        )}
      </Map>

      <button
        onClick={() => reducedMotion ? showCompletedRoute() : setPlayToken((n) => n + 1)}
        aria-label={reducedMotion ? 'Show full route' : 'Replay route'}
        title={reducedMotion ? 'Show full route' : 'Replay route'}
        style={{
          position: 'absolute', right: 10, bottom: 10, zIndex: 5,
          width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', backdropFilter: 'blur(16px)',
          cursor: 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.6 5.6L1 10m22 4l-4.6 4.4A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </div>
  )
}
