'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, Source, type MapRef } from 'react-map-gl/mapbox'
import type { FilterSpecification, StyleSpecification } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useReducedMotionPreference } from '@/components/motion/ReducedMotionProvider'
import { MAPBOX_TOKEN } from '@/lib/mapbox/client'
import { cameraForCountries, type SelectedTripCountry } from '@/lib/trip-country-selection'

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'space', type: 'background', paint: { 'background-color': '#08021A' } }],
}

const WORLDVIEW_FILTER: FilterSpecification = [
  'all',
  ['==', ['get', 'disputed'], 'false'],
  ['any', ['==', ['get', 'worldview'], 'all'], ['in', 'TR', ['get', 'worldview']]],
]

function countryFilter(codes: string[]): FilterSpecification {
  return [
    'all',
    ...WORLDVIEW_FILTER.slice(1),
    ['in', ['get', 'iso_3166_1'], ['literal', codes]],
  ] as FilterSpecification
}

function MapFallback({ missingToken = false }: { missingToken?: boolean }) {
  return (
    <div role="status" style={{ minHeight: 216, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', background: 'radial-gradient(circle at 50% 38%, rgba(96,52,180,.2), transparent 55%), #08021A' }}>
      <div>
        <div aria-hidden="true" style={{ width: 90, height: 90, margin: '0 auto 14px', borderRadius: '50%', border: '1px solid rgba(174,134,255,.35)', background: 'radial-gradient(circle at 35% 28%, rgba(119,78,210,.48), rgba(21,10,53,.88) 58%, #08021A)', boxShadow: '0 0 34px rgba(100,55,210,.22)', position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', inset: '19px -8px', border: '1px solid rgba(195,168,255,.22)', borderRadius: '50%' }} />
          <span style={{ position: 'absolute', inset: '-8px 29px', border: '1px solid rgba(195,168,255,.22)', borderRadius: '50%' }} />
        </div>
        <strong style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,.72)' }}>Map preview unavailable</strong>
        <span style={{ display: 'block', maxWidth: 250, marginTop: 5, fontSize: 11, lineHeight: 1.45, color: 'rgba(218,207,255,.4)' }}>
          {missingToken ? 'Add the Mapbox environment variable to enable the interactive globe.' : 'You can still choose a country and continue.'}
        </span>
      </div>
    </div>
  )
}

export function CountryGlobe({ countries, activeCountryCode }: {
  countries: SelectedTripCountry[]
  activeCountryCode: string | null
}) {
  const reducedMotion = useReducedMotionPreference()
  const mapRef = useRef<MapRef | null>(null)
  const rotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [outlineMissing, setOutlineMissing] = useState(false)
  const selectedCodes = useMemo(() => countries.map((country) => country.code), [countries])
  const selectedKey = selectedCodes.join(',')

  const clearTimers = useCallback(() => {
    if (rotationTimerRef.current) clearTimeout(rotationTimerRef.current)
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    rotationTimerRef.current = null
    resumeTimerRef.current = null
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  useEffect(() => {
    if (loaded || failed || !MAPBOX_TOKEN) return
    const timeout = setTimeout(() => setFailed(true), 10000)
    return () => clearTimeout(timeout)
  }, [failed, loaded])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !loaded || failed) return
    map.stop()

    if (countries.length === 0) {
      map.easeTo({ center: [8, 18], zoom: 1.15, duration: reducedMotion ? 0 : 650, essential: false })
      setOutlineMissing(false)
      return
    }

    const camera = cameraForCountries(countries)
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      pitch: 0,
      bearing: 0,
      duration: reducedMotion ? 0 : 1250,
      easing: (value) => 1 - Math.pow(1 - value, 3),
      essential: false,
    })

    const check = setTimeout(() => {
      try {
        const features = map.querySourceFeatures('trip-country-boundaries', {
          sourceLayer: 'country_boundaries',
          filter: countryFilter(selectedCodes),
        })
        setOutlineMissing(features.length === 0)
      } catch {
        setOutlineMissing(true)
      }
    }, reducedMotion ? 250 : 1500)
    return () => clearTimeout(check)
  }, [countries, failed, loaded, reducedMotion, selectedCodes, selectedKey])

  useEffect(() => {
    clearTimers()
    const map = mapRef.current?.getMap()
    if (!map || !loaded || failed || reducedMotion || interacting || countries.length > 0) return

    const rotate = () => {
      if (!mapRef.current) return
      const center = map.getCenter()
      map.easeTo({
        center: [center.lng - 12, center.lat],
        duration: 1000,
        easing: (value) => value,
        essential: false,
      })
      rotationTimerRef.current = setTimeout(rotate, 1000)
    }
    rotate()
    return clearTimers
  }, [clearTimers, countries.length, failed, interacting, loaded, reducedMotion])

  const pauseInteraction = useCallback(() => {
    clearTimers()
    setInteracting(true)
  }, [clearTimers])

  const resumeInteraction = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => setInteracting(false), 2500)
  }, [])

  if (!MAPBOX_TOKEN) return <MapFallback missingToken />
  if (failed) return <MapFallback />

  const activeFilter = activeCountryCode ? countryFilter([activeCountryCode]) : countryFilter([])

  return (
    <div className="country-globe" style={{ height: 216, position: 'relative', overflow: 'hidden', background: '#08021A' }}>
      <style>{`
        .country-globe .mapboxgl-canvas { outline: none; }
        .country-globe .mapboxgl-ctrl-logo { transform: scale(.62); transform-origin: bottom left; opacity: .68; }
        .country-globe .mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-attrib { background: rgba(8,2,26,.64); color: rgba(255,255,255,.5); font-size: 8px; }
        .country-globe .mapboxgl-ctrl-attrib a { color: rgba(255,255,255,.55) !important; }
        .country-globe .mapboxgl-ctrl-attrib-button { filter: invert(1) brightness(1.6); }
      `}</style>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        projection="globe"
        initialViewState={{ latitude: 18, longitude: 8, zoom: 1.15, bearing: 0, pitch: 0 }}
        minZoom={0.5}
        maxZoom={7}
        maxPitch={0}
        attributionControl
        logoPosition="bottom-left"
        scrollZoom={false}
        boxZoom={false}
        dragRotate
        touchPitch={false}
        cooperativeGestures
        onLoad={() => {
          const map = mapRef.current?.getMap()
          map?.setFog({
            color: 'rgba(89,45,150,.22)',
            'high-color': 'rgba(91,48,178,.38)',
            'space-color': '#08021A',
            'horizon-blend': 0.12,
            'star-intensity': 0,
          })
          setLoaded(true)
        }}
        onError={() => setFailed(true)}
        onDragStart={pauseInteraction}
        onDragEnd={resumeInteraction}
        onZoomStart={pauseInteraction}
        onZoomEnd={resumeInteraction}
        style={{ width: '100%', height: '100%' }}
      >
        <Source id="trip-country-boundaries" type="vector" url="mapbox://mapbox.country-boundaries-v1">
          <Layer
            id="trip-country-land"
            source-layer="country_boundaries"
            type="fill"
            filter={WORLDVIEW_FILTER}
            paint={{ 'fill-color': '#150A35', 'fill-opacity': 0.94 }}
          />
          <Layer
            id="trip-country-borders"
            source-layer="country_boundaries"
            type="line"
            filter={WORLDVIEW_FILTER}
            paint={{ 'line-color': '#6F4BB0', 'line-width': 0.55, 'line-opacity': 0.34 }}
          />
          <Layer
            id="trip-country-selected-fill"
            source-layer="country_boundaries"
            type="fill"
            filter={countryFilter(selectedCodes)}
            paint={{ 'fill-color': '#D16830', 'fill-opacity': 0.5 }}
          />
          <Layer
            id="trip-country-selected-glow"
            source-layer="country_boundaries"
            type="line"
            filter={countryFilter(selectedCodes)}
            paint={{ 'line-color': '#F59E0B', 'line-width': 4.5, 'line-opacity': 0.2, 'line-blur': 2.5 }}
          />
          <Layer
            id="trip-country-selected-border"
            source-layer="country_boundaries"
            type="line"
            filter={countryFilter(selectedCodes)}
            paint={{ 'line-color': '#FFB21C', 'line-width': 1.8, 'line-opacity': 0.88 }}
          />
          <Layer
            id="trip-country-active-border"
            source-layer="country_boundaries"
            type="line"
            filter={activeFilter}
            paint={{ 'line-color': '#FFD166', 'line-width': 2.8, 'line-opacity': 1 }}
          />
        </Source>
      </Map>

      {!loaded && (
        <div role="status" aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#08021A', color: 'rgba(224,214,255,.55)', fontSize: 12 }}>
          Loading globe…
        </div>
      )}
      {outlineMissing && loaded && (
        <div role="status" style={{ position: 'absolute', left: 10, top: 10, padding: '6px 9px', borderRadius: 9, background: 'rgba(8,2,26,.76)', border: '1px solid rgba(245,158,11,.2)', color: 'rgba(255,220,155,.72)', fontSize: 10, pointerEvents: 'none' }}>
          Country outline unavailable
        </div>
      )}
    </div>
  )
}
