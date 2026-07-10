'use client'

import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useMotionValue, animate } from 'framer-motion'
import { SegmentedTabs } from '@/components/ui/segmented-tabs'
import { createClient } from '@/lib/supabase/client'
import { TripboxMap } from '@/components/map/mapbox/TripboxMap'
import { getDrivingRoute, getRouteLegs, type RouteLeg } from '@/lib/mapbox/directions'
import { forwardSearch, type GeocodeResult } from '@/lib/mapbox/geocoding'
import type { Trip, Stop } from '@/types'

const ACCENT = '#f5a623'
const ACCENT_LIGHT = '#f8c04a'
const ACCENT_DARK = '#e8821a'
const GLASS_FILL = 'rgba(255,255,255,.055)'
const GLASS_BORDER = 'rgba(255,255,255,.13)'

/** Bottom-sheet snap heights, in px, resolved against the live viewport height. */
const SHEET_MIN_PX = 190
const SHEET_DEFAULT_RATIO = 0.54
const SHEET_MAX_RATIO = 0.88

interface TripMobileClientProps {
  trip: Trip
  stops: Stop[]
  currentUserId: string
}

export function TripMobileClient(props: TripMobileClientProps) {
  return <TripMobileContent {...props} />
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHeaderDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return ''
  if (start && end) return `${formatHeaderDate(start)} – ${formatHeaderDate(end)}`
  return formatHeaderDate((start || end) as string)
}

function tripTitle(trip: Trip, stops: Stop[]) {
  if (stops.length >= 2) return `${stops[0].name} → ${stops[stops.length - 1].name}`
  if (stops.length === 1) return stops[0].name
  return trip.title
}

function formatWeekday(d?: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

const BOOKING_PARTNERS = ['Booking.com', 'Expedia', 'Airbnb', 'Hostelworld', 'Agoda'] as const

function bookingUrl(partner: (typeof BOOKING_PARTNERS)[number], stop: Stop) {
  const city = encodeURIComponent(stop.name)
  const checkin = stop.arrival_date ?? ''
  const checkout = stop.departure_date ?? ''
  switch (partner) {
    case 'Booking.com':
      return `https://www.booking.com/searchresults.html?ss=${city}${checkin ? `&checkin=${checkin}` : ''}${checkout ? `&checkout=${checkout}` : ''}`
    case 'Expedia':
      return `https://www.expedia.com/Hotel-Search?destination=${city}`
    case 'Airbnb':
      return `https://www.airbnb.com/s/${city}/homes${checkin && checkout ? `?checkin=${checkin}&checkout=${checkout}` : ''}`
    case 'Hostelworld':
      return `https://www.hostelworld.com/search?search_keywords=${city}`
    case 'Agoda':
      return `https://www.agoda.com/search?city=${city}${checkin ? `&checkIn=${checkin}` : ''}${checkout ? `&checkOut=${checkout}` : ''}`
  }
}

function totalNights(trip: Trip) {
  if (!trip.start_date || !trip.end_date) return 0
  const ms = new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

const topBtnStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  background: GLASS_FILL,
  border: `1px solid ${GLASS_BORDER}`,
  backdropFilter: 'blur(20px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0,0,0,.3)',
}

// ─── Main content ────────────────────────────────────────────────────────────

function TripMobileContent({ trip, stops: initialStops, currentUserId }: TripMobileClientProps) {
  const router = useRouter()
  const [stops, setStops] = useState(initialStops)
  const [activeTab, setActiveTab] = useState<'route' | 'days' | 'bookings'>('route')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [aiHint, setAiHint] = useState(false)
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([])
  const [routeLegs, setRouteLegs] = useState<RouteLeg[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [nights, setNights] = useState<Record<string, number>>({})
  const [optimizeHint, setOptimizeHint] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const sheetHeight = useMotionValue(420)

  useEffect(() => {
    const h = stageRef.current?.clientHeight ?? window.innerHeight
    sheetHeight.set(Math.round(h * SHEET_DEFAULT_RATIO))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snapPoints = useCallback(() => {
    const h = stageRef.current?.clientHeight ?? window.innerHeight
    return {
      min: SHEET_MIN_PX,
      mid: Math.round(h * SHEET_DEFAULT_RATIO),
      max: Math.round(h * SHEET_MAX_RATIO),
    }
  }, [])

  // Native Pointer Events (not Framer's onPan) so dragging works reliably with
  // mouse, touch, and pen alike, and pointer capture keeps tracking even if the
  // finger/cursor drifts outside the handle's small hit area mid-drag.
  const dragStart = useRef<{ pointerId: number; clientY: number; height: number } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStart.current = { pointerId: e.pointerId, clientY: e.clientY, height: sheetHeight.get() }
      setIsDragging(true)
    },
    [sheetHeight]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStart.current
      if (!drag || e.pointerId !== drag.pointerId) return
      const { min, max } = snapPoints()
      const next = drag.height - (e.clientY - drag.clientY)
      sheetHeight.set(Math.min(max, Math.max(min, next)))
    },
    [sheetHeight, snapPoints]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current || e.pointerId !== dragStart.current.pointerId) return
      dragStart.current = null
      setIsDragging(false)
      const { min, mid, max } = snapPoints()
      const current = sheetHeight.get()
      const nearest = [min, mid, max].reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a))
      animate(sheetHeight, nearest, { type: 'spring', stiffness: 320, damping: 34 })
    },
    [sheetHeight, snapPoints]
  )

  useEffect(() => {
    if (stops.length < 2) {
      setRoutePath([])
      setRouteLegs([])
      return
    }
    let cancelled = false
    const points = stops.map((s) => ({ lat: s.lat, lng: s.lng }))
    getDrivingRoute(points).then((route) => {
      if (!cancelled) setRoutePath(route?.polylinePath ?? [])
    })
    getRouteLegs(points).then((legs) => {
      if (!cancelled) setRouteLegs(legs)
    })
    return () => {
      cancelled = true
    }
  }, [stops])

  const incNights = useCallback((id: string) => {
    setNights((prev) => ({ ...prev, [id]: (prev[id] ?? 1) + 1 }))
  }, [])

  const decNights = useCallback((id: string) => {
    setNights((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) - 1) }))
  }, [])

  const handleAddStop = useCallback(
    async (lat: number, lng: number, name: string, address: string) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('stops')
        .insert({
          trip_id: trip.id,
          name,
          lat,
          lng,
          address,
          order_index: stops.length,
          stop_type: stops.length === 0 ? 'origin' : 'destination',
          created_by: currentUserId,
        })
        .select()
        .single()
      if (!error && data) setStops((prev) => [...prev, data as Stop])
    },
    [trip.id, stops.length, currentUserId]
  )

  const nightsTotal = totalNights(trip)
  const nightsPlanned = stops.reduce((sum, s) => sum + (nights[s.id] ?? 1), 0)
  const nightsTarget = nightsTotal || nightsPlanned || 1
  const ringCircumference = 150.8
  const ringPct = Math.min(1, nightsPlanned / nightsTarget)
  const ringOffset = ringCircumference * (1 - ringPct)
  const defaultCenter =
    trip.focus_lat != null && trip.focus_lng != null ? { lat: trip.focus_lat, lng: trip.focus_lng } : undefined

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100svh',
        background: 'linear-gradient(145deg, #06061c, #0a1020, #071216)',
        fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <style>{`
        @keyframes dashmove { to { stroke-dashoffset: -40; } }
        @keyframes pulseglow { 0%,100% { opacity: .45; } 50% { opacity: .8; } }
        * { scrollbar-width: none }
        *::-webkit-scrollbar { display: none }
      `}</style>

      {/* luminous orbs */}
      <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, borderRadius: '50%', background: 'rgba(245,140,0,.22)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 160, left: -100, width: 340, height: 340, borderRadius: '50%', background: 'rgba(90,0,210,.20)', filter: 'blur(70px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 220, right: -120, width: 320, height: 320, borderRadius: '50%', background: 'rgba(0,100,160,.14)', filter: 'blur(70px)', pointerEvents: 'none' }} />

      <div ref={stageRef} style={{ position: 'relative', zIndex: 1, height: '100svh', maxWidth: 480, margin: '0 auto', overflow: 'hidden' }}>

        {/* map layer — fixed, full-bleed, never resized or re-rendered by the sheet drag.
            The sheet is a pure overlay on top; it covers more/less of this static map as it moves,
            but the map's own DOM container size (and therefore its camera) never changes. */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#06061c' }}>
          <TripboxMap
            points={stops.map((s, idx) => ({ id: s.id, lat: s.lat, lng: s.lng, label: idx + 1, title: s.name, subtitle: s.address ?? undefined }))}
            routePath={routePath}
            defaultCenter={defaultCenter}
            defaultZoom={5}
          />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to bottom, transparent 78%, rgba(6,6,28,.6) 100%)' }} />
        </div>

        {/* floating header — sits over the map, not a separate opaque block */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
            padding: '20px 18px 14px', paddingTop: 'max(20px, env(safe-area-inset-top))',
            background: 'linear-gradient(to bottom, rgba(6,6,20,.8) 0%, rgba(6,6,20,.45) 55%, transparent 100%)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'auto' }}>
            <button onClick={() => router.push('/trips')} title="Back to trips" style={topBtnStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>

            <div style={{ flex: 1, textAlign: 'center', padding: '0 8px', minWidth: 0 }}>
              <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>
                {tripTitle(trip, stops)}
              </div>
              <div style={{ color: 'rgba(215,215,255,.7)', fontWeight: 500, fontSize: 12.5, marginTop: 3, textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>
                {formatDateRange(trip.start_date, trip.end_date) || 'No dates set'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
              <div style={{ height: 40, padding: '0 10px', borderRadius: 14, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>📍</span>
                <span style={{ color: ACCENT, fontWeight: 700, fontSize: 12.5 }}>{stops.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* draggable bottom sheet */}
        <motion.div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
            height: sheetHeight,
            background: 'rgba(10,10,26,.82)', border: `1px solid ${GLASS_BORDER}`, borderBottom: 'none',
            backdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0',
            boxShadow: '0 -12px 40px rgba(0,0,0,.35)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 12px', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', flex: 'none' }}
          >
            <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.22)' }} />
          </div>

          {/* tabs — inline segmented pill control (Route/Days/Bookings) */}
          <div style={{ padding: '0 16px 12px', flex: 'none' }}>
            <SegmentedTabs
              options={[
                { value: 'route', label: 'Route' },
                { value: 'days', label: 'Days' },
                { value: 'bookings', label: 'Bookings' },
              ]}
              value={activeTab}
              onValueChange={setActiveTab}
            />
          </div>

          {/* content */}
          <div style={{ flex: 1, padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, overflowY: 'auto' }}>

            {activeTab === 'route' && (
              <>
                {stops.length > 0 && (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 22, padding: '18px 20px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <svg width="56" height="56" viewBox="0 0 56 56" style={{ flex: 'none', transform: 'rotate(-90deg)' }}>
                        <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
                        <circle cx="28" cy="28" r="24" fill="none" stroke="url(#tripper-ring-grad)" strokeWidth="5" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} />
                        <defs>
                          <linearGradient id="tripper-ring-grad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={ACCENT_LIGHT} />
                            <stop offset="100%" stopColor={ACCENT} />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{nightsPlanned} / {nightsTarget}</div>
                        <div style={{ fontSize: 12, color: 'rgba(215,215,255,.7)', fontWeight: 500, marginTop: 2 }}>Nights Planned</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setOptimizeHint(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 999, padding: '10px 14px', flex: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1L9.3 5.6L14 7L9.3 8.4L8 13L6.7 8.4L2 7L6.7 5.6L8 1Z" fill={ACCENT_LIGHT} /></svg>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{optimizeHint ? 'Coming soon' : 'Optimize'}</span>
                    </button>
                  </div>
                )}

                {stops.length === 0 ? (
                  <div style={{ width: '100%', flex: 1, minHeight: 160, border: '1.5px dashed rgba(255,255,255,.15)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(136,136,228,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(136,136,228,.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>
                    </div>
                    <div style={{ color: '#ffffff', fontWeight: 500, fontSize: 16, textAlign: 'center' }}>Add your first destination</div>
                    <div style={{ color: '#4a4a68', fontWeight: 400, fontSize: 13, textAlign: 'center' }}>Press + to build your route</div>
                  </div>
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    {stops.map((stop, idx) => (
                      <div key={stop.id}>
                        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}>
                          <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: `${ACCENT}22`, border: `1.5px solid ${ACCENT}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ACCENT }}>
                            {idx + 1}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name}</div>
                            {stop.address && (
                              <div style={{ color: '#4a4a68', fontSize: 11.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.address}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: 4, flex: 'none' }}>
                            <button
                              onClick={() => decNights(stop.id)}
                              style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(215,215,255,.8)', background: 'none', border: 'none' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 700, width: 20, textAlign: 'center' }}>{nights[stop.id] ?? 1}</span>
                            <button
                              onClick={() => incNights(stop.id)}
                              style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: ACCENT_LIGHT, background: 'none', border: 'none' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                          </div>
                        </div>

                        {idx < stops.length - 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 10px 32px' }}>
                            <div style={{ position: 'relative', width: 2, height: 28, background: 'repeating-linear-gradient(to bottom, rgba(245,140,0,.5) 0 4px, transparent 4px 8px)' }}>
                              <div style={{ position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, margin: -4, borderRadius: '50%', background: ACCENT_LIGHT, boxShadow: '0 0 14px 3px rgba(245,140,0,.6)', animation: 'pulseglow 2.2s ease-in-out infinite' }} />
                            </div>
                            <span style={{ fontSize: 12, color: 'rgba(215,215,255,.55)', fontWeight: 500 }}>
                              {routeLegs[idx] ? `${routeLegs[idx].distanceText} drive` : '…'}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                  <div style={{ color: '#4a4a68', fontSize: 12, fontWeight: 500 }}>or</div>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                </div>

                <button
                  onClick={() => setAiHint(true)}
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: GLASS_FILL, border: '1px solid rgba(245,166,35,.35)', boxShadow: '0 0 20px rgba(245,140,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <span style={{ fontSize: 14 }}>✨</span>
                  <span style={{ color: '#f5c268', fontWeight: 700, fontSize: 14 }}>{aiHint ? 'Coming soon' : 'Generate trip with AI'}</span>
                </button>
              </>
            )}

            {activeTab === 'days' && <DaysTab stops={stops} routeLegs={routeLegs} />}
            {activeTab === 'bookings' && <BookingsTab stops={stops} />}
          </div>

          <BottomNav />
        </motion.div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setIsAddOpen(true)}
        title="Add destination"
        style={{ position: 'fixed', right: 18, bottom: 96, width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`, boxShadow: '0 0 32px rgba(245,140,0,.45), 0 8px 20px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, border: 'none', cursor: 'pointer' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {isAddOpen && <AddDestinationSheet onClose={() => setIsAddOpen(false)} onAdd={handleAddStop} />}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function DaysTab({ stops, routeLegs }: { stops: Stop[]; routeLegs: RouteLeg[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (stops.length === 0) return <ComingSoon label="Day-by-day planning" />

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stops.map((stop, idx) => {
        const isOpen = !!expanded[stop.id]
        const weekday = formatWeekday(stop.arrival_date)
        const hasDetail = !!(stop.notes || stop.address)
        const prevStop = idx > 0 ? stops[idx - 1] : null
        const leg = idx > 0 ? routeLegs[idx - 1] : null
        return (
          <div key={stop.id}>
            {prevStop && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', padding: 12, background: 'rgba(0,0,0,.18)', borderRadius: 14 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}>{prevStop.name}</div>
                </div>
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: 2, background: 'linear-gradient(to right, transparent, #8888e4, transparent)' }} />
                  <div style={{ fontSize: 10.5, color: 'rgba(215,215,255,.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {leg ? `${leg.durationText} · ${leg.distanceText}` : '…'}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}>{stop.name}</div>
                </div>
              </div>
            )}
            <div
              onClick={() => hasDetail && setExpanded((e) => ({ ...e, [stop.id]: !e[stop.id] }))}
              style={{
                background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20,
                padding: 16, cursor: hasDetail ? 'pointer' : 'default', backdropFilter: 'blur(20px)',
                boxShadow: '0 6px 20px rgba(0,0,0,.2)',
              }}
            >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(215,215,255,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Day {idx + 1}{weekday ? ` · ${weekday}` : ''}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stop.name}
                </div>
                {prevStop && <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT_LIGHT, marginTop: 3 }}>Travel Day</div>}
              </div>
              {hasDetail && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stop.address && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(215,215,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Address</div>
                    <div style={{ fontSize: 13, color: 'rgba(215,215,255,.88)', lineHeight: 1.5 }}>{stop.address}</div>
                  </div>
                )}
                {stop.notes && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(215,215,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Notes</div>
                    <div style={{ fontSize: 13, color: 'rgba(215,215,255,.88)', lineHeight: 1.5 }}>{stop.notes}</div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BookingsTab({ stops }: { stops: Stop[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (stops.length === 0) return <ComingSoon label="Bookings" />

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {stops.map((stop) => {
        const moreOpen = !!expanded[stop.id]
        const shown = moreOpen ? BOOKING_PARTNERS : BOOKING_PARTNERS.slice(0, 3)
        const dateRange = formatDateRange(stop.arrival_date, stop.departure_date)
        return (
          <div
            key={stop.id}
            style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em' }}>Stay in {stop.name}</div>
                {dateRange && <div style={{ fontSize: 12, color: 'rgba(215,215,255,.65)', marginTop: 3, fontWeight: 500 }}>{dateRange}</div>}
              </div>
              <a
                href={bookingUrl('Booking.com', stop)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid rgba(245,140,0,.5)', color: ACCENT_LIGHT, borderRadius: 999, padding: '8px 13px', flex: 'none', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Add Stay</span>
              </a>
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
              {shown.map((partner) => (
                <a
                  key={partner}
                  href={bookingUrl(partner, stop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.06)', textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(215,215,255,.88)', flex: 'none' }}>
                    {partner[0]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#fff' }}>{partner}</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', opacity: 0.5 }}>
                    <path d="M6 3L11 8L6 13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ))}
            </div>

            {BOOKING_PARTNERS.length > 3 && (
              <div onClick={() => setExpanded((e) => ({ ...e, [stop.id]: !e[stop.id] }))} style={{ textAlign: 'center', padding: '12px 0 2px', cursor: 'pointer' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(215,215,255,.6)' }}>
                  {moreOpen ? 'Show Fewer Partners' : `Show ${BOOKING_PARTNERS.length - 3} More Partners`}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 14px', background: 'rgba(30,140,90,.12)', border: '1px solid rgba(30,180,110,.3)', borderRadius: 12 }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#86efac' }}>Destination and dates are automatically pre-filled</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '40px 16px', textAlign: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span style={{ color: '#4a4a68', fontSize: 12.5 }}>Coming soon</span>
    </div>
  )
}

function BottomNav() {
  const items: { label: string; active: boolean; icon: (color: string) => React.ReactNode }[] = [
    {
      label: 'Plan', active: true,
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>),
    },
    {
      label: 'Prep', active: false,
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l1 4M18 2l-1 4" /><rect x="5" y="6" width="14" height="15" rx="4" /><path d="M9 10v4M15 10v4" /></svg>),
    },
    {
      label: 'Budget', active: false,
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 10h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>),
    },
    {
      label: 'Journal', active: false,
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></svg>),
    },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, borderTop: `1px solid ${GLASS_BORDER}`, background: 'rgba(255,255,255,.03)', padding: '10px 10px 12px', flex: 'none' }}>
      {items.map((item) => {
        const color = item.active ? ACCENT : '#363650'
        return (
          <div
            key={item.label}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '7px 0 6px', borderRadius: 14,
              background: item.active ? 'rgba(245,166,35,.12)' : 'transparent',
            }}
          >
            {item.icon(color)}
            <span style={{ color, fontWeight: 600, fontSize: 11 }}>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function AddDestinationSheet({
  onClose, onAdd,
}: {
  onClose: () => void
  onAdd: (lat: number, lng: number, name: string, address: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    debounceRef.current = setTimeout(() => {
      forwardSearch(q).then((found) => {
        setResults(found)
        setIsSearching(false)
      })
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleSelect = useCallback(
    async (result: GeocodeResult) => {
      setIsSaving(true)
      await onAdd(result.lat, result.lng, result.name, result.address)
      setIsSaving(false)
      onClose()
    },
    [onAdd, onClose]
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: '#0e0e24', border: '1px solid rgba(255,255,255,.1)', borderBottom: 'none', borderRadius: '24px 24px 0 0', padding: '20px 20px 28px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.18)' }} />
        </div>
        <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Add a destination</div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place…"
            style={{ width: '100%', height: 48, borderRadius: 14, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#ffffff', fontSize: 15, fontFamily: 'inherit', padding: '0 14px', outline: 'none', boxSizing: 'border-box' }}
          />
          {isSearching && (
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.4)', fontSize: 12 }}>…</span>
          )}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              disabled={isSaving}
              style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,.06)', cursor: isSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: '#4a4a68', fontSize: 12 }}>{r.address}</span>
            </button>
          ))}
          {query && !isSearching && results.length === 0 && (
            <div style={{ color: '#4a4a68', fontSize: 13, padding: '16px 8px', textAlign: 'center' }}>No results</div>
          )}
        </div>
      </div>
    </div>
  )
}
