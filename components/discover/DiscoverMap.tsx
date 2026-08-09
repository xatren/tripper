'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { type MapMouseEvent, type MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAPBOX_DARK_STYLE } from '@/lib/mapbox/client'
import { applyAppTheme } from '@/lib/mapbox/theme'
import { cameraForCountries, type CountryOption } from '@/lib/trip-country-selection'
import { discoverCategory, type DiscoverCategoryId } from '@/lib/discover/categories'
import type { DiscoverPlace } from '@/lib/discover/discover-places.generated'
import type { DiscoverRoute } from '@/lib/discover/discover-routes.generated'
import {
  boundsForPlaces,
  placesToFeatureCollection,
  routesToLineFeatureCollection,
  shouldRefitCamera,
  type DiscoverRouteLineFeatureCollection,
} from '@/lib/discover/discover-query'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'
import {
  DISCOVER_CLUSTER_LAYER,
  DISCOVER_INTERACTIVE_LAYERS,
  DISCOVER_PLACES_SOURCE,
  DISCOVER_ROUTE_INTERACTIVE_LAYERS,
  DiscoverMapLayers,
} from './DiscoverMapLayers'

const EMPTY_ROUTE_COLLECTION: DiscoverRouteLineFeatureCollection = { type: 'FeatureCollection', features: [] }

export interface DiscoverMapPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface DiscoverMapViewport {
  lat: number
  lng: number
  zoom: number
}

export interface DiscoverMapProps {
  /** The country in focus. Null frames the whole world, which is the "pick a country" state. */
  country: CountryOption | null
  /** Keeps the framed country clear of the floating sheet and top bar. */
  fitPadding: DiscoverMapPadding
  /** Places for the active category, already filtered and rank-ordered. Empty when `category` is `routes`. */
  places: readonly DiscoverPlace[]
  /** Routes for the active category (§9 Phase 7), country-filtered. Empty outside `category === 'routes'`. */
  routes?: readonly DiscoverRoute[]
  category: DiscoverCategoryId
  selectedPlaceId: string | null
  /** Desktop rail only (§13): hovering a card previews its pin. */
  hoveredPlaceId?: string | null
  /** Called with null when the user taps empty map, which clears the selection. */
  onSelectPlace?: (id: string | null) => void
  onMapError?: () => void
  /**
   * Debounced 400 ms after the map settles (§4.3/§14): the viewport itself is
   * never React state — this fires only often enough for the live-layer zoom
   * gate and the "Search this area" button to know where the map is now.
   */
  onViewportSettle?: (viewport: DiscoverMapViewport) => void
}

/** Camera ceiling when framing a category's results; closer than this stops being a country view. */
const RESULTS_MAX_ZOOM = 9

/** Matches the moveend debounce GooglePlacesExplorer uses for its own search input, applied here to viewport settling instead (§14). */
const VIEWPORT_SETTLE_DEBOUNCE_MS = 400

/**
 * The Discover canvas: a full-bleed dark map framed on one country, with the
 * active category's places as a clustered GeoJSON source.
 *
 * A sibling of TripboxMap rather than a variant of it — a country view is flat
 * (pitch 0, no rotation, no building extrusions) where a route view is pitched
 * and 3D, and the two share primitives (`lib/mapbox/*`) instead of a prop union.
 */
export function DiscoverMap({
  country,
  fitPadding,
  places,
  routes = [],
  category,
  selectedPlaceId,
  hoveredPlaceId,
  onSelectPlace,
  onMapError,
  onViewportSettle,
}: DiscoverMapProps) {
  const reducedMotion = useReducedMotionPreference()
  const mapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [labelLayerId, setLabelLayerId] = useState<string | undefined>(undefined)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onViewportSettleRef = useRef(onViewportSettle)
  useEffect(() => { onViewportSettleRef.current = onViewportSettle }, [onViewportSettle])

  const camera = useMemo(
    () => cameraForCountries(country ? [{ ...country, selectionOrder: 0 }] : []),
    [country],
  )
  const highlightCodes = useMemo(() => (country ? [country.code] : []), [country])
  const markerColor = discoverCategory(category).markerColor
  const collection = useMemo(() => placesToFeatureCollection(places, category), [places, category])
  const isRouteCategory = category === 'routes'
  const routeCollection = useMemo(
    () => (isRouteCategory ? routesToLineFeatureCollection(routes) : EMPTY_ROUTE_COLLECTION),
    [isRouteCategory, routes],
  )
  const interactiveLayerIds = isRouteCategory ? DISCOVER_ROUTE_INTERACTIVE_LAYERS : DISCOVER_INTERACTIVE_LAYERS

  const paddingKey = `${fitPadding.top},${fitPadding.right},${fitPadding.bottom},${fitPadding.left}`
  const placesKey = `${category}:${places.map((place) => place.id).join(',')}`
  // The line layer has no `rank`/pin count to cap, so every waypoint of every
  // filtered route feeds the same dateline-safe bounds math places already use.
  const routeWaypoints = useMemo(
    () => (isRouteCategory ? routes.flatMap((route) => route.waypoints) : []),
    [isRouteCategory, routes],
  )
  const routesKey = `routes:${routes.map((route) => route.id).join(',')}`

  // A tapped card moves the camera, and that move must not re-trigger the results
  // fit — otherwise selecting a place fights the layer framing.
  const selectionMovedCamera = useRef(false)
  const paddingRef = useRef(fitPadding)
  useEffect(() => {
    paddingRef.current = fitPadding
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paddingKey])

  // Country framing. Padding is read from the ref rather than the dep list so a
  // sheet resize cannot re-trigger a country flight.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      pitch: 0,
      bearing: 0,
      padding: paddingRef.current,
      duration: reducedMotion ? 0 : 900,
      essential: false,
    })
  }, [camera, loaded, reducedMotion])

  // A sheet level change reframes the *same* view: padding only, never centre.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    map.easeTo({ padding: fitPadding, duration: reducedMotion ? 0 : 320, essential: false })
    // paddingKey is the stable identity of the inline object the owner passes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paddingKey, loaded, reducedMotion])

  // Category results. Refits only when the new set is mostly off-screen (§4.2),
  // so a user who deliberately zoomed into one region keeps their view.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || isRouteCategory || places.length === 0) return
    if (selectionMovedCamera.current) {
      selectionMovedCamera.current = false
      return
    }

    const current = map.getBounds()
    const viewport = current
      ? { west: current.getWest(), south: current.getSouth(), east: current.getEast(), north: current.getNorth() }
      : null
    if (!shouldRefitCamera(places, viewport)) return

    const bounds = boundsForPlaces(places)
    if (!bounds) return
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: paddingRef.current, maxZoom: RESULTS_MAX_ZOOM, duration: reducedMotion ? 0 : 700 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, isRouteCategory, loaded, reducedMotion])

  // The `routes` category's analogue of the effect above: frames every
  // filtered route's waypoints together, same refit-only-if-mostly-offscreen
  // rule, so switching into Road Trips doesn't fight a deliberate zoom either.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !isRouteCategory || routeWaypoints.length === 0) return
    if (selectionMovedCamera.current) {
      selectionMovedCamera.current = false
      return
    }

    const current = map.getBounds()
    const viewport = current
      ? { west: current.getWest(), south: current.getSouth(), east: current.getEast(), north: current.getNorth() }
      : null
    if (!shouldRefitCamera(routeWaypoints, viewport)) return

    const bounds = boundsForPlaces(routeWaypoints)
    if (!bounds) return
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: paddingRef.current, maxZoom: RESULTS_MAX_ZOOM, duration: reducedMotion ? 0 : 700 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesKey, isRouteCategory, loaded, reducedMotion])

  // Selection nudges the pin above the sheet rather than centring it behind one.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || isRouteCategory || !selectedPlaceId) return
    const place = places.find((candidate) => candidate.id === selectedPlaceId)
    if (!place) return

    selectionMovedCamera.current = true
    map.easeTo({
      center: [place.lng, place.lat],
      zoom: Math.max(map.getZoom(), 10),
      offset: [0, -Math.round(paddingRef.current.bottom / 2)],
      duration: reducedMotion ? 0 : 600,
      essential: false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceId, isRouteCategory, loaded, reducedMotion])

  // A selected route fits its own bounds rather than centring one point — the
  // whole polyline is the thing being previewed, not a single waypoint.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !isRouteCategory || !selectedPlaceId) return
    const route = routes.find((candidate) => candidate.id === selectedPlaceId)
    if (!route) return
    const bounds = boundsForPlaces(route.waypoints)
    if (!bounds) return

    selectionMovedCamera.current = true
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: paddingRef.current, maxZoom: RESULTS_MAX_ZOOM, duration: reducedMotion ? 0 : 600 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceId, isRouteCategory, loaded, reducedMotion])

  // Keep the WebGL canvas following its container without touching the camera —
  // the same contract as TripboxMap, so a growing sheet never resets the view.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(() => mapRef.current?.resize())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const theme = () => applyAppTheme(map)
    theme()
    // dark-v11 can swap its style sheet at runtime; re-theming on reload keeps
    // the palette from snapping back to stock Mapbox mid-session.
    map.on('style.load', theme)

    // Debounced 400 ms after the map stops moving (§4.3, §14) — never on every
    // frame, and never turned into a value this component re-renders on itself.
    // Subscribed imperatively via `map.on`, the same proven pattern as
    // `style.load` above, rather than react-map-gl's declarative `onMoveEnd`
    // prop — that path is untested elsewhere in this codebase and every other
    // map/event wiring here already goes through the native mapbox-gl API.
    map.on('moveend', () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
      settleTimer.current = setTimeout(() => {
        const center = map.getCenter()
        onViewportSettleRef.current?.({ lat: center.lat, lng: center.lng, zoom: map.getZoom() })
      }, VIEWPORT_SETTLE_DEBOUNCE_MS)
    })

    setLabelLayerId(map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id)
    setLoaded(true)
    // Seeds the live-layer zoom gate immediately, so a cold open on a live
    // `?cat=` deep link (§15 case 17) doesn't wait for the user to pan first.
    // Deferred one microtask for the same reason as handleError below — onLoad
    // can fire synchronously from within a child's mount effect.
    const center = map.getCenter()
    const zoom = map.getZoom()
    queueMicrotask(() => onViewportSettleRef.current?.({ lat: center.lat, lng: center.lng, zoom }))
  }, [])

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  // react-map-gl can fire 'error' synchronously from inside a Source/Layer's own
  // mount effect (e.g. a style/layer reload mid-render), which lands the owner's
  // setMapFailed call mid-render for a sibling component — "Cannot update a
  // component while rendering a different component". Deferring one microtask
  // moves the state update off that call stack without changing when the
  // fallback UI appears (still effectively immediate).
  const handleError = useCallback(() => {
    queueMicrotask(() => onMapError?.())
  }, [onMapError])

  const handleClick = useCallback(
    (event: MapMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature) {
        onSelectPlace?.(null)
        return
      }

      if (feature.layer?.id === DISCOVER_CLUSTER_LAYER) {
        const map = mapRef.current?.getMap()
        const source = map?.getSource(DISCOVER_PLACES_SOURCE)
        const clusterId = feature.properties?.cluster_id
        // getClusterExpansionZoom is the only way to open a cluster without
        // guessing a zoom that leaves it stubbornly clustered.
        if (!map || !source || typeof clusterId !== 'number' || !('getClusterExpansionZoom' in source)) return
        source.getClusterExpansionZoom(clusterId, (error: unknown, zoom: number | null | undefined) => {
          if (error || zoom == null) return
          const geometry = feature.geometry
          if (geometry.type !== 'Point') return
          const [lng, lat] = geometry.coordinates
          map.easeTo({ center: [lng, lat], zoom, duration: reducedMotion ? 0 : 500 })
        })
        return
      }

      const id = feature.properties?.id
      onSelectPlace?.(typeof id === 'string' ? id : null)
    },
    [onSelectPlace, reducedMotion],
  )

  if (!MAPBOX_TOKEN) return null

  return (
    <div ref={containerRef} className="discover-map" style={{ position: 'relative', width: '100%', height: '100%', background: '#06061c' }}>
      <style>{`
        .discover-map .mapboxgl-ctrl-logo { transform: scale(.7); transform-origin: bottom left; opacity: .75; }
        .discover-map .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-attrib {
          background: rgba(10,10,26,.55); backdrop-filter: blur(6px); border-radius: 8px; font-size: 10px; padding: 0 6px;
        }
        .discover-map .mapboxgl-ctrl-attrib a { color: rgba(255,255,255,.55) !important; }
        .discover-map .mapboxgl-ctrl-attrib-button { filter: invert(1) brightness(1.6); }
        .discover-map .mapboxgl-ctrl-bottom-right { display: flex; align-items: center; gap: 4px; }
      `}</style>

      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_DARK_STYLE}
        projection="globe"
        initialViewState={{
          latitude: camera.latitude,
          longitude: camera.longitude,
          zoom: camera.zoom,
          pitch: 0,
          bearing: 0,
        }}
        minZoom={0.8}
        maxPitch={0}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        attributionControl
        logoPosition="bottom-right"
        interactiveLayerIds={interactiveLayerIds}
        onLoad={handleLoad}
        onError={handleError}
        onClick={handleClick}
        style={{ width: '100%', height: '100%' }}
      >
        <DiscoverMapLayers
          highlightCodes={highlightCodes}
          beforeId={labelLayerId}
          places={collection}
          routes={routeCollection}
          markerColor={markerColor}
          selectedPlaceId={selectedPlaceId}
          hoveredPlaceId={hoveredPlaceId}
        />
      </Map>
    </div>
  )
}
