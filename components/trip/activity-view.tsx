'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  ArrowLeft, Plus, Star, Loader2, Bookmark, Check,
  ChevronDown, ExternalLink, MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  Stop, Trip, ActivityResult, ActivityCategory, Activity,
} from '@/types'
import { ACTIVITY_CATEGORY_CONFIG } from '@/types'
import { createClient } from '@/lib/supabase/client'

/* ── Helpers ─────────────────────────────────────────────── */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10
}

/** Promisified wrapper — no pagination, just the first page per type */
function searchNearby(
  service: google.maps.places.PlacesService,
  req: google.maps.places.PlaceSearchRequest,
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve) => {
    service.nearbySearch(req, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        resolve(results)
      } else {
        resolve([])
      }
    })
  })
}

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/* ── Props ───────────────────────────────────────────────── */

interface ActivityViewProps {
  trip: Trip
  stops: Stop[]
  initialStopId?: string | null
  tripId: string
  currentUserId: string
  onBack: () => void
  onActivitiesChanged: (activities: ActivityResult[]) => void
}

const CATEGORIES = Object.keys(ACTIVITY_CATEGORY_CONFIG) as ActivityCategory[]

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export function ActivityView({
  trip,
  stops,
  initialStopId,
  tripId,
  currentUserId,
  onBack,
  onActivitiesChanged,
}: ActivityViewProps) {
  const [activeStopId, setActiveStopId] = useState<string | null>(
    initialStopId ?? stops[0]?.id ?? null,
  )
  const [showStopPicker, setShowStopPicker] = useState(false)
  const [activeCategory, setActiveCategory] = useState<ActivityCategory>('all')

  // Results cache: category → results
  const [cache, setCache] = useState<Map<ActivityCategory, ActivityResult[]>>(new Map())
  const fetchedRef = useRef<Set<ActivityCategory>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addMenuPlaceId, setAddMenuPlaceId] = useState<string | null>(null)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())

  const placesLib = useMapsLibrary('places')
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const attributionRef = useRef<HTMLDivElement>(null)

  const activeStop = stops.find((s) => s.id === activeStopId) ?? null
  const displayed = cache.get(activeCategory) ?? []

  /* ── Sync initialStopId changes (from parent "+" click) ── */
  useEffect(() => {
    if (initialStopId && initialStopId !== activeStopId) {
      setActiveStopId(initialStopId)
      // Reset cache for new stop
      setCache(new Map())
      fetchedRef.current.clear()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStopId])

  /* ── Init PlacesService ─────────────────────────────────── */
  useEffect(() => {
    if (!placesLib || !attributionRef.current) return
    placesServiceRef.current = new placesLib.PlacesService(attributionRef.current)
  }, [placesLib])

  /* ── Reset cache when active stop changes ────────────────── */
  useEffect(() => {
    setCache(new Map())
    fetchedRef.current.clear()
  }, [activeStopId])

  /* ── Fetch when category or stop changes ─────────────────── */
  useEffect(() => {
    if (!placesServiceRef.current || !activeStop) return
    if (fetchedRef.current.has(activeCategory)) return   // already cached

    const config = ACTIVITY_CATEGORY_CONFIG[activeCategory]
    const location = { lat: activeStop.lat, lng: activeStop.lng }

    setIsLoading(true)

    const seenIds = new Set<string>()

    // Seed seenIds with already-fetched results (cross-category dedup)
    cache.forEach((results) => results.forEach((r) => seenIds.add(r.placeId)))

    const mapResult = (
      r: google.maps.places.PlaceResult,
      cat: ActivityCategory,
    ): ActivityResult => ({
      placeId: r.place_id!,
      name: r.name!,
      address: r.vicinity ?? r.formatted_address ?? '',
      lat: r.geometry!.location!.lat(),
      lng: r.geometry!.location!.lng(),
      rating: r.rating,
      userRatingsTotal: r.user_ratings_total,
      priceLevel: r.price_level,
      photoUrl: r.photos?.[0]?.getUrl({ maxWidth: 400, maxHeight: 280 }),
      types: r.types ?? [],
      category: cat,
      distanceKm: haversineKm(activeStop.lat, activeStop.lng,
        r.geometry!.location!.lat(), r.geometry!.location!.lng()),
    })

    // Run all types in parallel
    Promise.all(
      config.types.map((type) =>
        searchNearby(placesServiceRef.current!, {
          location,
          radius: 50000,
          type: type as string,
        }),
      ),
    ).then((allTypeResults) => {
      const merged: ActivityResult[] = []

      for (const typeResults of allTypeResults) {
        for (const r of typeResults) {
          if (!r.place_id || !r.name || !r.geometry?.location) continue
          if (seenIds.has(r.place_id)) continue
          seenIds.add(r.place_id)
          merged.push(mapResult(r, activeCategory))
        }
      }

      // Sort by rating descending, then by distance
      merged.sort((a, b) => {
        const rDiff = (b.rating ?? 0) - (a.rating ?? 0)
        if (Math.abs(rDiff) > 0.1) return rDiff
        return (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
      })

      fetchedRef.current.add(activeCategory)
      setCache((prev) => new Map(prev).set(activeCategory, merged))
      onActivitiesChanged(merged)
      setIsLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeStop?.id, placesLib])

  /* ── Add to trip ─────────────────────────────────────────── */
  const handleAddActivity = useCallback(
    async (result: ActivityResult, stopId: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('activities').insert({
        trip_id: tripId,
        stop_id: stopId,
        place_id: result.placeId,
        name: result.name,
        address: result.address,
        lat: result.lat,
        lng: result.lng,
        category: result.category,
        google_types: result.types,
        photo_url: result.photoUrl ?? null,
        rating: result.rating ?? null,
        user_ratings_total: result.userRatingsTotal,
        created_by: currentUserId,
        time_of_day: null,
        order_index: 0,
      } satisfies Omit<Activity, 'id' | 'created_at' | 'day_number' | 'scheduled_at' |
        'duration_mins' | 'notes' | 'estimated_cost' | 'is_completed' | 'user_ratings_total'> & {
        user_ratings_total?: number
      })
      if (!error) setAddedIds((prev) => new Set(prev).add(result.placeId))
      setAddMenuPlaceId(null)
    },
    [tripId, currentUserId],
  )

  const toggleBookmark = useCallback((placeId: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev)
      if (next.has(placeId)) next.delete(placeId)
      else next.add(placeId)
      return next
    })
  }, [])

  /* ── Dates for active stop ──────────────────────────────── */
  const arrivalLabel = fmtDate(activeStop?.arrival_date)
  const departureLabel = fmtDate(activeStop?.departure_date)
  const cityName = activeStop?.name ?? 'Destination'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Hidden attribution div (required by Places API) */}
      <div ref={attributionRef} className="hidden" />

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-border/40 bg-card/90 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to plan
          </button>

          {/* Date pills */}
          <div className="flex items-center gap-1.5">
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

        {/* Title + stop picker */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <h2 className="text-xl font-bold text-foreground">
            Explore{' '}
            <span className="text-violet-400">{cityName}</span>
          </h2>

          {stops.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowStopPicker((v) => !v)}
                className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
              >
                {activeStop?.name ?? 'Stop'}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showStopPicker && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowStopPicker(false)} />
                  <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-border/60 bg-card p-1 shadow-2xl">
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
        </div>
      </header>

      {/* ── Category pills ──────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-border/40 bg-card/70 px-3 py-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const cfg = ACTIVITY_CATEGORY_CONFIG[cat]
            const isActive = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'text-white shadow-md'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
                style={isActive ? { backgroundColor: cfg.color } : undefined}
              >
                <span>{cfg.icon}</span>
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Count / loading bar ─────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-border/25 bg-muted/10 px-4 py-1.5">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
            <span className="text-[11px] text-muted-foreground">Searching places…</span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {displayed.length} place{displayed.length !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      {/* ── Activity list ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" onClick={() => setAddMenuPlaceId(null)}>
        {!isLoading && displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-2xl">
              {ACTIVITY_CATEGORY_CONFIG[activeCategory].icon}
            </div>
            <p className="text-sm font-medium text-muted-foreground">No places found</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Try a different category</p>
          </div>
        ) : (
          <div className="divide-y divide-border/25">
            {displayed.map((result) => (
              <ActivityCard
                key={result.placeId}
                result={result}
                stops={stops}
                isAdded={addedIds.has(result.placeId)}
                isBookmarked={bookmarkedIds.has(result.placeId)}
                addMenuOpen={addMenuPlaceId === result.placeId}
                onAdd={(stopId) => handleAddActivity(result, stopId)}
                onOpenAddMenu={(e) => {
                  e.stopPropagation()
                  setAddMenuPlaceId(
                    addMenuPlaceId === result.placeId ? null : result.placeId,
                  )
                }}
                onToggleBookmark={() => toggleBookmark(result.placeId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   ACTIVITY CARD
══════════════════════════════════════════════════════════ */
interface ActivityCardProps {
  result: ActivityResult
  stops: Stop[]
  isAdded: boolean
  isBookmarked: boolean
  addMenuOpen: boolean
  onAdd: (stopId: string) => void
  onOpenAddMenu: (e: React.MouseEvent) => void
  onToggleBookmark: () => void
}

function ActivityCard({
  result,
  stops,
  isAdded,
  isBookmarked,
  addMenuOpen,
  onAdd,
  onOpenAddMenu,
  onToggleBookmark,
}: ActivityCardProps) {
  const [imgError, setImgError] = useState(false)
  const cfg = ACTIVITY_CATEGORY_CONFIG[result.category]
  const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${result.placeId}`

  return (
    <div className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20">
      {/* Photo */}
      <div className="relative h-[76px] w-[110px] flex-shrink-0 overflow-hidden rounded-lg bg-muted/30">
        {result.photoUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.photoUrl}
            alt={result.name}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            {cfg.icon}
          </div>
        )}
        {/* Category badge */}
        <div
          className="absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
          style={{ backgroundColor: cfg.color + 'dd' }}
        >
          {cfg.label}
        </div>
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          {/* Name + rating */}
          <div className="flex items-start justify-between gap-1">
            <span className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
              {result.name}
            </span>
            {result.rating !== undefined && (
              <div className="flex flex-shrink-0 items-center gap-0.5 text-[11px]">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-bold text-foreground">
                  {result.rating.toFixed(1)}
                </span>
                {result.userRatingsTotal !== undefined && (
                  <span className="text-muted-foreground/50">
                    ({result.userRatingsTotal >= 1000
                      ? `${(result.userRatingsTotal / 1000).toFixed(1)}k`
                      : result.userRatingsTotal})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Address + distance */}
          <div className="mt-0.5 flex items-center gap-1.5">
            {result.distanceKm !== undefined && (
              <span
                className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                style={{ backgroundColor: cfg.color + 'bb' }}
              >
                {result.distanceKm < 1
                  ? `${Math.round(result.distanceKm * 1000)} m`
                  : `${result.distanceKm} km`}
              </span>
            )}
            <p className="line-clamp-1 text-[11px] text-muted-foreground/60">
              {result.address}
            </p>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between">
          {/* Google Maps link */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/50 transition-colors hover:text-primary"
          >
            <MapPin className="h-3 w-3" />
            <span>Maps</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Bookmark */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleBookmark() }}
              title="Bookmark"
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                isBookmarked
                  ? 'text-amber-400'
                  : 'text-muted-foreground/30 hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
            </button>

            {/* Add to trip */}
            <div className="relative">
              {isAdded ? (
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full ring-1"
                  style={{ backgroundColor: cfg.color + '33', color: cfg.color, outline: `1px solid ${cfg.color}55` }}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
              ) : (
                <button
                  onClick={stops.length === 1
                    ? (e) => { e.stopPropagation(); onAdd(stops[0].id) }
                    : onOpenAddMenu}
                  title="Add to trip"
                  className="flex h-6 w-6 items-center justify-center rounded-full ring-1 transition-colors"
                  style={{
                    backgroundColor: cfg.color + '22',
                    color: cfg.color,
                    outlineColor: cfg.color,
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Stop picker dropdown (multi-stop trips) */}
              {addMenuOpen && !isAdded && (
                <>
                  <div className="fixed inset-0 z-20" />
                  <div className="absolute bottom-full right-0 z-30 mb-1 min-w-[160px] rounded-xl border border-border/60 bg-card p-1 shadow-2xl">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      Add to stop
                    </p>
                    {stops.map((stop) => (
                      <button
                        key={stop.id}
                        onClick={(e) => { e.stopPropagation(); onAdd(stop.id) }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground/60" />
                        {stop.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
