'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, CalendarDays, LocateFixed,
  MapPinned, Navigation, Plus, RotateCcw, Search, Ticket,
} from 'lucide-react'
import type { Profile, Stop, Trip, TripCapabilities } from '@/types'
import type { FullRoute } from '@/lib/mapbox/directions'
import type { TripboxMapPoint } from '@/components/map/mapbox/TripboxMap'
import { getFullRoute, LatestRouteRequestController } from '@/lib/mapbox/directions'
import { MAPBOX_TOKEN } from '@/lib/mapbox/client'
import { localCalendarISO, mapHomeTripStatus } from '@/lib/map-home'
import { buildRouteMapPins, tripDayCountFromDates } from '@/lib/map-pins'
// The stop schedule lives with the itinerary projection it feeds; Map Home reads
// the same day numbers so a pin means the same thing on both screens.
import { projectStopSchedule } from '@/app/trip/[id]/mobile/itinerary-projection'
import { AppBottomNav } from '@/components/ui/AppBottomNav'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import styles from './MapHome.module.css'

type SheetLevel = 'collapsed' | 'half' | 'expanded'
type RouteState = 'idle' | 'loading' | 'ready' | 'unavailable'

interface DashboardClientProps {
  profile: Profile | null
  featuredTrip: Trip | null
  featuredStops: Stop[]
  capabilities?: TripCapabilities
}

const ROUTE_REQUESTS = new LatestRouteRequestController()
const SHEET_ORDER: SheetLevel[] = ['collapsed', 'half', 'expanded']

function calendarDays(fromISO: string, toISO: string): number {
  return Math.round((new Date(`${toISO}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) / 86_400_000)
}

function formatShortDate(date: string | null): string | null {
  if (!date) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function tripDateCopy(trip: Trip, today = localCalendarISO()): string {
  const status = mapHomeTripStatus(trip, today)
  if (status === 'active') {
    const daysLeft = trip.end_date ? calendarDays(today, trip.end_date) : 0
    return daysLeft === 0 ? 'Today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
  }
  if (status === 'upcoming') {
    const start = trip.start_date ?? trip.end_date
    const days = start ? calendarDays(today, start) : 0
    return days === 0 ? 'Starts today' : `Starts in ${days} day${days === 1 ? '' : 's'}`
  }
  if (status === 'completed') return 'Recently completed'
  return 'Dates to be decided'
}

function tripDuration(trip: Trip): string | null {
  if (!trip.start_date || !trip.end_date) return null
  const days = calendarDays(trip.start_date, trip.end_date) + 1
  return `${days} day${days === 1 ? '' : 's'}`
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${Math.round(meters / 1000).toLocaleString()} km`
}

function stopDateRange(stop: Stop): string | null {
  const arrival = formatShortDate(stop.arrival_date)
  const departure = formatShortDate(stop.departure_date)
  if (!arrival && !departure) return null
  if (arrival && departure && arrival !== departure) return `${arrival} – ${departure}`
  return arrival ?? departure
}

function routeSummary(stops: Stop[]): string {
  if (stops.length === 0) return 'Add stops to bring your route to life'
  if (stops.length === 1) return stops[0].name
  const names = stops.slice(0, 3).map((stop) => stop.name)
  return `${names.join(' → ')}${stops.length > 3 ? ` +${stops.length - 3}` : ''}`
}

function currentStopIndex(trip: Trip, stops: Stop[]): number {
  if (stops.length === 0) return -1
  const today = localCalendarISO()
  const status = mapHomeTripStatus(trip, today)
  if (status === 'upcoming' || status === 'undated') return 0
  if (status === 'completed') return stops.length - 1
  const next = stops.findIndex((stop) => !stop.departure_date || stop.departure_date >= today)
  return next === -1 ? stops.length - 1 : next
}

function MapFallback({ message }: { message: string }) {
  return (
    <div className={styles.mapFallback} role="status">
      <div className={styles.fallbackRoute} aria-hidden="true"><span /><i /><span /><i /><span /></div>
      <MapPinned size={25} aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}

export function DashboardClient({ profile, featuredTrip, featuredStops, capabilities }: DashboardClientProps) {
  const router = useRouter()
  const [MapComponent, setMapComponent] = useState<typeof import('@/components/map/mapbox/TripboxMap').TripboxMap | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [online, setOnline] = useState(true)
  const [sheetLevel, setSheetLevel] = useState<SheetLevel>('collapsed')
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [route, setRoute] = useState<FullRoute | null>(null)
  const [routeState, setRouteState] = useState<RouteState>('idle')
  const [routeAttempt, setRouteAttempt] = useState(0)
  const [fitNonce, setFitNonce] = useState(0)
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'denied' | 'unavailable'>('idle')
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; nonce: number } | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isJoinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [viewportHeight, setViewportHeight] = useState(800)
  const [dragOffset, setDragOffset] = useState(0)
  const drag = useRef<{ y: number; pointerId: number } | null>(null)
  const dragged = useRef(false)

  const validStops = useMemo(
    () => featuredStops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
    [featuredStops],
  )
  const stopIndex = featuredTrip ? currentStopIndex(featuredTrip, validStops) : -1
  const points = useMemo<TripboxMapPoint[]>(() => {
    const schedule = projectStopSchedule(featuredTrip?.start_date ?? null, validStops)
    const pins = buildRouteMapPins(
      validStops.map((stop, index) => ({
        id: stop.id,
        lat: stop.lat,
        lng: stop.lng,
        name: stop.name,
        address: stop.address ?? stopDateRange(stop),
        nights: stop.nights,
        dayStart: schedule[index].dayStart,
      })),
      tripDayCountFromDates(featuredTrip?.start_date, featuredTrip?.end_date),
    )
    return pins.map((pin, index) => {
      const completed = featuredTrip ? mapHomeTripStatus(featuredTrip) === 'completed' || index < stopIndex : false
      // "You are here" outranks the hierarchy: the stop the traveler is on keeps a
      // full-size pin even when it holds no nights, so it never shrinks to a dot.
      const kind = index === stopIndex ? 'overnight' as const : pin.kind
      return {
        ...pin,
        kind,
        emphasis: completed && index !== stopIndex ? 'dimmed' as const : 'strong' as const,
        markerColor: index === stopIndex ? '#f5a623'
          : kind === 'waypoint' ? undefined
          : pin.role === 'start' ? '#34d399'
          : pin.role === 'end' ? '#a78bfa'
          : undefined,
      }
    })
  }, [featuredTrip, stopIndex, validStops])
  const pointKey = points.map((point) => `${point.lat},${point.lng}`).join('|')

  const defaultCenter = useMemo(() => {
    if (!featuredTrip) return undefined
    if (featuredTrip.focus_lat != null && featuredTrip.focus_lng != null) return { lat: featuredTrip.focus_lat, lng: featuredTrip.focus_lng }
    const country = featuredTrip.countries?.slice().sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))[0]
    return country ? { lat: country.lat, lng: country.lng } : undefined
  }, [featuredTrip])

  useEffect(() => {
    let current = true
    import('@/components/map/mapbox/TripboxMap')
      .then((module) => { if (current) setMapComponent(() => module.TripboxMap) })
      .catch(() => { if (current) setMapFailed(true) })
    return () => { current = false }
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const resize = () => setViewportHeight(window.innerHeight)
    update(); resize()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    if (points.length < 2) {
      setRoute(null)
      setRouteState('idle')
      return
    }
    const controller = ROUTE_REQUESTS.begin()
    setRouteState('loading')
    getFullRoute(points.map(({ lat, lng }) => ({ lat, lng })), { signal: controller.signal })
      .then((next) => {
        if (!ROUTE_REQUESTS.isCurrent(controller)) return
        setRoute(next)
        setRouteState(next ? 'ready' : 'unavailable')
      })
    return () => ROUTE_REQUESTS.cancel(controller)
  }, [pointKey, routeAttempt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPopState = () => setSheetLevel((level) => level === 'collapsed' ? level : 'collapsed')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => { setFitNonce((value) => value + 1) }, [sheetLevel])

  const openSheet = useCallback((level: Exclude<SheetLevel, 'collapsed'> = 'half') => {
    setSheetLevel((current) => {
      if (current === 'collapsed') window.history.pushState({ ...window.history.state, mapHomeRoutePreview: true }, '')
      return level
    })
  }, [])

  const collapseSheet = useCallback(() => {
    if (window.history.state?.mapHomeRoutePreview) window.history.back()
    else setSheetLevel('collapsed')
  }, [])

  const setLevelFromGesture = useCallback((delta: number) => {
    const index = SHEET_ORDER.indexOf(sheetLevel)
    if (delta < -45 && index < SHEET_ORDER.length - 1) {
      const next = SHEET_ORDER[index + 1]
      if (sheetLevel === 'collapsed') openSheet(next as 'half' | 'expanded')
      else setSheetLevel(next)
    } else if (delta > 45 && index > 0) {
      const next = SHEET_ORDER[index - 1]
      if (next === 'collapsed') collapseSheet()
      else setSheetLevel(next)
    }
  }, [collapseSheet, openSheet, sheetLevel])

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { y: event.clientY, pointerId: event.pointerId }
    dragged.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return
    const delta = event.clientY - drag.current.y
    if (Math.abs(delta) > 5) dragged.current = true
    setDragOffset(Math.max(-110, Math.min(110, delta)))
  }
  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return
    const delta = event.clientY - drag.current.y
    setLevelFromGesture(delta)
    drag.current = null
    setDragOffset(0)
  }

  const requestLocation = useCallback(() => {
    if (locationState === 'loading') return
    if (!navigator.geolocation) { setLocationState('unavailable'); return }
    setLocationState('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude }
        setUserLocation(next)
        setCameraTarget({ ...next, nonce: Date.now() })
        setLocationState('idle')
      },
      (error) => setLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [locationState])

  const submitJoin = (event: React.FormEvent) => {
    event.preventDefault()
    const code = joinCode.trim()
    if (!code) { setJoinError('Enter an invite code'); return }
    router.push(`/join/${encodeURIComponent(code)}`)
  }

  const mapUnavailable = !MAPBOX_TOKEN || !online || mapFailed
  const fallbackMessage = !MAPBOX_TOKEN
    ? 'Map unavailable · your trip is still ready'
    : !online ? 'You are offline · your saved trip is still here' : 'The map could not load · your itinerary is still available'
  const navClearance = 92
  const sheetHeight = sheetLevel === 'collapsed' ? 132 : sheetLevel === 'half' ? Math.round(viewportHeight * 0.47) : Math.max(390, viewportHeight - 190)
  const fitPadding = {
    top: 104,
    right: 56,
    bottom: Math.min(viewportHeight - 150, sheetHeight + navClearance + 18),
    left: 34,
  }
  const status = featuredTrip ? mapHomeTripStatus(featuredTrip) : null
  const duration = featuredTrip ? tripDuration(featuredTrip) : null
  const summary = routeSummary(validStops)

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Tripper Map Home</h1>

      <section className={styles.mapLayer} role="region" aria-label={featuredTrip ? `${featuredTrip.title} route map` : 'Travel discovery map'}>
        {mapUnavailable ? <MapFallback message={fallbackMessage} /> : MapComponent ? (
          <MapComponent
            points={points}
            routePath={route?.route.polylinePath ?? []}
            defaultCenter={defaultCenter}
            defaultZoom={featuredTrip ? 5 : 2.4}
            selectedItemId={selectedStopId}
            onSelectItem={setSelectedStopId}
            cameraTarget={cameraTarget}
            userLocation={userLocation}
            onMapError={() => setMapFailed(true)}
            fitPadding={fitPadding}
            fitRequestNonce={fitNonce}
            showZoomControls={false}
          />
        ) : <MapFallback message="Opening your map…" />}
      </section>

      <div className={styles.topScrim} aria-hidden="true" />
      <div className={styles.bottomScrim} aria-hidden="true" />

      {sheetLevel === 'collapsed' ? (
        <button type="button" className={styles.search} onClick={() => router.push('/explore')} aria-label="Search destinations in Discover">
          <Search size={19} aria-hidden="true" />
          <span>Where to next, traveler?</span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      ) : (
        <div className={styles.routeToolbar}>
          <button type="button" onClick={collapseSheet} aria-label="Collapse route preview"><ArrowLeft size={20} /></button>
          <div><span>Route focus</span><strong>{featuredTrip?.title}</strong></div>
          <button type="button" onClick={() => setFitNonce((value) => value + 1)} aria-label="Fit entire route"><MapPinned size={20} /></button>
        </div>
      )}

      {!mapUnavailable && featuredTrip && (
        <div className={styles.mapControls}>
          <button type="button" onClick={() => setFitNonce((value) => value + 1)} aria-label="Fit featured trip route"><Navigation size={19} /></button>
          <button type="button" onClick={requestLocation} disabled={locationState === 'loading' || locationState === 'denied'} aria-label={locationState === 'denied' ? 'Location permission denied' : 'Show my current location'}><LocateFixed size={19} /></button>
        </div>
      )}

      {locationState !== 'idle' && (
        <div className={styles.statusToast} role="status">
          {locationState === 'loading' ? 'Finding your location…' : locationState === 'denied' ? 'Location access is off in browser settings.' : 'Your location is unavailable.'}
        </div>
      )}

      {featuredTrip ? (
        <section
          className={`${styles.routeSheet} ${styles[sheetLevel]}`}
          style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }}
          aria-label={`${featuredTrip.title} route preview`}
        >
          <button
            type="button"
            className={styles.sheetHandle}
            aria-expanded={sheetLevel !== 'collapsed'}
            aria-label={sheetLevel === 'expanded' ? 'Collapse route preview' : 'Expand route preview'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { drag.current = null; setDragOffset(0) }}
            onClick={() => {
              if (dragged.current) { dragged.current = false; return }
              if (sheetLevel === 'collapsed') openSheet('half')
              else if (sheetLevel === 'half') setSheetLevel('expanded')
              else setSheetLevel('half')
            }}
          ><span /></button>

          {sheetLevel === 'collapsed' ? (
            <div className={styles.collapsedCard}>
              <button type="button" className={styles.cardMain} onClick={() => openSheet('half')} aria-label={`Open ${featuredTrip.title} route preview`}>
                <div className={styles.cardTitleRow}><strong>{featuredTrip.title}</strong><span data-status={status}>{status?.toUpperCase()}</span></div>
                <div className={styles.cardMeta}>{validStops.length} stop{validStops.length === 1 ? '' : 's'} <i>·</i> {tripDateCopy(featuredTrip)}</div>
                <p>{summary}</p>
              </button>
              <button type="button" className={styles.openTripButton} onClick={() => router.push(`/trip/${featuredTrip.id}/mobile?section=overview`)} aria-label={`Open trip ${featuredTrip.title}`}><ArrowRight size={19} /></button>
            </div>
          ) : (
            <>
              <div className={styles.sheetHeading}>
                <div><span>Your Route</span><strong>{featuredTrip.title}</strong></div>
                <p>{validStops.length} stop{validStops.length === 1 ? '' : 's'}{duration ? ` · ${duration}` : ''}</p>
              </div>

              <div className={styles.routeStats} aria-live="polite">
                {routeState === 'loading' && <span className={styles.routeLoading}>Calculating route…</span>}
                {routeState === 'ready' && route && <><span><Navigation size={14} />{route.route.durationText}</span><span>{formatDistance(route.route.distanceMeters)}</span></>}
                {routeState === 'unavailable' && <><span>Route unavailable · itinerary still available</span><button type="button" onClick={() => setRouteAttempt((value) => value + 1)}><RotateCcw size={13} /> Retry</button></>}
                {routeState === 'idle' && <span>{validStops.length === 0 ? 'No stops yet' : 'Route starts here'}</span>}
              </div>

              <div className={styles.stopList} role="list" aria-label="Trip stops">
                {validStops.length === 0 ? (
                  <div className={styles.noStops}><MapPinned size={24} /><strong>No stops yet</strong><span>Open Plan to shape this route.</span></div>
                ) : validStops.map((stop, index) => {
                  const selected = stop.id === selectedStopId
                  const leg = route?.legs[index]
                  const dates = stopDateRange(stop)
                  return (
                    <button
                      type="button"
                      key={stop.id}
                      className={`${styles.stopRow} ${selected ? styles.selectedStop : ''}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedStopId(stop.id)}
                    >
                      <span className={styles.stopNumber}>{index + 1}</span>
                      <span className={styles.stopThumb} aria-hidden="true">{stop.name.slice(0, 1).toUpperCase()}</span>
                      <span className={styles.stopCopy}>
                        <strong>{stop.name}</strong>
                        <span>{stop.address ?? dates ?? 'Route stop'}</span>
                        {dates && stop.address && <small><CalendarDays size={12} />{dates}</small>}
                        {index < validStops.length - 1 && (
                          <small>{leg ? `${leg.durationText} · ${formatDistance(leg.distanceMeters)} to next stop` : routeState === 'loading' ? 'Calculating next leg…' : 'Route to next stop unavailable'}</small>
                        )}
                      </span>
                      <MapPinned size={17} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>

              <div className={styles.sheetActions}>
                <button type="button" onClick={() => router.push(`/trip/${featuredTrip.id}/mobile?section=overview`)}>Open trip</button>
                {capabilities?.canEdit && <button type="button" className={styles.primaryAction} onClick={() => router.push(`/trip/${featuredTrip.id}/mobile?section=plan`)}><Plus size={16} /> Edit route</button>}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className={`${styles.routeSheet} ${styles.emptyCard}`} aria-label="Create your first trip">
          <div>
            <strong>Where will you go next?</strong>
            <span>Build your first route and see it come alive on the map.</span>
          </div>
          <button type="button" className={styles.primaryAction} onClick={() => router.push('/trips/new')}>Create a trip</button>
          <button type="button" className={styles.joinAction} onClick={() => setJoinOpen(true)}><Ticket size={15} /> Join with invite code</button>
        </section>
      )}

      <AppBottomNav active="home" profile={profile} floating />

      <Dialog open={isJoinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="w-[calc(100%-32px)] max-w-[340px] rounded-[20px] border-white/[0.12] bg-[#0e0e22]/[0.97] p-5 text-white shadow-2xl backdrop-blur-xl">
          <DialogHeader className="text-left">
            <DialogTitle>Join a trip</DialogTitle>
            <DialogDescription className="text-white/60">Enter the invite code shared by your travel buddy.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitJoin} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inviteCode">Invite code</Label>
              <Input id="inviteCode" autoFocus autoCapitalize="characters" autoComplete="off" value={joinCode} onChange={(event) => { setJoinCode(event.target.value.toUpperCase()); setJoinError(null) }} aria-invalid={Boolean(joinError)} className="h-12 bg-white/5 uppercase text-white" />
              {joinError && <p role="alert" className="text-xs text-red-400">{joinError}</p>}
            </div>
            <button type="submit" className={styles.dialogAction}>Join trip</button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
