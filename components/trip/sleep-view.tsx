'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  ArrowLeft, BedDouble, Plus, ExternalLink, Star,
  Loader2, Bookmark, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Stop, Trip, HotelResult } from '@/types'
import { LodgingDialog, type LodgingFormData } from '@/components/trip/lodging-dialog'
import { createClient } from '@/lib/supabase/client'

/* ── Booking platform config ─────────────────────────────── */
const PLATFORMS = [
  {
    id: 'booking', name: 'Booking.com', letter: 'B',
    bg: '#003580', fg: '#fff',
    getUrl: (q: string) => `https://www.booking.com/search.html?ss=${q}`,
  },
  {
    id: 'expedia', name: 'Expedia', letter: 'E',
    bg: '#fbcc33', fg: '#1a1a1a',
    getUrl: (q: string) => `https://www.expedia.com/Hotel-Search?destination=${q}`,
  },
  {
    id: 'agoda', name: 'Agoda', letter: 'a',
    bg: '#e31e26', fg: '#fff',
    getUrl: (q: string) => `https://www.agoda.com/search?city=${q}`,
  },
  {
    id: 'hotels', name: 'Hotels.com', letter: 'H',
    bg: '#dc0714', fg: '#fff',
    getUrl: (q: string) => `https://www.hotels.com/search.do?q-destination=${q}`,
  },
  {
    id: 'vio', name: 'Vio.com', letter: 'V',
    bg: '#ff6600', fg: '#fff',
    getUrl: (q: string) => `https://www.vio.com/accommodation/${q}`,
  },
  {
    id: 'trip', name: 'Trip.com', letter: 'T',
    bg: '#1a75ff', fg: '#fff',
    getUrl: (q: string) => `https://www.trip.com/hotels/list?city=${q}`,
  },
  {
    id: 'hostelworld', name: 'Hostelworld', letter: 'H',
    bg: '#e87722', fg: '#fff',
    getUrl: (q: string) => `https://www.hostelworld.com/s?q=${q}`,
  },
  {
    id: 'airbnb', name: 'Airbnb', letter: 'A',
    bg: '#ff385c', fg: '#fff',
    getUrl: (q: string) => `https://www.airbnb.com/s/${q}/homes`,
  },
] as const

/* ── Props ───────────────────────────────────────────────── */
interface SleepViewProps {
  trip: Trip
  stops: Stop[]
  /** Stop to show hotels for — updated externally when user clicks "+" on a stop row. */
  initialStopId?: string | null
  tripId: string
  currentUserId: string
  onBack: () => void
  onHotelsChanged: (hotels: HotelResult[]) => void
}

/* ── Helpers ─────────────────────────────────────────────── */
function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export function SleepView({
  trip,
  stops,
  initialStopId,
  tripId,
  currentUserId,
  onBack,
  onHotelsChanged,
}: SleepViewProps) {
  const [activeStopId, setActiveStopId] = useState<string | null>(
    initialStopId ?? stops[0]?.id ?? null
  )
  const [showStopPicker, setShowStopPicker] = useState(false)
  const [hotels, setHotels] = useState<HotelResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [inYourTrip, setInYourTrip] = useState(false)
  const [addingHotel, setAddingHotel] = useState<HotelResult | null>(null)
  const [addingCustom, setAddingCustom] = useState(false)
  const [savingError, setSavingError] = useState<string | null>(null)

  const placesLib = useMapsLibrary('places')
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const attributionRef = useRef<HTMLDivElement>(null)

  const activeStop = stops.find((s) => s.id === activeStopId) ?? null

  /* ── Sync activeStopId when parent changes initialStopId ── */
  useEffect(() => {
    if (initialStopId && initialStopId !== activeStopId) {
      setActiveStopId(initialStopId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStopId])

  /* ── Init PlacesService with a hidden div ──────────────── */
  useEffect(() => {
    if (!placesLib || !attributionRef.current) return
    placesServiceRef.current = new placesLib.PlacesService(attributionRef.current)
  }, [placesLib])

  /* ── Search hotels near active stop (city-wide, paginated) ─ */
  useEffect(() => {
    if (!placesServiceRef.current || !activeStop) return
    setIsLoading(true)
    setHotels([])

    const accumulated: HotelResult[] = []

    const mapResult = (r: google.maps.places.PlaceResult): HotelResult => ({
      placeId: r.place_id!,
      name: r.name!,
      address: r.vicinity ?? r.formatted_address ?? '',
      lat: r.geometry!.location!.lat(),
      lng: r.geometry!.location!.lng(),
      rating: r.rating,
      userRatingsTotal: r.user_ratings_total,
      priceLevel: r.price_level,
      photoUrl: r.photos?.[0]?.getUrl({ maxWidth: 400, maxHeight: 280 }),
    })

    const handlePage = (
      results: google.maps.places.PlaceResult[] | null,
      status: google.maps.places.PlacesServiceStatus,
      pagination: google.maps.places.PlaceSearchPagination | null,
    ) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const mapped = results
          .filter((r) => r.place_id && r.name && r.geometry?.location)
          .map(mapResult)
        accumulated.push(...mapped)
        setHotels([...accumulated])
        onHotelsChanged([...accumulated])

        // Fetch next page after the required delay (Google enforces ~2s)
        if (pagination?.hasNextPage) {
          setTimeout(() => pagination.nextPage(), 2000)
        } else {
          setIsLoading(false)
        }
      } else {
        setIsLoading(false)
      }
    }

    placesServiceRef.current.nearbySearch(
      {
        location: { lat: activeStop.lat, lng: activeStop.lng },
        radius: 50000, // 50 km — city-wide coverage
        type: 'lodging',
      },
      handlePage,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStop?.id, placesLib])

  /* ── Save lodging to Supabase ────────────────────────────── */
  const handleSaveLodging = useCallback(
    async (data: LodgingFormData) => {
      const supabase = createClient()
      const description = `${data.hotelName}${data.location ? ` — ${data.location}` : ''} · ${data.nights} night${data.nights !== 1 ? 's' : ''}`
      const { error } = await supabase.from('expenses').insert({
        trip_id: tripId,
        stop_id: activeStopId,
        category: 'lodging',
        amount: data.totalCost,
        description,
        paid_by: currentUserId,
      })
      if (error) throw error
      setSavingError(null)
    },
    [activeStopId, tripId, currentUserId]
  )

  /* ── Date pills for active stop ─────────────────────────── */
  const arrivalLabel = fmtDate(activeStop?.arrival_date)
  const departureLabel = fmtDate(activeStop?.departure_date)

  /* ── City name: first word of stop name ──────────────────── */
  const cityName = activeStop?.name ?? 'Destination'

  /* ── Platform search query ───────────────────────────────── */
  const platformQuery = encodeURIComponent(cityName)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Hidden attribution container (required by Places API ToS) */}
      <div ref={attributionRef} className="hidden" />

      {/* ── Booking-platform micro-sidebar ──────────────────── */}
      <aside className="flex w-[100px] flex-shrink-0 flex-col border-r border-border/40 bg-card/60">

        {/* "In your trip" toggle */}
        <div className="border-b border-border/40 px-2 py-3">
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-center text-[10px] font-medium leading-tight text-muted-foreground">
              In your trip
            </span>
            <button
              onClick={() => setInYourTrip((v) => !v)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                inYourTrip ? 'bg-primary' : 'bg-muted/60'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                  inYourTrip ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Platform links */}
        <nav className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
          {PLATFORMS.map((p) => (
            <a
              key={p.id}
              href={p.getUrl(platformQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1.5 text-[11px] transition-colors hover:bg-secondary/60"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm text-[9px] font-bold"
                  style={{ backgroundColor: p.bg, color: p.fg }}
                >
                  {p.letter}
                </span>
                <span className="truncate text-foreground/80 group-hover:text-foreground">
                  {p.name}
                </span>
              </div>
              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/40" />
            </a>
          ))}
        </nav>
      </aside>

      {/* ── Main area: header + hotel list ──────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Header */}
        <header className="flex-shrink-0 border-b border-border/40 bg-card/90 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to plan
            </button>
            <Button
              size="sm"
              onClick={() => setAddingCustom(true)}
              className="h-7 gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add custom
            </Button>
          </div>

          {/* Title */}
          <h2 className="mt-2 text-xl font-bold text-foreground">
            Sleep in{' '}
            <span className="text-emerald-400">{cityName}</span>
          </h2>

          {/* Stop selector (if multiple stops) + date pills */}
          <div className="mt-2 flex items-center justify-between gap-2">
            {stops.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowStopPicker((v) => !v)}
                  className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {activeStop?.name ?? 'Select stop'}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showStopPicker && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowStopPicker(false)} />
                    <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-border/60 bg-card p-1 shadow-2xl">
                      {stops.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setActiveStopId(s.id); setShowStopPicker(false) }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
                            s.id === activeStopId ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {arrivalLabel && (
                <span className="rounded-full border border-border/50 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground/80">
                  {arrivalLabel}
                </span>
              )}
              {departureLabel && (
                <span className="rounded-full border border-border/50 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground/80">
                  {departureLabel}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Accommodation count bar */}
        {!isLoading && hotels.length > 0 && (
          <div className="flex-shrink-0 border-b border-border/30 bg-muted/10 px-4 py-2">
            <span className="text-[11px] text-muted-foreground">
              {hotels.length} accommodation{hotels.length !== 1 ? 's' : ''} found
            </span>
          </div>
        )}

        {/* Hotel list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
              <p className="mt-2 text-sm text-muted-foreground">Searching nearby hotels…</p>
            </div>
          ) : hotels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                <BedDouble className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No hotels found</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Try selecting a different stop</p>
            </div>
          ) : (
            <div className="divide-y divide-border/25">
              {hotels.map((hotel) => (
                <HotelCard
                  key={hotel.placeId}
                  hotel={hotel}
                  cityQuery={platformQuery}
                  onAdd={() => setAddingHotel(hotel)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lodging dialog (hotel-selected or custom) */}
      {savingError && (
        <div className="absolute bottom-4 right-4 z-50 rounded-lg bg-destructive/90 px-4 py-2 text-xs text-white shadow-lg">
          {savingError}
        </div>
      )}
      <LodgingDialog
        open={addingHotel !== null || addingCustom}
        stopName={activeStop?.name}
        prefilledName={addingHotel?.name}
        prefilledLocation={addingHotel?.address}
        onClose={() => { setAddingHotel(null); setAddingCustom(false) }}
        onSave={async (data) => {
          try {
            await handleSaveLodging(data)
          } catch {
            setSavingError('Could not save lodging. Please try again.')
          }
        }}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   HOTEL CARD
══════════════════════════════════════════════════════════ */
function HotelCard({
  hotel,
  cityQuery,
  onAdd,
}: {
  hotel: HotelResult
  cityQuery: string
  onAdd: () => void
}) {
  const bookingUrl = `https://www.booking.com/search.html?ss=${encodeURIComponent(hotel.name + ' ' + hotel.address)}`
  const [imgError, setImgError] = useState(false)

  return (
    <div className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20">
      {/* Photo */}
      <div className="relative h-[76px] w-[110px] flex-shrink-0 overflow-hidden rounded-lg bg-muted/30">
        {hotel.photoUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hotel.photoUrl}
            alt={hotel.name}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <BedDouble className="h-6 w-6 text-muted-foreground/25" />
          </div>
        )}
        {/* Price level indicator */}
        {hotel.priceLevel !== undefined && (
          <div className="absolute bottom-1 left-1 rounded bg-black/50 px-1 py-0.5 text-[9px] text-white backdrop-blur-sm">
            {'$'.repeat(Math.max(1, hotel.priceLevel))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          {/* Name + rating row */}
          <div className="flex items-start justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm bg-emerald-500/20">
                <BedDouble className="h-2.5 w-2.5 text-emerald-400" />
              </div>
              <span className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                {hotel.name}
              </span>
            </div>
            {hotel.rating !== undefined && (
              <div className="flex flex-shrink-0 items-center gap-0.5 text-[11px]">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-bold text-foreground">{hotel.rating.toFixed(1)}</span>
                {hotel.userRatingsTotal !== undefined && (
                  <span className="text-muted-foreground/50">
                    ({hotel.userRatingsTotal >= 1000
                      ? `${(hotel.userRatingsTotal / 1000).toFixed(1)}k`
                      : hotel.userRatingsTotal})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Address */}
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/60">
            {hotel.address}
          </p>
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between">
          {/* Booking.com link */}
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 transition-colors hover:text-primary"
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-white"
              style={{ backgroundColor: '#003580' }}
            >
              B
            </span>
            <span>See prices</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              title="Bookmark"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/30 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bookmark className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onAdd}
              title="Add to trip"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30 transition-colors hover:bg-emerald-500/30"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
