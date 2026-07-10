'use client'

import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps'
import { createClient } from '@/lib/supabase/client'
import type { Trip, Stop } from '@/types'

const ACCENT = '#f5a623'

interface TripMobileClientProps {
  trip: Trip
  stops: Stop[]
  currentUserId: string
}

export function TripMobileClient(props: TripMobileClientProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a14',
          color: 'rgba(255,255,255,.6)',
          fontFamily: "var(--font-inter),'Inter',system-ui,sans-serif",
          padding: 24,
          textAlign: 'center',
        }}
      >
        Google Maps API key not configured
      </div>
    )
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places']}>
      <TripMobileContent {...props} />
    </APIProvider>
  )
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

function totalNights(trip: Trip) {
  if (!trip.start_date || !trip.end_date) return 0
  const ms = new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

const topBtnStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  background: 'rgba(255,255,255,.055)',
  border: '1px solid rgba(255,255,255,.13)',
  backdropFilter: 'blur(20px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  cursor: 'pointer',
}

// ─── Main content ────────────────────────────────────────────────────────────

function TripMobileContent({ trip, stops: initialStops, currentUserId }: TripMobileClientProps) {
  const router = useRouter()
  const [stops, setStops] = useState(initialStops)
  const [activeTab, setActiveTab] = useState<'route' | 'days' | 'bookings'>('route')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [aiHint, setAiHint] = useState(false)

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
  const nightsPlanned = Math.min(stops.length, nightsTotal || stops.length)

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

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100svh', maxWidth: 480, margin: '0 auto' }}>

        {/* top bar */}
        <div style={{ padding: '20px 18px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <button onClick={() => router.push('/trips')} title="Back to trips" style={topBtnStyle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>

          <div style={{ flex: 1, textAlign: 'center', padding: '0 8px', minWidth: 0 }}>
            <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tripTitle(trip, stops)}
            </div>
            <div style={{ color: '#4a4a68', fontWeight: 500, fontSize: 12.5, marginTop: 3 }}>
              {formatDateRange(trip.start_date, trip.end_date) || 'No dates set'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <div style={{ height: 40, padding: '0 10px', borderRadius: 14, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.13)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>📍</span>
              <span style={{ color: ACCENT, fontWeight: 700, fontSize: 12.5 }}>{stops.length}</span>
            </div>
            <button onClick={() => router.push(`/trip/${trip.id}`)} title="Open full planner" style={topBtnStyle}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
        </div>

        {/* map hero */}
        <RouteHero />

        {/* bottom sheet */}
        <div style={{ flex: 1, marginTop: -24, position: 'relative', zIndex: 2, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.13)', borderBottom: 'none', backdropFilter: 'blur(20px)', borderRadius: '24px 24px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
            <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.18)' }} />
          </div>

          {/* tabs */}
          <div style={{ display: 'flex', gap: 22, padding: '16px 20px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <SheetTab label="Route" active={activeTab === 'route'} onClick={() => setActiveTab('route')} />
            <SheetTab label="Days" active={activeTab === 'days'} onClick={() => setActiveTab('days')} />
            <SheetTab label="Bookings" active={activeTab === 'bookings'} onClick={() => setActiveTab('bookings')} />
          </div>

          {/* content */}
          <div style={{ flex: 1, padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, overflowY: 'auto' }}>

            {activeTab === 'route' && (
              <>
                <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 999, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.13)' }}>
                  <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 14 }}>{nightsPlanned}/{nightsTotal || stops.length || '–'}</span>
                  <span style={{ color: 'rgba(215,215,255,.88)', fontWeight: 500, fontSize: 12.5 }}>Nights planned</span>
                </div>

                {stops.length === 0 ? (
                  <div style={{ width: '100%', flex: 1, minHeight: 160, border: '1.5px dashed rgba(255,255,255,.15)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(136,136,228,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(136,136,228,.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>
                    </div>
                    <div style={{ color: '#ffffff', fontWeight: 500, fontSize: 16, textAlign: 'center' }}>Add your first destination</div>
                    <div style={{ color: '#4a4a68', fontWeight: 400, fontSize: 13, textAlign: 'center' }}>Press + to build your route</div>
                  </div>
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stops.map((stop, idx) => (
                      <div key={stop.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}>
                        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: `${ACCENT}22`, border: `1.5px solid ${ACCENT}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ACCENT }}>
                          {idx + 1}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name}</div>
                          {stop.address && (
                            <div style={{ color: '#4a4a68', fontSize: 11.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.address}</div>
                          )}
                        </div>
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
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(245,166,35,.35)', boxShadow: '0 0 20px rgba(245,140,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <span style={{ fontSize: 14 }}>✨</span>
                  <span style={{ color: '#f5c268', fontWeight: 700, fontSize: 14 }}>{aiHint ? 'Coming soon' : 'Generate trip with AI'}</span>
                </button>
              </>
            )}

            {activeTab === 'days' && <ComingSoon label="Day-by-day planning" />}
            {activeTab === 'bookings' && <ComingSoon label="Bookings" />}
          </div>

          <BottomNav />
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setIsAddOpen(true)}
        title="Add destination"
        style={{ position: 'fixed', right: 18, bottom: 96, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(145deg, #f8c04a, #e8821a)', boxShadow: '0 0 32px rgba(245,140,0,.45), 0 8px 20px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, border: 'none', cursor: 'pointer' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {isAddOpen && <AddDestinationSheet onClose={() => setIsAddOpen(false)} onAdd={handleAddStop} />}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function RouteHero() {
  const waypoints = [
    { cx: 70, cy: 200, delay: 0 },
    { cx: 140, cy: 96, delay: 0.3 },
    { cx: 260, cy: 87, delay: 0.6 },
    { cx: 330, cy: 35, delay: 0.9 },
  ]
  return (
    <div style={{ position: 'relative', flex: 'none', height: 260, marginTop: 2 }}>
      <svg width="100%" height="100%" viewBox="0 0 393 260" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="routeglow" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="rgba(245,140,0,.20)" />
            <stop offset="100%" stopColor="rgba(245,140,0,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="393" height="260" fill="url(#routeglow)" />
        <g stroke="rgba(255,255,255,.05)" strokeWidth="1" fill="none">
          <path d="M-20 50 Q 100 15, 200 45 T 420 32" />
          <path d="M-20 105 Q 120 78, 220 112 T 420 96" />
          <path d="M-20 165 Q 140 138, 260 172 T 420 160" />
          <path d="M-20 218 Q 160 200, 280 224 T 420 212" />
        </g>
        <path
          d="M70 200 C 110 165, 90 122, 140 96 C 190 70, 210 112, 260 87 C 300 67, 300 47, 330 35"
          stroke="#8888e4" strokeWidth="2.5" fill="none" strokeDasharray="7 6"
          style={{ animation: 'dashmove 2.2s linear infinite', opacity: 0.85 }}
        />
        {waypoints.map((p, i) => (
          <g key={i}>
            <circle cx={p.cx} cy={p.cy} r="10" fill="rgba(245,140,0,.18)" style={{ animation: `pulseglow 2.4s ease-in-out infinite ${p.delay}s` }} />
            <circle cx={p.cx} cy={p.cy} r="6" fill="#f5a623" stroke="#0a1020" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 55%, #06061c 100%)' }} />
    </div>
  )
}

function SheetTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 12, borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`, color: active ? ACCENT : '#4a4a68', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}
    >
      {label}
    </button>
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
    <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', padding: '10px 8px 12px' }}>
      {items.map((item) => {
        const color = item.active ? ACCENT : '#363650'
        return (
          <div key={item.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
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
  const placesLib = useMapsLibrary('places')
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!placesLib) return
    autocompleteRef.current = new placesLib.AutocompleteService()
    placesServiceRef.current = new placesLib.PlacesService(document.createElement('div'))
  }, [placesLib])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q || !autocompleteRef.current) {
      setPredictions([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    debounceRef.current = setTimeout(() => {
      autocompleteRef.current!.getPlacePredictions({ input: q, types: ['establishment', 'geocode'] }, (results) => {
        setPredictions(results ?? [])
        setIsSearching(false)
      })
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleSelect = useCallback(
    (prediction: google.maps.places.AutocompletePrediction) => {
      if (!placesServiceRef.current) return
      setIsSaving(true)
      placesServiceRef.current.getDetails(
        { placeId: prediction.place_id, fields: ['name', 'geometry', 'formatted_address'] },
        async (result) => {
          if (!result?.geometry?.location) { setIsSaving(false); return }
          const lat = result.geometry.location.lat()
          const lng = result.geometry.location.lng()
          await onAdd(
            lat, lng,
            result.name || prediction.structured_formatting?.main_text || '',
            result.formatted_address || prediction.description
          )
          setIsSaving(false)
          onClose()
        }
      )
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
          {predictions.map((p) => (
            <button
              key={p.place_id}
              onClick={() => handleSelect(p)}
              disabled={isSaving}
              style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,.06)', cursor: isSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 600 }}>{p.structured_formatting?.main_text ?? p.description}</span>
              <span style={{ color: '#4a4a68', fontSize: 12 }}>{p.structured_formatting?.secondary_text ?? ''}</span>
            </button>
          ))}
          {query && !isSearching && predictions.length === 0 && (
            <div style={{ color: '#4a4a68', fontSize: 13, padding: '16px 8px', textAlign: 'center' }}>No results</div>
          )}
        </div>
      </div>
    </div>
  )
}
