'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronUp, Layers3, List, LocateFixed, MapPinned, Navigation, X } from 'lucide-react'
import { DeferredBoundary, DeferredFailure } from '@/components/ui/deferred-boundary'
import type { TripboxMapPoint } from '@/components/map/mapbox/TripboxMap'
import { MAPBOX_TOKEN } from '@/lib/mapbox/client'
import { getMapAvailability, type OtherDayVisibility } from './trip-map-model'
import { DUSK } from '@/components/design/tokens'

function TripMapPlaceholder() {
  return <div role="status" aria-label="Loading trip map" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 10%, #12123a 0%, #0a0a28 55%, #06061c 100%)' }} />
}

const controlStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(10,10,26,.72)', backdropFilter: 'blur(18px)', color: DUSK.textPrimary,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(0,0,0,.28)',
}

export interface TripMapDomainProps {
  points: TripboxMapPoint[]
  routePath: { lat: number; lng: number }[]
  defaultCenter?: { lat: number; lng: number }
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  onBack: () => void
  onListToggle: () => void
  routeSummary: string
  activeDayLabel?: string
  otherDays: OtherDayVisibility
  onOtherDaysChange: (value: OtherDayVisibility) => void
  dropInId?: string | null
}

export function TripMapDomain(props: TripMapDomainProps) {
  const [MapComponent, setMapComponent] = useState<typeof import('@/components/map/mapbox/TripboxMap').TripboxMap | null>(null)
  const [mapLoadFailed, setMapLoadFailed] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'denied' | 'unavailable'>('idle')
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; nonce: number } | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  // Keep the first client render identical to SSR. Reading navigator.onLine
  // during state initialization made an offline browser insert its status card
  // before React hydrated the server tree.
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let current = true
    import('@/components/map/mapbox/TripboxMap')
      .then((module) => { if (current) setMapComponent(() => module.TripboxMap) })
      .catch(() => { if (current) setMapLoadFailed(true) })
    return () => { current = false }
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (sessionStorage.getItem('tripper:location-denied') === '1') setLocationState('denied')
  }, [])

  const requestLocation = useCallback(() => {
    if (locationState === 'loading') return
    if (!('geolocation' in navigator)) {
      setLocationState('unavailable')
      return
    }
    setLocationState('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude }
        setUserLocation(next)
        setCameraTarget({ ...next, nonce: Date.now() })
        setLocationState('idle')
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          sessionStorage.setItem('tripper:location-denied', '1')
          setLocationState('denied')
        } else setLocationState('unavailable')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [locationState])

  const unavailableLayers = ['Restaurants', 'Gas', 'Charging', 'Hotels', 'Camping', 'Scenic']
  const availability = getMapAvailability({ hasToken: Boolean(MAPBOX_TOKEN), online, failed: mapLoadFailed })
  const availabilityMessage = availability === 'no-token'
    ? 'Map token is not configured. Your itinerary is still available.'
    : availability === 'offline'
      ? 'You are offline. Your itinerary is still available.'
      : availability === 'error'
        ? 'The map could not load. Your itinerary is still available.'
        : null

  return (
    <div style={{ position: 'absolute', inset: 0, background: DUSK.night }}>
      <DeferredBoundary label="the trip map" style={{ position: 'absolute', inset: 0 }}>
        {mapLoadFailed ? (
          <DeferredFailure label="the trip map" onRetry={() => window.location.reload()} style={{ position: 'absolute', inset: 0 }} />
        ) : MapComponent ? (
          <MapComponent
            points={props.points}
            routePath={props.routePath}
            defaultCenter={props.defaultCenter}
            defaultZoom={5}
            dropInId={props.dropInId}
            selectedItemId={props.selectedItemId}
            onSelectItem={props.onSelectItem}
            cameraTarget={cameraTarget}
            userLocation={userLocation}
            onMapError={() => setMapLoadFailed(true)}
          />
        ) : <TripMapPlaceholder />}
      </DeferredBoundary>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(6,6,28,.25), transparent 24%, transparent 78%, rgba(6,6,28,.65) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'var(--glow-sunset)' }} />

      {availabilityMessage && <div role="status" style={{ position: 'absolute', left: 16, right: 16, top: 'calc(max(16px, env(safe-area-inset-top)) + 108px)', zIndex: 4, padding: '10px 12px', borderRadius: 12, background: 'rgba(10,10,26,.86)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.72)', fontSize: 12, textAlign: 'center' }}>{availabilityMessage}</div>}

      <div style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 16, zIndex: 4, display: 'flex', gap: 8 }}>
        <button type="button" onClick={props.onBack} aria-label="Back to overview" style={controlStyle}><Navigation size={19} style={{ transform: 'rotate(-90deg)' }} /></button>
        <button type="button" onClick={props.onListToggle} aria-label="Toggle trip list" style={controlStyle}><List size={20} /></button>
      </div>

      <div style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" onClick={() => setLayersOpen(true)} aria-label="Map layers" style={controlStyle}><Layers3 size={20} /></button>
        <button type="button" onClick={requestLocation} disabled={locationState === 'denied'} aria-label={locationState === 'denied' ? 'Location permission denied' : 'Show current location'} style={{ ...controlStyle, opacity: locationState === 'denied' ? .5 : 1 }}><LocateFixed size={20} /></button>
      </div>

      <div aria-live="polite" style={{ position: 'absolute', top: 'calc(max(16px, env(safe-area-inset-top)) + 54px)', left: '50%', transform: 'translateX(-50%)', zIndex: 3, maxWidth: 'calc(100% - 144px)', minHeight: 36, padding: '8px 12px', borderRadius: 999, background: 'rgba(10,10,26,.72)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(16px)', color: DUSK.textPrimary, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <MapPinned size={15} color="#f5a623" aria-hidden="true" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{props.activeDayLabel ? `${props.activeDayLabel} · ` : ''}{props.routeSummary}</span>
      </div>

      {locationState === 'denied' && <div role="status" style={{ position: 'absolute', right: 16, top: 'calc(max(16px, env(safe-area-inset-top)) + 104px)', zIndex: 4, maxWidth: 190, padding: '8px 10px', borderRadius: 10, background: 'rgba(10,10,26,.84)', color: 'rgba(255,255,255,.72)', fontSize: 11.5 }}>Location is off. Enable it in browser settings to recenter.</div>}

      {layersOpen && (
        <div role="dialog" aria-modal="false" aria-label="Map layers" style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, zIndex: 6, width: 'min(290px, calc(100% - 32px))', padding: 14, borderRadius: 20, background: 'rgba(10,10,26,.9)', border: '1px solid rgba(255,255,255,.16)', backdropFilter: 'blur(24px)', boxShadow: '0 18px 48px rgba(0,0,0,.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}><strong style={{ fontSize: 15 }}>Map layers</strong><button type="button" onClick={() => setLayersOpen(false)} aria-label="Close layers" style={{ ...controlStyle, width: 36, height: 36, boxShadow: 'none' }}><X size={18} /></button></div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 12, fontSize: 13.5 }}><span>Trip places</span><input type="checkbox" checked readOnly aria-label="Trip places visible" /></label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 12, fontSize: 13.5 }}><span>Other days</span><select value={props.otherDays} onChange={(event) => props.onOtherDaysChange(event.target.value as OtherDayVisibility)} style={{ minHeight: 36, borderRadius: 9, background: '#17172f', color: DUSK.textPrimary, border: '1px solid rgba(255,255,255,.15)', padding: '0 8px' }}><option value="hidden">Hidden</option><option value="dimmed">Dimmed</option></select></label>
          <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '5px 0' }} />
          {unavailableLayers.map((label) => <div key={label} aria-disabled="true" style={{ minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'rgba(255,255,255,.38)', fontSize: 13 }}><span>{label}</span><span style={{ fontSize: 10 }}>No data source</span></div>)}
        </div>
      )}

      <button type="button" onClick={props.onListToggle} aria-label="Expand itinerary sheet" style={{ position: 'absolute', left: '50%', bottom: 'calc(16px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 2, ...controlStyle }}><ChevronUp size={20} /></button>
    </div>
  )
}
