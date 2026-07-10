'use client'

import { useMemo, useRef, useEffect, useCallback } from 'react'
import Map, { Marker, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAPBOX_DARK_STYLE, DEFAULT_PITCH, DEFAULT_BEARING, BUILDING_EXTRUSION_LAYER } from '@/lib/mapbox/client'

export interface TripboxMapPoint {
  id: string
  lat: number
  lng: number
  label?: React.ReactNode
}

interface TripboxMapProps {
  points: TripboxMapPoint[]
  routePath?: { lat: number; lng: number }[]
  interactive?: boolean
  className?: string
  /** Center to use while there are no points yet — e.g. the trip's selected country. */
  defaultCenter?: { lat: number; lng: number }
  /** Zoom to use with `defaultCenter` — a country-wide view is much wider than a single-stop view. */
  defaultZoom?: number
}

/** Last-resort fallback center (Istanbul) when a trip has neither stops nor a selected country. */
const FALLBACK_CENTER = { lat: 41.0082, lng: 28.9784 }

export function TripboxMap({ points, routePath = [], interactive = true, className, defaultCenter, defaultZoom = 9 }: TripboxMapProps) {
  const mapRef = useRef<MapRef | null>(null)

  const center = useMemo(() => {
    if (points.length === 0) return defaultCenter ?? FALLBACK_CENTER
    return {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
    }
  }, [points, defaultCenter])

  const pointsKey = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

  const fitToPoints = useCallback(() => {
    const map = mapRef.current
    if (!map || points.length === 0) return
    if (points.length === 1) {
      map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 9, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING, duration: 800 })
      return
    }
    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, maxZoom: 13, duration: 800, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING }
    )
  }, [pointsKey, points])

  useEffect(() => {
    fitToPoints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey])

  const routeGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: routePath.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    }),
    [routePath]
  )

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={className}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,.4)', fontSize: 13 }}
      >
        Mapbox token not configured
      </div>
    )
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        latitude: center.lat,
        longitude: center.lng,
        zoom: points.length > 1 ? 10 : points.length === 1 ? 9 : defaultZoom,
        pitch: DEFAULT_PITCH,
        bearing: DEFAULT_BEARING,
      }}
      onLoad={fitToPoints}
      mapStyle={MAPBOX_DARK_STYLE}
      style={{ width: '100%', height: '100%' }}
      interactive={interactive}
      dragRotate={interactive}
      touchZoomRotate={interactive}
      attributionControl={false}
    >
      <Layer {...BUILDING_EXTRUSION_LAYER} />

      {routePath.length > 1 && (
        <Source id="trip-route" type="geojson" data={routeGeoJson}>
          <Layer
            id="trip-route-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': '#8888e4', 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [2, 1.5] }}
          />
        </Source>
      )}

      {points.map((p) => (
        <Marker key={p.id} latitude={p.lat} longitude={p.lng} anchor="center">
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#f5a623',
              border: '2px solid #0a1020',
              boxShadow: '0 0 12px rgba(245,140,0,.6)',
            }}
          />
        </Marker>
      ))}
    </Map>
  )
}
