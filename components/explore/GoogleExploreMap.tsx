'use client'

import { useEffect, useRef, useState } from 'react'
import { InlineError, tokens } from '@/components/mobile'
import type { GooglePlaceSearchResult } from '@/lib/google-places/types'

interface MapsEventListener { remove(): void }
interface LatLngBounds { extend(point: { lat: number; lng: number }): void }
interface GoogleMap { fitBounds(bounds: LatLngBounds, padding?: number): void }
interface GoogleMarker { setMap(map: GoogleMap | null): void; setIcon?(icon: unknown): void; addListener(event: string, handler: () => void): MapsEventListener }
interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap
  Marker: new (options: Record<string, unknown>) => GoogleMarker
  LatLngBounds: new () => LatLngBounds
  SymbolPath: { CIRCLE: unknown }
}
interface GoogleWindow extends Window { google?: { maps: GoogleMapsApi } }

let loader: Promise<GoogleMapsApi> | null = null
function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
    if (!key) { reject(new Error('missing-key')); return }
    const current = (window as GoogleWindow).google?.maps
    if (current) { resolve(current); return }
    const callback = `__tripperGoogleMapsReady${Date.now()}`
    const target = window as unknown as Record<string, unknown>
    target[callback] = () => {
      delete target[callback]
      const maps = (window as GoogleWindow).google?.maps
      if (maps) resolve(maps)
      else reject(new Error('load-failed'))
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${callback}&loading=async&v=weekly`
    script.async = true
    script.onerror = () => { delete target[callback]; reject(new Error('load-failed')) }
    document.head.appendChild(script)
  })
  return loader
}

export function GoogleExploreMap({ results, selectedPlaceId, queryKey, onSelectPlace, onFailure }: { results: GooglePlaceSearchResult[]; selectedPlaceId: string | null; queryKey: string; onSelectPlace: (placeId: string) => void; onFailure: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMap | null>(null)
  const markersRef = useRef<Array<{ marker: GoogleMarker; listener: MapsEventListener; placeId: string }>>([])
  const lastFitKey = useRef('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    loadGoogleMaps().then((maps) => {
      if (!active || !hostRef.current) return
      if (!mapRef.current) mapRef.current = new maps.Map(hostRef.current, { center: results[0] ? { lat: results[0].lat, lng: results[0].lng } : { lat: 20, lng: 0 }, zoom: results.length ? 12 : 2, streetViewControl: false, fullscreenControl: false, mapTypeControl: false, clickableIcons: false, gestureHandling: 'greedy' })
      for (const entry of markersRef.current) { entry.listener.remove(); entry.marker.setMap(null) }
      markersRef.current = results.map((place) => {
        const selected = place.placeId === selectedPlaceId
        const marker = new maps.Marker({ map: mapRef.current, position: { lat: place.lat, lng: place.lng }, title: place.name, icon: { path: maps.SymbolPath.CIRCLE, scale: selected ? 10 : 7, fillColor: selected ? '#f5a623' : '#4f46e5', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } })
        const listener = marker.addListener('click', () => onSelectPlace(place.placeId))
        return { marker, listener, placeId: place.placeId }
      })
      if (results.length && lastFitKey.current !== queryKey) {
        const bounds = new maps.LatLngBounds()
        results.forEach((place) => bounds.extend({ lat: place.lat, lng: place.lng }))
        mapRef.current.fitBounds(bounds, 56)
        lastFitKey.current = queryKey
      }
      setError(false)
    }).catch(() => { if (active) { setError(true); onFailure() } })
    return () => { active = false }
  }, [results, selectedPlaceId, queryKey, onSelectPlace, onFailure])

  useEffect(() => () => { for (const entry of markersRef.current) { entry.listener.remove(); entry.marker.setMap(null) } }, [])

  if (error) return <InlineError>Google Map could not load. The accessible list remains available.</InlineError>
  return <div ref={hostRef} aria-label="Map of Google place results. Use the list for an accessible alternative." style={{ width: '100%', height: 'min(58svh, 520px)', borderRadius: tokens.radius16, overflow: 'hidden', background: tokens.surfaceSolid }} />
}
