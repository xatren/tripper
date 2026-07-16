'use client'

import { useMemo, useRef, useEffect, useCallback, useState, type CSSProperties } from 'react'
import Map, { Marker, Popup, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAPBOX_DARK_STYLE, DEFAULT_PITCH, DEFAULT_BEARING, BUILDING_EXTRUSION_LAYER } from '@/lib/mapbox/client'
import { applyAppTheme } from '@/lib/mapbox/theme'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'

const ACCENT = '#f5a623'

export interface TripboxMapPoint {
  id: string
  lat: number
  lng: number
  label?: React.ReactNode
  /** Shown as the popup heading when the pin is tapped. Falls back to the pin's label/number. */
  title?: string
  /** Shown as a secondary line under the popup title. */
  subtitle?: string
  itemType?: string
  emphasis?: 'strong' | 'dimmed'
  role?: 'start' | 'end' | 'waypoint'
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
  /** Point id that was just added — its marker plays a short drop-in animation. */
  dropInId?: string | null
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
  cameraTarget?: { lat: number; lng: number; nonce: number } | null
  userLocation?: { lat: number; lng: number } | null
  onMapError?: () => void
}

/** Last-resort fallback center (Istanbul) when a trip has neither stops nor a selected country. */
const FALLBACK_CENTER = { lat: 41.0082, lng: 28.9784 }

const zoomBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  color: '#ffffff',
  fontSize: 18,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1,
}

export function TripboxMap({ points, routePath = [], interactive = true, className, defaultCenter, defaultZoom = 9, dropInId = null, selectedItemId, onSelectItem, cameraTarget, userLocation, onMapError }: TripboxMapProps) {
  const reducedMotion = useReducedMotionPreference()
  const mapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  const selectedId = selectedItemId === undefined ? internalSelectedId : selectedItemId
  const setSelectedId = useCallback((id: string | null) => {
    if (selectedItemId === undefined) setInternalSelectedId(id)
    onSelectItem?.(id)
  }, [onSelectItem, selectedItemId])

  const center = useMemo(() => {
    if (points.length === 0) return defaultCenter ?? FALLBACK_CENTER
    return {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
    }
  }, [points, defaultCenter])

  const pointsKey = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

  const fitToPoints = useCallback(
    (duration = 800) => {
      const map = mapRef.current
      if (!map || points.length === 0) return
      if (points.length === 1) {
        map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 9, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING, duration: reducedMotion ? 0 : duration, essential: false })
        return
      }
      const lats = points.map((p) => p.lat)
      const lngs = points.map((p) => p.lng)
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: 13, duration: reducedMotion ? 0 : duration, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING }
      )
    },
    [points, reducedMotion]
  )

  useEffect(() => {
    fitToPoints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey])

  // Clear any open popup if its point disappears (e.g. stop removed).
  useEffect(() => {
    if (selectedId && !points.some((p) => p.id === selectedId)) setSelectedId(null)
  }, [points, selectedId, setSelectedId])

  useEffect(() => {
    if (!cameraTarget || !mapRef.current) return
    mapRef.current.flyTo({ center: [cameraTarget.lng, cameraTarget.lat], zoom: 14, pitch: 30, duration: reducedMotion ? 0 : 220, essential: false })
  }, [cameraTarget, reducedMotion])

  useEffect(() => {
    const selected = points.find((point) => point.id === selectedId)
    if (!selected || !mapRef.current) return
    mapRef.current.flyTo({ center: [selected.lng, selected.lat], zoom: Math.max(mapRef.current.getZoom(), 12), duration: reducedMotion ? 0 : 220, essential: false })
  }, [points, reducedMotion, selectedId])

  // Keep the WebGL canvas's pixel size following the container in real time
  // when it's resized (e.g. by a draggable sheet growing/shrinking the map).
  // Deliberately does NOT touch center/zoom/pitch — the camera must stay
  // exactly where the user left it; only the visible viewport changes.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) {
      applyAppTheme(map)
      map.on('style.load', () => applyAppTheme(map))
    }
    fitToPoints()
  }, [fitToPoints])

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: reducedMotion ? 0 : 200 })
  }, [reducedMotion])

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: reducedMotion ? 0 : 200 })
  }, [reducedMotion])

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

  const selectedPoint = points.find((p) => p.id === selectedId) ?? null

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
    <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%', height: '100%', background: '#06061c' }}>
      <style>{`
        .mapboxgl-ctrl-logo {
          transform: scale(.72);
          transform-origin: bottom left;
          opacity: .8;
        }
        .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-attrib {
          background: rgba(10,10,26,.55);
          backdrop-filter: blur(6px);
          border-radius: 8px;
          font-size: 10px;
          padding: 0 6px;
        }
        .mapboxgl-ctrl-attrib a { color: rgba(255,255,255,.55) !important; }
        .mapboxgl-ctrl-attrib-button { filter: invert(1) brightness(1.6); }
        .mapboxgl-ctrl-bottom-right { display: flex; align-items: center; gap: 4px; }
        .tripbox-popup .mapboxgl-popup-content {
          background: #12122a;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 12px;
          padding: 10px 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,.4);
        }
        .tripbox-popup .mapboxgl-popup-close-button {
          color: rgba(255,255,255,.55);
          font-size: 16px;
          padding: 2px 6px;
        }
        .tripbox-popup.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: #12122a; }
        .tripbox-popup.mapboxgl-popup-anchor-top .mapboxgl-popup-tip { border-bottom-color: #12122a; }
        .tripbox-popup.mapboxgl-popup-anchor-left .mapboxgl-popup-tip { border-right-color: #12122a; }
        .tripbox-popup.mapboxgl-popup-anchor-right .mapboxgl-popup-tip { border-left-color: #12122a; }
        @keyframes tripbox-drop-in {
          0%   { transform: translateY(-22px) scale(.5); opacity: 0; }
          60%  { transform: translateY(3px) scale(1.12); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .tripbox-marker-drop { animation: tripbox-drop-in .5s cubic-bezier(.22,.9,.32,1.2) both; }
        @media (prefers-reduced-motion: reduce) {
          .tripbox-marker-drop { animation: none; }
        }
      `}</style>

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
        onLoad={handleLoad}
        onError={onMapError}
        onClick={() => setSelectedId(null)}
        mapStyle={MAPBOX_DARK_STYLE}
        style={{ width: '100%', height: '100%' }}
        interactive={interactive}
        dragRotate={interactive}
        touchZoomRotate={interactive}
        attributionControl
        logoPosition="bottom-right"
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

        {points.map((p, idx) => (
          <Marker
            key={p.id}
            latitude={p.lat}
            longitude={p.lng}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setSelectedId(p.id)
            }}
          >
            <div
              className={p.id === dropInId ? 'tripbox-marker-drop' : undefined}
              style={{
                width: p.id === selectedId ? 34 : 30,
                height: p.id === selectedId ? 34 : 30,
                borderRadius: p.role === 'end' ? 9 : '50%',
                background: p.itemType === 'restaurant' ? '#fb7185' : p.itemType === 'stay' ? '#60a5fa' : p.role === 'end' ? '#a78bfa' : ACCENT,
                border: `3px solid ${p.id === selectedId ? '#ffffff' : '#0a1020'}`,
                boxShadow: p.id === selectedId ? '0 0 0 4px rgba(245,166,35,.24), 0 0 18px rgba(245,140,0,.7)' : '0 0 12px rgba(245,140,0,.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#0a1020',
                cursor: interactive ? 'pointer' : 'default',
                opacity: p.emphasis === 'dimmed' ? .35 : 1,
                transform: p.role === 'end' ? 'rotate(45deg)' : undefined,
                transition: reducedMotion ? 'none' : 'width 200ms ease, height 200ms ease, opacity 200ms ease',
              }}
            >
              <span style={{ transform: p.role === 'end' ? 'rotate(-45deg)' : undefined }}>{p.label ?? idx + 1}</span>
            </div>
          </Marker>
        ))}

        {userLocation && (
          <Marker latitude={userLocation.lat} longitude={userLocation.lng} anchor="center">
            <div aria-label="Your current location" style={{ width: 18, height: 18, borderRadius: '50%', background: '#38bdf8', border: '3px solid #fff', boxShadow: '0 0 0 6px rgba(56,189,248,.22)' }} />
          </Marker>
        )}

        {selectedPoint && (
          <Popup
            latitude={selectedPoint.lat}
            longitude={selectedPoint.lng}
            anchor="bottom"
            offset={18}
            closeButton
            closeOnClick={false}
            onClose={() => setSelectedId(null)}
            className="tripbox-popup"
          >
            <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 13, paddingRight: 12 }}>
              {selectedPoint.title ?? `Stop ${selectedPoint.label ?? ''}`}
            </div>
            {selectedPoint.subtitle && (
              <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11.5, marginTop: 2, paddingRight: 12 }}>{selectedPoint.subtitle}</div>
            )}
          </Popup>
        )}
      </Map>

      {interactive && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 44,
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'rgba(255,255,255,.055)',
            border: '1px solid rgba(255,255,255,.13)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <button onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in" style={zoomBtnStyle}>
            +
          </button>
          <div style={{ height: 1, background: 'rgba(255,255,255,.13)' }} />
          <button onClick={handleZoomOut} aria-label="Zoom out" title="Zoom out" style={zoomBtnStyle}>
            −
          </button>
        </div>
      )}
    </div>
  )
}
