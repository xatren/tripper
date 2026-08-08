'use client'

import { useMemo, useRef, useEffect, useCallback, useState, type CSSProperties } from 'react'
import Map, { Marker, Popup, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAPBOX_DARK_STYLE, DEFAULT_PITCH, DEFAULT_BEARING, BUILDING_EXTRUSION_LAYER } from '@/lib/mapbox/client'
import { applyAppTheme, hideBaseMapLabels } from '@/lib/mapbox/theme'
import { declutterWaypoints, type DeclutterResult, type WaypointCluster } from '@/lib/map-pins'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'

const ACCENT = '#f5a623'
/** Muted purple-grey: a waypoint is on the route but is not a place the trip stops for. */
const WAYPOINT_COLOR = '#77779a'

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
  /**
   * Where this point sits in the stop hierarchy: an `overnight` stay defines a
   * trip day and gets the large, day-numbered pin; a `waypoint` is driven
   * through and gets a small unlabeled dot underneath it.
   */
  kind?: 'overnight' | 'waypoint'
  /**
   * Superseded by `kind`, kept so callers that predate it keep rendering. When
   * both are given `kind` wins — it carries the real meaning, while `compact`
   * only ever said "draw this one smaller".
   */
  compact?: boolean
  markerColor?: string
  /** True when an overnight stay's projected day falls past the trip's dates — still a real stay, drawn dashed/faded instead of hidden or silently unlabeled. */
  beyondDates?: boolean
}

/**
 * `kind` is the source of truth; `compact` is read only as a fallback. Neither
 * given means a caller with no notion of stop nights — a day's activity pins,
 * for one — which keeps the full-size numbered treatment it has always had.
 */
function resolvePinKind(point: TripboxMapPoint): 'overnight' | 'waypoint' {
  if (point.kind) return point.kind
  return point.compact ? 'waypoint' : 'overnight'
}

export interface TripboxMapPadding {
  top: number
  right: number
  bottom: number
  left: number
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
  fitPadding?: number | TripboxMapPadding
  fitRequestNonce?: number
  showZoomControls?: boolean
  /** Hide stock place/road labels when the map is a decorative UI backdrop. */
  hideBaseLabels?: boolean
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

export function TripboxMap({ points, routePath = [], interactive = true, className, defaultCenter, defaultZoom = 9, dropInId = null, selectedItemId, onSelectItem, cameraTarget, userLocation, onMapError, fitPadding = 60, fitRequestNonce = 0, showZoomControls = true, hideBaseLabels = false }: TripboxMapProps) {
  const reducedMotion = useReducedMotionPreference()
  const mapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  // Bumped whenever the camera settles, to re-measure the on-screen pin spacing.
  const [cameraNonce, setCameraNonce] = useState(0)
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
  const fitPaddingKey = typeof fitPadding === 'number'
    ? String(fitPadding)
    : `${fitPadding.top},${fitPadding.right},${fitPadding.bottom},${fitPadding.left}`

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
        { padding: fitPadding, maxZoom: 13, duration: reducedMotion ? 0 : duration, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING }
      )
    },
    [fitPadding, points, reducedMotion]
  )

  useEffect(() => {
    fitToPoints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, fitPaddingKey])

  useEffect(() => {
    if (fitRequestNonce > 0) fitToPoints(500)
  }, [fitRequestNonce, fitToPoints])

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
      const applyBackdropTheme = () => {
        applyAppTheme(map)
        if (hideBaseLabels) hideBaseMapLabels(map)
      }
      applyBackdropTheme()
      map.on('style.load', applyBackdropTheme)
    }
    fitToPoints()
    setCameraNonce((nonce) => nonce + 1)
  }, [fitToPoints, hideBaseLabels])

  const handleMoveEnd = useCallback(() => setCameraNonce((nonce) => nonce + 1), [])

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

  // Markers paint in array order, so a 13px waypoint listed last would sit on
  // top of a 38px stay. Waypoints go down first and stays cover them. The
  // original array position rides along: the `label ?? position` fallback still
  // means "this point's place on the route", not "its place in the paint queue".
  const paintOrder = useMemo(
    () => points
      .map((point, index) => ({ point, index, kind: resolvePinKind(point) }))
      .sort((a, b) => (a.kind === b.kind ? a.index - b.index : a.kind === 'waypoint' ? -1 : 1)),
    [points],
  )

  // Dense waypoints pile into one smudge at low zoom, so they're grouped by the
  // pixel distance between them and redrawn as a "+N" bubble. Measured in an
  // effect rather than during render because it has to read the live camera off
  // the map instance. It re-runs once the camera settles: panning shifts every
  // point equally, but zoom, pitch, and bearing all change the gaps. Until the
  // first measurement lands there is nothing to project against, so every pin
  // draws on its own — the same fallback used if projection throws.
  const [declutter, setDeclutter] = useState<DeclutterResult | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      setDeclutter(null)
      return
    }
    try {
      setDeclutter(declutterWaypoints(paintOrder.map(({ point, kind }) => {
        const { x, y } = map.project([point.lng, point.lat])
        return { x, y, kind, pinned: point.id === selectedId || point.id === dropInId }
      })))
    } catch {
      // A camera mid-transform can refuse to project; showing every pin is the safe miss.
      setDeclutter(null)
    }
  }, [cameraNonce, dropInId, paintOrder, selectedId])

  const hiddenSlots = useMemo(() => new Set(declutter?.hiddenIndexes ?? []), [declutter])
  // A sparse array keyed by paint slot: `Map` here is react-map-gl's component.
  const clusterBySlot = useMemo(() => {
    const bySlot: (WaypointCluster | undefined)[] = []
    for (const cluster of declutter?.clusters ?? []) bySlot[cluster.leadIndex] = cluster
    return bySlot
  }, [declutter])

  /** Opening a bubble means getting closer to it — the group dissolves on its own. */
  const expandCluster = useCallback((lat: number, lng: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ center: [lng, lat], zoom: map.getZoom() + 2, duration: reducedMotion ? 0 : 320 })
  }, [reducedMotion])

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
        onMoveEnd={handleMoveEnd}
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

        {paintOrder.map(({ point: p, index, kind }, slot) => {
          if (hiddenSlots.has(slot)) return null
          const cluster = clusterBySlot[slot]
          if (cluster) {
            const count = cluster.memberIndexes.length
            return (
              <Marker
                key={p.id}
                latitude={p.lat}
                longitude={p.lng}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation()
                  expandCluster(p.lat, p.lng)
                }}
              >
                <div
                  role={interactive ? 'button' : undefined}
                  aria-label={interactive ? `${count} nearby stops. Zoom in to separate them.` : undefined}
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: 'rgba(119,119,154,.92)',
                    border: '1.5px solid #0a1020',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: interactive ? 'pointer' : 'default',
                  }}
                >
                  +{count}
                </div>
              </Marker>
            )
          }
          const selected = p.id === selectedId
          const waypoint = kind === 'waypoint'
          const size = waypoint ? (selected ? 22 : 13) : (selected ? 38 : 32)
          // The terminal diamond is a stay affordance: it needs the thick
          // border and the day badge to read as one. Start and end share it so
          // the two ends of a route read as one visual language; a waypoint
          // that happens to open or close the route stays a plain dot rather
          // than a 13px lozenge.
          const terminal = !waypoint && (p.role === 'start' || p.role === 'end')
          // A caller that declares `kind` owns its labels, so an explicit null
          // means "no badge" — only legacy callers fall back to route position.
          const label = p.kind ? p.label : p.label ?? index + 1
          // A stay past the trip's dates (see stopBeyondDates in lib/map-pins.ts)
          // still holds a night, so it can't shrink to a waypoint dot, but a
          // plain full pin would look identical to any other stay.
          const unresolvedOvernight = !waypoint && p.beyondDates === true
          return (
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
                width: size,
                height: size,
                borderRadius: terminal ? 9 : '50%',
                background: p.markerColor ?? (p.itemType === 'restaurant' ? '#fb7185' : p.itemType === 'stay' ? '#60a5fa' : waypoint ? WAYPOINT_COLOR : terminal ? '#a78bfa' : ACCENT),
                border: `${waypoint ? 1.5 : 3}px ${unresolvedOvernight ? 'dashed' : 'solid'} ${selected ? '#ffffff' : unresolvedOvernight ? '#ef4444' : '#0a1020'}`,
                // Glow marks a stay at rest; a waypoint stays flat so it recedes.
                // Selection keeps its ring on both, so a tapped dot reads as tapped.
                boxShadow: selected ? '0 0 0 4px rgba(245,166,35,.24), 0 0 18px rgba(245,140,0,.7)' : waypoint ? 'none' : '0 0 12px rgba(245,140,0,.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#0a1020',
                cursor: interactive ? 'pointer' : 'default',
                // An unresolved overnight is still a real stay (never hidden),
                // but faded so it visibly differs from a placed day rather than
                // looking like an ordinary pin that lost its number.
                opacity: p.emphasis === 'dimmed' ? .35 : unresolvedOvernight ? .55 : 1,
                transform: terminal ? 'rotate(45deg)' : undefined,
                transition: reducedMotion ? 'none' : 'width 200ms ease, height 200ms ease, opacity 200ms ease',
              }}
            >
              {!waypoint && label != null && (
                <span style={{ transform: terminal ? 'rotate(-45deg)' : undefined }}>{label}</span>
              )}
              {unresolvedOvernight && (
                <span style={{ transform: terminal ? 'rotate(-45deg)' : undefined }} aria-hidden="true">!</span>
              )}
            </div>
          </Marker>
          )
        })}

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

      {interactive && showZoomControls && (
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
