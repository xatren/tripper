'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Compass, Globe2, MapPinned, RefreshCw } from 'lucide-react'
import type { ItineraryItemType, Profile } from '@/types'
import { MAPBOX_TOKEN } from '@/lib/mapbox/client'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import { getCountryOptions, type CountryOption } from '@/lib/trip-country-selection'
import {
  DISCOVER_COUNTRY_STORAGE_KEY,
  countryByCode,
  firstTripCountry,
  preferStoredCountry,
  type DiscoverCountrySource,
  type DiscoverTripCandidate,
} from '@/lib/discover/discover-country'
import {
  DEFAULT_DISCOVER_CATEGORY,
  categoryAvailableAtZoom,
  curatedCategories,
  discoverCategory,
  liveCategories,
  type DiscoverCategoryId,
} from '@/lib/discover/categories'
import { DISCOVER_PLACES, DISCOVER_SEEDED_COUNTRIES } from '@/lib/discover/discover-places.generated'
import type { DiscoverPlace } from '@/lib/discover/discover-places.generated'
import { DISCOVER_ROUTES } from '@/lib/discover/discover-routes.generated'
import type { DiscoverRoute } from '@/lib/discover/discover-routes.generated'
import { filterDiscoverPlaces, filterDiscoverRoutes, hasCuratedCoverage } from '@/lib/discover/discover-query'
import {
  addedPlaceIds,
  buildCreateTripPayload,
  buildCreateTripPayloadFromRoute,
  buildRouteStopsPayload,
  buildStopInsertPayload,
  type StopLike,
} from '@/lib/discover/add-to-route'
import {
  isLiveDiscoverId,
  liveQueryKey,
  mapGooglePlaceToDiscoverPlace,
  mergeLiveResultBatches,
  rawPlaceId,
} from '@/lib/discover/discover-live'
import { findPlaceDuplicate, type DuplicateMatch } from '@/lib/google-places/pure'
import type { GooglePlaceErrorCode, GooglePlaceSearchResult, PlacesErrorResponse, PlacesSearchResponse } from '@/lib/google-places/types'
import type { AddToRouteTripOption } from '@/components/discover/AddToRouteButton'
import { AddPlaceToTripSheet, type AddPlaceInput, type ExploreTripOption } from '@/components/explore/AddPlaceToTripSheet'
import { AppBottomNav } from '@/components/ui/AppBottomNav'
import { DraggableSheet, type SheetLevel } from '@/components/mobile'
import { CountryPickerSheet } from '@/components/discover/CountryPickerSheet'
import { DiscoverCategoryRail } from '@/components/discover/DiscoverCategoryRail'
import { DiscoverTopBar } from '@/components/discover/DiscoverTopBar'
import { DiscoverResultsList } from '@/components/discover/DiscoverResultsList'
import { DiscoverRouteResultsList } from '@/components/discover/DiscoverRouteResultsList'
import { DiscoverPlaceSheet } from '@/components/discover/DiscoverPlaceSheet'
import { DiscoverRouteSheet } from '@/components/discover/DiscoverRouteSheet'
import type { DiscoverMapViewport } from '@/components/discover/DiscoverMap'
import styles from './Discover.module.css'

export interface DiscoverClientProps {
  profile: Profile | null
  trips: DiscoverTripCandidate[]
  /** Server-resolved country, already through the param → featured-trip → recent-trip precedence. */
  initialCountryCode: string | null
  initialCountrySource: DiscoverCountrySource
  /** Server-resolved `?cat=`, already defaulted for unknown values. */
  initialCategory: DiscoverCategoryId
  currentUserId: string
  /** Owner/editor trips only — "Add to Route" never offers a viewer trip (§9.3). */
  editableTrips: AddToRouteTripOption[]
  /** The Map-Home-style featured trip among `editableTrips`, or null with none. */
  activeTripId: string | null
  activeStops: StopLike[]
}

/** Clearance for the floating AppBottomNav, matching Map Home. */
const NAV_CLEARANCE = 92

/** §13: at this width the sheet becomes a fixed left rail instead of a bottom sheet. */
const WIDE_BREAKPOINT_QUERY = '(min-width: 1024px)'

/** Default itinerary shape for a live place saved via "Save to itinerary" (§9.1 secondary action), keyed by Discover category rather than Google's own type — Discover only ever offers three live categories. */
const LIVE_ITEM_DEFAULTS: Record<'food' | 'museums' | 'stays', { itemType: ItineraryItemType; durationMinutes: number }> = {
  food: { itemType: 'restaurant', durationMinutes: 75 },
  museums: { itemType: 'activity', durationMinutes: 120 },
  stays: { itemType: 'stay', durationMinutes: 0 },
}

type LiveState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; results: GooglePlaceSearchResult[] }
  | { status: 'error'; code: GooglePlaceErrorCode; retryable: boolean }

/** §6.2: collapsed peeks the result count and the first card; half/expanded scale with the viewport. */
function sheetHeightFor(level: SheetLevel, viewportHeight: number): number {
  if (level === 'collapsed') return 118
  if (level === 'half') return Math.round(viewportHeight * 0.45)
  return Math.max(390, viewportHeight - 170)
}

function parseLiveError(value: unknown): { code: GooglePlaceErrorCode; retryable: boolean } {
  const body = (value as { body?: unknown } | null)?.body as Partial<PlacesErrorResponse> | undefined
  const error = body?.error
  return { code: error?.code ?? 'provider_unavailable', retryable: error?.retryable ?? true }
}

/** §13: "one `isWide` boolean... drives the layout class and the padding shape." No separate desktop component. */
function useIsWideViewport(): boolean {
  const [isWide, setIsWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia(WIDE_BREAKPOINT_QUERY)
    const update = () => setIsWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isWide
}

function MapFallback({ message }: { message: string }) {
  return (
    <div className={styles.mapFallback} role="status">
      <MapPinned size={25} aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}

export function DiscoverClient({
  profile,
  trips,
  initialCountryCode,
  initialCountrySource,
  initialCategory,
  currentUserId,
  editableTrips,
  activeTripId,
  activeStops,
}: DiscoverClientProps) {
  const router = useRouter()
  const options = useMemo(() => getCountryOptions(), [])
  const isWide = useIsWideViewport()

  const [MapComponent, setMapComponent] = useState<typeof import('@/components/discover/DiscoverMap').DiscoverMap | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [online, setOnline] = useState(true)
  const [viewportHeight, setViewportHeight] = useState(800)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [countryCode, setCountryCode] = useState<string | null>(initialCountryCode)
  const [category, setCategory] = useState<DiscoverCategoryId>(initialCategory)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null)
  const [detailPlaceId, setDetailPlaceId] = useState<string | null>(null)
  // Routes (§9 Phase 7) get their own detail-id and in-flight state rather than
  // reusing detailPlaceId/savingPlaceId — a route clone/append is a different
  // shape of "in flight" (which of two actions, for a whole route) than a
  // single place insert.
  const [detailRouteId, setDetailRouteId] = useState<string | null>(null)
  const [routeActionRouteId, setRouteActionRouteId] = useState<string | null>(null)
  const [routeActionKind, setRouteActionKind] = useState<'clone' | 'append' | null>(null)
  const [sheetLevel, setSheetLevel] = useState<SheetLevel>('collapsed')
  // The active trip's stops, kept in sync locally after a successful insert so
  // "already added" and order_index stay correct without a refetch (§10.2).
  const [activeTripStops, setActiveTripStops] = useState<StopLike[]>(activeStops)
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null)

  // Live (Places) layer state (§8's Tier B, wired in Phase 5). The viewport
  // itself is never React state (§10.2/§14) — only the debounced settle
  // reaches here, from DiscoverMap's onViewportSettle.
  const [mapViewport, setMapViewport] = useState<DiscoverMapViewport | null>(null)
  const [liveState, setLiveState] = useState<LiveState>({ status: 'idle' })
  const [liveFetchedKey, setLiveFetchedKey] = useState<string | null>(null)
  const [liveDetailPlace, setLiveDetailPlace] = useState<GooglePlaceSearchResult | null>(null)
  const [liveSaving, setLiveSaving] = useState(false)

  const liveAbort = useRef<AbortController | null>(null)
  const liveSequence = useRef(0)
  // Session-only cache, never persisted (§8.5) — the same convention as
  // GooglePlacesExplorer's in-memory `Map<queryKey, results>`.
  const liveCache = useRef(new Map<string, GooglePlaceSearchResult[]>())

  const listRef = useRef<HTMLUListElement | null>(null)
  const country = useMemo(() => countryByCode(countryCode, options), [countryCode, options])

  // Countries the user already travels to, offered as one-tap picks.
  const suggested = useMemo(() => {
    const seen = new Map<string, CountryOption>()
    for (const trip of trips) {
      const first = firstTripCountry(trip, options)
      if (first && !seen.has(first.code)) seen.set(first.code, first)
    }
    return [...seen.values()].slice(0, 6)
  }, [options, trips])

  const places = useMemo(
    () => filterDiscoverPlaces(DISCOVER_PLACES, { countryCode: country?.code ?? null, categoryId: category }),
    [category, country],
  )

  // §9 Phase 7: the `routes` category's own dataset. No `DiscoverPlace` is ever
  // tagged `'routes'`, so `places` above is naturally empty whenever this
  // category is active — `routesForCountry` is what actually renders.
  const isRouteCategory = category === 'routes'
  const routesForCountry = useMemo(
    () => filterDiscoverRoutes(DISCOVER_ROUTES, country?.code ?? null),
    [country],
  )

  // §15 case 17: a live category at a zoom too far out never renders blank —
  // it falls back to the country's Must Visit set with an explicit note.
  const fallbackPlaces = useMemo(
    () => filterDiscoverPlaces(DISCOVER_PLACES, { countryCode: country?.code ?? null, categoryId: DEFAULT_DISCOVER_CATEGORY }),
    [country],
  )

  // One pass over the dataset per country rather than one per chip.
  const counts = useMemo(() => {
    const tally: Partial<Record<DiscoverCategoryId, number>> = {}
    for (const item of curatedCategories()) tally[item.id] = 0
    if (!country) return tally
    for (const place of DISCOVER_PLACES) {
      if (place.countryCode !== country.code) continue
      for (const id of place.categories) if (id in tally) tally[id] = (tally[id] ?? 0) + 1
    }
    // Routes never appear in the place tally above (no DiscoverPlace carries
    // the `routes` category id), so the chip's count comes from its own dataset.
    tally.routes = filterDiscoverRoutes(DISCOVER_ROUTES, country.code).length
    return tally
  }, [country])

  const countryIsMapped = hasCuratedCoverage(country?.code, DISCOVER_SEEDED_COUNTRIES)
  const railCategories = useMemo(() => [...curatedCategories(), ...liveCategories()], [])

  const activeCategoryDef = discoverCategory(category)
  const isLiveCategory = activeCategoryDef.source === 'places'
  const liveZoomOk = isLiveCategory && mapViewport != null && categoryAvailableAtZoom(activeCategoryDef, mapViewport.zoom)
  const liveViewportKey = isLiveCategory && mapViewport ? liveQueryKey(category, mapViewport) : null
  const liveResults = useMemo(() => (liveState.status === 'ready' ? liveState.results : []), [liveState])
  // A "Search this area" tap is still owed whenever the viewport has moved
  // past what was last searched — the button, never an automatic refetch (§4.3).
  const liveNeedsSearch = isLiveCategory && liveZoomOk && liveViewportKey !== liveFetchedKey

  useEffect(() => {
    let current = true
    import('@/components/discover/DiscoverMap')
      .then((module) => { if (current) setMapComponent(() => module.DiscoverMap) })
      .catch(() => { if (current) setMapFailed(true) })
    return () => { current = false }
  }, [])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    const updateHeight = () => setViewportHeight(window.innerHeight)
    updateOnline(); updateHeight()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    window.addEventListener('resize', updateHeight)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  // §15 case 13: a stop added from an open Plan tab (or another device) while
  // Discover sits in the background must not leave a stale "already added" set
  // once this tab is foregrounded again. Refetch on focus, not realtime (§10.2) —
  // the insert-time duplicate check catches the race either way.
  useEffect(() => {
    if (!activeTripId) return
    const refetchStops = () => {
      if (document.visibilityState !== 'visible') return
      void createClient()
        .from('stops')
        .select('id, name, lat, lng')
        .eq('trip_id', activeTripId)
        .then(({ data, error }) => { if (!error && data) setActiveTripStops(data as StopLike[]) })
    }
    document.addEventListener('visibilitychange', refetchStops)
    return () => document.removeEventListener('visibilitychange', refetchStops)
  }, [activeTripId])

  // localStorage is the second precedence step but is unreadable on the server,
  // so it is reconciled once after mount. A `?country=` deep link outranks it and
  // is left alone by preferStoredCountry.
  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(DISCOVER_COUNTRY_STORAGE_KEY)
    } catch {
      // Private-mode storage denial is not a reason to lose the server resolution.
      return
    }
    const preferred = preferStoredCountry(
      { country: countryByCode(initialCountryCode, options), source: initialCountrySource },
      stored,
      options,
    )
    if (preferred.country && preferred.country.code !== initialCountryCode) setCountryCode(preferred.country.code)
    // Runs once against the server resolution; later changes go through chooseCountry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Abort any in-flight live search on unmount.
  useEffect(() => () => { liveAbort.current?.abort() }, [])

  // Switching category clears live results rather than leaving stale pins
  // from the previous layer visible while the new one waits on its own
  // "Search this area" tap.
  useEffect(() => {
    setLiveState({ status: 'idle' })
    setLiveFetchedKey(null)
    liveAbort.current?.abort()
  }, [category])

  // The URL carries country and category together: writing one without the other
  // would silently drop the user's other choice from a shared or reloaded link.
  const writeUrl = useCallback((nextCountry: string | null, nextCategory: DiscoverCategoryId) => {
    const params = new URLSearchParams()
    if (nextCountry) params.set('country', nextCountry)
    if (nextCategory !== DEFAULT_DISCOVER_CATEGORY) params.set('cat', nextCategory)
    const query = params.toString()
    router.replace(query ? `/explore?${query}` : '/explore', { scroll: false })
  }, [router])

  const chooseCountry = useCallback((next: CountryOption) => {
    setCountryCode(next.code)
    setSelectedPlaceId(null)
    try {
      window.localStorage.setItem(DISCOVER_COUNTRY_STORAGE_KEY, next.code)
    } catch {
      // The URL still carries the choice, so a storage failure only costs persistence.
    }
    // One value, two durable homes: the URL makes it shareable and back-navigable.
    writeUrl(next.code, category)
  }, [category, writeUrl])

  const chooseCategory = useCallback((next: DiscoverCategoryId) => {
    setCategory(next)
    // A place selected on the old layer is not on the new one.
    setSelectedPlaceId(null)
    // First tap on a category raises the sheet so the new layer's results are
    // actually visible; a level the user already opened is left alone (§4.2).
    setSheetLevel((level) => level === 'collapsed' ? 'half' : level)
    writeUrl(countryCode, next)
  }, [countryCode, writeUrl])

  // A card tap toggles selection and never moves the sheet (§4.3); a marker tap
  // always selects, raises a collapsed sheet, and scrolls the row into view.
  const selectPlace = useCallback((id: string) => {
    setSelectedPlaceId((current) => current === id ? null : id)
  }, [])

  const selectFromMap = useCallback((id: string | null) => {
    setSelectedPlaceId(id)
    if (!id) return
    setSheetLevel((level) => level === 'collapsed' ? 'half' : level)
    const row = listRef.current?.querySelector<HTMLElement>(`[data-place-id="${CSS.escape(id)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [])

  const handleViewportSettle = useCallback((viewport: DiscoverMapViewport) => setMapViewport(viewport), [])

  // Live layers only ever fetch on an explicit tap — never on category switch,
  // never on moveend alone (§4.3). A cache hit resolves instantly with no
  // network call, mirroring GooglePlacesExplorer's session cache.
  const searchThisArea = useCallback(() => {
    if (!isLiveCategory || !liveZoomOk || !mapViewport || !liveViewportKey) return
    const cached = liveCache.current.get(liveViewportKey)
    if (cached) {
      setLiveState({ status: 'ready', results: cached })
      setLiveFetchedKey(liveViewportKey)
      return
    }

    const sequence = ++liveSequence.current
    liveAbort.current?.abort()
    const controller = new AbortController()
    liveAbort.current = controller
    setLiveState({ status: 'loading' })

    const placesCategories = activeCategoryDef.placesCategories ?? []
    Promise.all(placesCategories.map((placesCategory) => {
      const params = new URLSearchParams({
        category: placesCategory,
        limit: '12',
        radius: '50000',
        lat: String(mapViewport.lat),
        lng: String(mapViewport.lng),
      })
      return fetch(`/api/places/search?${params}`, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          const body: unknown = await response.json().catch(() => null)
          if (!response.ok) throw { body }
          return (body as PlacesSearchResponse).results ?? []
        })
    }))
      .then((batches) => {
        if (sequence !== liveSequence.current) return
        const merged = mergeLiveResultBatches(batches)
        liveCache.current.set(liveViewportKey, merged)
        setLiveState({ status: 'ready', results: merged })
        setLiveFetchedKey(liveViewportKey)
      })
      .catch((error: unknown) => {
        if (sequence !== liveSequence.current) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLiveState({ status: 'error', ...parseLiveError(error) })
      })
  }, [isLiveCategory, liveZoomOk, mapViewport, liveViewportKey, activeCategoryDef])

  const liveDisplayPlaces = useMemo(
    () => liveResults.map((result) => mapGooglePlaceToDiscoverPlace(result, category)),
    [liveResults, category],
  )
  // Curated stays "places"; a live category swaps in its own results (or the
  // Must Visit fallback while zoomed out, or while nothing has been searched yet).
  const displayPlaces = !isLiveCategory ? places : liveZoomOk ? liveDisplayPlaces : fallbackPlaces

  const openDetail = useCallback((id: string) => {
    if (isRouteCategory) {
      setDetailRouteId(id)
      return
    }
    if (isLiveDiscoverId(id)) {
      const raw = rawPlaceId(id)
      setLiveDetailPlace(liveResults.find((entry) => entry.placeId === raw) ?? null)
      return
    }
    setDetailPlaceId(id)
  }, [isRouteCategory, liveResults])
  const closeDetail = useCallback(() => setDetailPlaceId(null), [])
  const closeLiveDetail = useCallback(() => setLiveDetailPlace(null), [])
  const closeRouteDetail = useCallback(() => setDetailRouteId(null), [])

  const mapUnavailable = !MAPBOX_TOKEN || !online || mapFailed
  const fallbackMessage = !MAPBOX_TOKEN
    ? 'Map unavailable · you can still browse the list'
    : !online ? 'You are offline · the map will return when you reconnect' : 'The map could not load · try again in a moment'

  const sheetHeight = sheetHeightFor(sheetLevel, viewportHeight)
  const fitPadding = isWide
    ? { top: 96, right: 40, bottom: 40, left: 432 }
    : {
        top: 104,
        right: 40,
        bottom: Math.min(viewportHeight - 150, sheetHeight + NAV_CLEARANCE + 18),
        left: 34,
      }

  const activeLabel = activeCategoryDef.label
  const detailPlace = useMemo(
    () => (detailPlaceId ? places.find((place) => place.id === detailPlaceId) ?? null : null),
    [detailPlaceId, places],
  )
  const detailRoute = useMemo(
    () => (detailRouteId ? routesForCountry.find((route) => route.id === detailRouteId) ?? null : null),
    [detailRouteId, routesForCountry],
  )
  const activeTripTitle = useMemo(
    () => editableTrips.find((trip) => trip.id === activeTripId)?.title ?? null,
    [editableTrips, activeTripId],
  )

  // Never stored — derived fresh from the active trip's stops on every render (§10.2).
  const addedIds = useMemo(() => addedPlaceIds(places, activeTripStops), [places, activeTripStops])

  // Primary Add-to-Route path (§9.1): curated places only, mirroring
  // PlanRouteDomain.handleAddStop's insert-then-reconcile shape and retry toast.
  const addToTrip = useCallback((tripId: string, place: DiscoverPlace) => {
    if (savingPlaceId) return
    setSavingPlaceId(place.id)
    const supabase = createClient()
    const placeCategory = discoverCategory(place.categories[0])
    const tripTitle = editableTrips.find((trip) => trip.id === tripId)?.title ?? 'your trip'

    const resolveExistingCount = async () => {
      if (tripId === activeTripId) return activeTripStops.length
      const { count } = await supabase
        .from('stops')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', tripId)
      return count ?? 0
    }

    const attempt = async () => {
      const existingStopCount = await resolveExistingCount()
      const payload = buildStopInsertPayload(place, placeCategory, tripId, existingStopCount, currentUserId)
      const { data, error } = await supabase.from('stops').insert(payload).select().single()
      if (error || !data) {
        showToast("Couldn't add this place.", 'error', { label: 'Retry', onClick: () => { void attempt() } })
        return
      }
      if (tripId === activeTripId) {
        const row = data as StopLike
        setActiveTripStops((prev) => (prev.some((stop) => stop.id === row.id) ? prev : [...prev, row]))
      }
      showToast(`Added ${place.name} to ${tripTitle}`, 'success', {
        label: 'Reorder in Plan',
        onClick: () => router.push(`/trip/${tripId}/mobile?section=plan`),
      })
    }

    void attempt().finally(() => setSavingPlaceId(null))
  }, [savingPlaceId, activeTripId, activeTripStops, currentUserId, editableTrips, router])

  // "No active trip" (§9.3): mirrors ExploreClient.handleUseRoute's create_trip_with_stops call.
  const startTripWithPlace = useCallback((place: DiscoverPlace) => {
    if (savingPlaceId || !country) return
    setSavingPlaceId(place.id)
    const placeCategory = discoverCategory(place.categories[0])
    const payload = buildCreateTripPayload(place, placeCategory, { name: country.name, flag: country.flag })
    const supabase = createClient()
    supabase.rpc('create_trip_with_stops', payload).then(({ data, error }) => {
      setSavingPlaceId(null)
      const tripId = (data as { trip_id?: string } | null)?.trip_id
      if (error || !tripId) {
        showToast(error?.message ?? "Couldn't create the trip.", 'error')
        return
      }
      router.push(`/trip/${tripId}/mobile?section=plan`)
    })
  }, [savingPlaceId, country, router])

  // §9/§18 open question #12, resolved (Phase 7): "Use This Route" always
  // offers a brand-new trip (primary) — mirrors the retired
  // ExploreClient.handleUseRoute's create_trip_with_stops call exactly, no
  // `nights` key, letting the RPC's own one-night-per-omitted-stop default apply.
  const startTripFromRoute = useCallback((route: DiscoverRoute) => {
    if (routeActionRouteId) return
    setRouteActionRouteId(route.id)
    setRouteActionKind('clone')
    const payload = buildCreateTripPayloadFromRoute(route)
    const supabase = createClient()
    supabase.rpc('create_trip_with_stops', payload).then(({ data, error }) => {
      setRouteActionRouteId(null)
      setRouteActionKind(null)
      const tripId = (data as { trip_id?: string } | null)?.trip_id
      if (error || !tripId) {
        showToast(error?.message ?? "Couldn't create the trip.", 'error')
        return
      }
      router.push(`/trip/${tripId}/mobile?section=plan`)
    })
  }, [routeActionRouteId, router])

  // The secondary half of #12: appends every waypoint as sequential stops on
  // the active trip, the same "Discover appends; Plan arranges" contract
  // single-place Add to Route already follows (§9.1) — just several appends
  // in one insert rather than one. Direct `stops` insert, not the RPC, so
  // `nights` must be explicit (the table's own default is 0, not the RPC's 1).
  const appendRouteToTrip = useCallback((route: DiscoverRoute) => {
    if (routeActionRouteId || !activeTripId) return
    setRouteActionRouteId(route.id)
    setRouteActionKind('append')
    const supabase = createClient()
    const tripTitle = activeTripTitle ?? 'your trip'

    const attempt = async () => {
      const payload = buildRouteStopsPayload(route, activeTripId, activeTripStops.length, currentUserId)
      const { data, error } = await supabase.from('stops').insert(payload).select()
      if (error || !data) {
        showToast("Couldn't add this route.", 'error', { label: 'Retry', onClick: () => { void attempt() } })
        return
      }
      setActiveTripStops((prev) => [...prev, ...(data as StopLike[])])
      setDetailRouteId(null)
      showToast(`Added ${route.waypoints.length} stops from ${route.name} to ${tripTitle}`, 'success', {
        label: 'Reorder in Plan',
        onClick: () => router.push(`/trip/${activeTripId}/mobile?section=plan`),
      })
    }

    void attempt().finally(() => { setRouteActionRouteId(null); setRouteActionKind(null) })
  }, [routeActionRouteId, activeTripId, activeTripStops, currentUserId, activeTripTitle, router])

  // Secondary "Save to itinerary" path for live (Google) results (§9.1/§18.1
  // resolved: Places results have no independent coordinates, so they can
  // only ever become an itinerary item, never a stop). Reuses
  // AddPlaceToTripSheet exactly as GooglePlacesExplorer.insertPlace does,
  // simplified to Discover's always-unscheduled secondary action (§4.4) — no
  // day/time picker, so trip day metadata is never needed here.
  const exploreTripOptions = useMemo<ExploreTripOption[]>(
    () => editableTrips.map((trip) => ({ id: trip.id, title: trip.title, startDate: null, endDate: null, role: 'editor' })),
    [editableTrips],
  )
  const liveItemDefaults = (category === 'food' || category === 'museums' || category === 'stays')
    ? LIVE_ITEM_DEFAULTS[category]
    : LIVE_ITEM_DEFAULTS.museums
  const liveDuplicate = useMemo<DuplicateMatch | null>(() => {
    if (!liveDetailPlace) return null
    const sources = activeTripStops.map((stop) => ({
      id: stop.id, kind: 'stop' as const, provider: null, externalId: null,
      title: stop.name, localDate: null, lat: stop.lat, lng: stop.lng,
    }))
    return findPlaceDuplicate(
      { provider: 'google', externalId: liveDetailPlace.placeId, title: liveDetailPlace.name, lat: liveDetailPlace.lat, lng: liveDetailPlace.lng },
      sources,
    )
  }, [liveDetailPlace, activeTripStops])

  const saveLiveToTrip = useCallback((input: AddPlaceInput) => {
    if (!liveDetailPlace || liveSaving) return
    setLiveSaving(true)
    const supabase = createClient()
    const tripTitle = editableTrips.find((trip) => trip.id === input.tripId)?.title ?? 'your trip'
    const insertPayload = {
      trip_id: input.tripId, stop_id: null, item_type: input.itemType, title: input.title,
      notes: null, start_at: null, end_at: null, all_day: true, local_date: null, timezone: null,
      order_index: 0, lat: null, lng: null, address: null, place_provider: 'google',
      external_place_id: liveDetailPlace.placeId, normalized_address: null,
      duration_minutes: input.durationMinutes, status: 'planned', created_by: currentUserId,
    }
    supabase.from('itinerary_items').insert(insertPayload).select().single().then(({ data, error }) => {
      setLiveSaving(false)
      if (error || !data) { showToast("Couldn't save this place.", 'error'); return }
      setLiveDetailPlace(null)
      showToast(`Saved ${input.title} to ${tripTitle}`, 'success', {
        label: 'View in Plan', onClick: () => router.push(`/trip/${input.tripId}/mobile?section=plan`),
      })
    })
  }, [liveDetailPlace, liveSaving, editableTrips, currentUserId, router])

  const viewLiveDuplicate = useCallback(() => {
    setLiveDetailPlace(null)
    if (activeTripId) router.push(`/trip/${activeTripId}/mobile?section=plan`)
  }, [activeTripId, router])

  const resultCountText = !country
    ? 'Pick a country to start exploring'
    : isRouteCategory
      ? `${routesForCountry.length} road trip${routesForCountry.length === 1 ? '' : 's'} in ${country.name}`
      : isLiveCategory
        ? !liveZoomOk
          ? `Zoom in to search ${activeLabel.toLowerCase()} — showing Must Visit for now`
          : liveState.status === 'ready'
            ? `${liveDisplayPlaces.length} ${activeLabel.toLowerCase()} nearby`
            : `Search this area for ${activeLabel.toLowerCase()}`
        : `${displayPlaces.length} ${activeLabel.toLowerCase()} in ${country.name}`

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Discover destinations</h1>

      <section
        className={styles.mapLayer}
        role="region"
        aria-label={country ? `${country.name} discovery map` : 'World discovery map'}
      >
        {mapUnavailable ? <MapFallback message={fallbackMessage} /> : MapComponent ? (
          <MapComponent
            country={country}
            fitPadding={fitPadding}
            places={displayPlaces}
            routes={routesForCountry}
            category={category}
            selectedPlaceId={selectedPlaceId}
            hoveredPlaceId={hoveredPlaceId}
            onSelectPlace={selectFromMap}
            onMapError={() => setMapFailed(true)}
            onViewportSettle={handleViewportSettle}
          />
        ) : <MapFallback message="Opening the map…" />}
      </section>

      <div className={styles.topScrim} aria-hidden="true" />
      <div className={styles.bottomScrim} aria-hidden="true" />

      <DiscoverTopBar country={country} onOpenCountryPicker={() => setPickerOpen(true)} />

      <DraggableSheet
        level={isWide ? 'expanded' : sheetLevel}
        onLevelChange={setSheetLevel}
        heightFor={sheetHeightFor}
        historyIntegration={!isWide}
        variant={isWide ? 'rail' : 'sheet'}
        label="Discover results"
        className={isWide ? styles.sheetRail : styles.sheet}
        header={<DiscoverCategoryRail active={category} onChange={chooseCategory} counts={counts} categories={railCategories} zoom={mapViewport?.zoom} />}
      >
        <p className={styles.resultCount} aria-live="polite">{resultCountText}</p>

        {isLiveCategory && liveZoomOk && (
          <div className={styles.liveSearchBar}>
            <button
              type="button"
              className={styles.searchAreaButton}
              onClick={searchThisArea}
              disabled={liveState.status === 'loading'}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {liveState.status === 'loading' ? 'Searching…' : liveNeedsSearch ? 'Search this area' : 'Search again'}
            </button>
            {liveState.status === 'error' && (
              <span className={styles.liveError} role="alert">
                Couldn&apos;t load results{liveState.retryable ? ' — try again' : ''}.
              </span>
            )}
          </div>
        )}

        <div id="discover-results" className={styles.results}>
          {isRouteCategory ? (
            routesForCountry.length > 0 ? (
              <DiscoverRouteResultsList
                routes={routesForCountry}
                selectedRouteId={selectedPlaceId}
                onSelectRoute={selectPlace}
                onOpenDetail={openDetail}
              />
            ) : (
              <p className={styles.empty}>
                {!country
                  ? 'Choose a country and its road trips will appear here.'
                  : `No road trips mapped in ${country.name} yet.`}
              </p>
            )
          ) : displayPlaces.length > 0 ? (
            <DiscoverResultsList
              ref={listRef}
              places={displayPlaces}
              countryName={country?.name}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={selectPlace}
              onOpenDetail={openDetail}
              addedIds={addedIds}
              onHoverPlace={isWide ? setHoveredPlaceId : undefined}
            />
          ) : (
            <p className={styles.empty}>
              {!country
                ? 'Choose a country and its best places will appear here.'
                : isLiveCategory
                  ? liveState.status === 'ready'
                    ? `No ${activeLabel.toLowerCase()} found nearby. Try another area.`
                    : `Tap "Search this area" to look for ${activeLabel.toLowerCase()} near here.`
                  // "Nothing in this layer" and "nothing anywhere" are different
                  // failures and must not share one message (§15 cases 1–2).
                  : countryIsMapped
                    ? `No ${activeLabel.toLowerCase()} mapped in ${country.name} yet. Try another category.`
                    : `We haven't mapped ${country.name} yet — it's coming as the curated set grows.`}
            </p>
          )}
        </div>

        <div className={styles.credit}>
          <button
            type="button"
            className={country ? styles.creditAction : styles.creditActionPrimary}
            onClick={() => setPickerOpen(true)}
          >
            {country ? <Compass size={13} aria-hidden="true" /> : <Globe2 size={13} aria-hidden="true" />}
            {country ? 'Change country' : 'Choose a country'}
          </button>
          {/* Commons attribution obligation (§18 risk #3). The curated dataset has
              no OSM/Overpass data (confirmed against generate-discover-places.mjs),
              so no ODbL credit is owed here — only Wikidata (CC0, credited by
              courtesy) and per-image Wikimedia Commons license/author, which
              DiscoverPlaceSheet also carries per-file. Routes (Tier C) are
              hand-curated with no external license, so they get no credit line. */}
          {!isRouteCategory && (
            <span
              className={styles.creditText}
              title="Places data: Wikidata (CC0). Photos: Wikimedia Commons, licensed per image — author and license shown on each place's detail sheet."
            >
              Places: Wikidata (CC0) · Photos: Wikimedia Commons, per-image license
            </span>
          )}
        </div>
      </DraggableSheet>

      <AppBottomNav active="explore" profile={profile} floating />

      <CountryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        options={options}
        selectedCode={country?.code ?? null}
        suggested={suggested}
        onSelect={chooseCountry}
      />

      <DiscoverPlaceSheet
        place={detailPlace}
        countryName={country?.name}
        onClose={closeDetail}
        isAdded={detailPlace ? addedIds.has(detailPlace.id) : false}
        saving={detailPlace ? savingPlaceId === detailPlace.id : false}
        editableTrips={editableTrips}
        onAddToTrip={(tripId) => { if (detailPlace) addToTrip(tripId, detailPlace) }}
        onStartTrip={() => { if (detailPlace) startTripWithPlace(detailPlace) }}
      />

      <DiscoverRouteSheet
        route={detailRoute}
        onClose={closeRouteDetail}
        activeTripTitle={activeTripId ? activeTripTitle : null}
        cloning={routeActionKind === 'clone' && routeActionRouteId === detailRoute?.id}
        appending={routeActionKind === 'append' && routeActionRouteId === detailRoute?.id}
        onUseRoute={() => { if (detailRoute) startTripFromRoute(detailRoute) }}
        onAddToActiveTrip={() => { if (detailRoute) appendRouteToTrip(detailRoute) }}
      />

      <AddPlaceToTripSheet
        place={liveDetailPlace}
        trips={exploreTripOptions}
        lockedTripId={activeTripId ?? undefined}
        defaultUnscheduled
        itemType={liveItemDefaults.itemType}
        durationMinutes={liveItemDefaults.durationMinutes}
        duplicate={liveDuplicate}
        tripDataLoading={false}
        saving={liveSaving}
        onTripChange={() => {}}
        onViewExisting={viewLiveDuplicate}
        onClose={closeLiveDetail}
        onConfirm={saveLiveToTrip}
      />
    </main>
  )
}
