'use client'

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ItineraryItem, Stop, Trip, TripCapabilities, TripMember } from '@/types'
import type { RouteLeg } from '@/lib/mapbox/directions'
import { createClient } from '@/lib/supabase/client'
import { TripRealtimeProvider, TripRealtimeStatusBadge, useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { PlanRouteDomain } from './PlanRouteDomain'
import { TripOverviewDomain } from './TripOverviewDomain'
import type { TripOverviewData } from './overview-data'
import { formatDateRange, tripTitle } from './trip-domain-utils'
import type { PrimaryNavSection } from './components/TripPrimaryNav'
import { TripPrimaryNav } from './components/TripPrimaryNav'
import { TripMobileHeader } from './components/TripMobileHeader'
import { TripMoreSheet } from './components/TripMoreSheet'
import { DeferredBoundary } from '@/components/ui/deferred-boundary'
import { showToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'

type LazySection = 'explore' | 'bookings'
type MoreDestination = 'budget' | 'packing' | 'journal'
/** What's actually on screen — Plan's own section, or a More destination layered over it. */
type VisibleScreen = PrimaryNavSection | MoreDestination

const VALID_SECTIONS: PrimaryNavSection[] = ['overview', 'plan', 'explore', 'bookings']

function isPrimaryNavSection(value: unknown): value is PrimaryNavSection {
  return typeof value === 'string' && (VALID_SECTIONS as string[]).includes(value)
}

const loadExploreDomain = () => import('./components/ExploreDomain')
const loadBookingsDomain = () => import('./components/BookingsDomain')
const loadPrepDomain = () => import('./PrepDomain')
const loadBudgetDomain = () => import('./BudgetDomain')
const loadJournalDomain = () => import('./JournalDomain')

const ExploreDomain = lazy(() => loadExploreDomain().then((module) => ({ default: module.ExploreDomain })))
const BookingsDomain = lazy(() => loadBookingsDomain().then((module) => ({ default: module.BookingsDomain })))
const PrepDomain = lazy(() => loadPrepDomain().then((module) => ({ default: module.PrepDomain })))
const BudgetDomain = lazy(() => loadBudgetDomain().then((module) => ({ default: module.BudgetDomain })))
const JournalDomain = lazy(() => loadJournalDomain().then((module) => ({ default: module.JournalDomain })))

export interface TripMobileClientProps {
  trip: Trip
  stops: Stop[]
  /** Unified itinerary rows; empty until the itinerary migration is applied. */
  items: ItineraryItem[]
  /** False when the itinerary_items table isn't reachable yet (pre-migration DB). */
  itineraryEnabled: boolean
  currentUserId: string
  /** Active membership rows with role and lightweight profile data. */
  members: TripMember[]
  capabilities: TripCapabilities
  initialSection: PrimaryNavSection
  /** Server-batched summary sections for the Overview screen. */
  overview: TripOverviewData
}

function DomainLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}
    >
      Loading {label}…
    </div>
  )
}

const SCREEN_LABEL: Record<VisibleScreen, string> = {
  overview: 'Overview',
  plan: 'Plan',
  explore: 'Explore',
  bookings: 'Bookings',
  budget: 'Budget',
  packing: 'Packing',
  journal: 'Journal',
}

/** Coordinates navigation and the small amount of state shared by Plan and Journal. */
export function TripMobileClient({ trip, stops: initialStops, items: initialItems, itineraryEnabled, currentUserId, members, capabilities, initialSection, overview }: TripMobileClientProps) {
  return (
    <TripRealtimeProvider tripId={trip.id}>
      <TripMobileContent trip={trip} stops={initialStops} items={initialItems} itineraryEnabled={itineraryEnabled} currentUserId={currentUserId} members={members} capabilities={capabilities} initialSection={initialSection} overview={overview} />
    </TripRealtimeProvider>
  )
}

interface HistoryState {
  section?: PrimaryNavSection
  moreSheet?: boolean
  moreDestination?: MoreDestination
}

function TripMobileContent({ trip, stops: initialStops, items: initialItems, itineraryEnabled, currentUserId, members, capabilities, initialSection, overview }: TripMobileClientProps) {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<PrimaryNavSection>(initialSection)
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false)
  const [activeMoreDestination, setActiveMoreDestination] = useState<MoreDestination | null>(null)
  const [visitedLazy, setVisitedLazy] = useState<Set<LazySection | MoreDestination>>(() => new Set())
  const [stops, setStops] = useState(initialStops)
  const [items, setItems] = useState(initialItems)
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([])
  const [routeLegs, setRouteLegs] = useState<RouteLeg[]>([])
  const stopSyncPausedRef = useRef(false)
  const stopResyncPendingRef = useRef(false)
  const itemSyncPausedRef = useRef(false)
  const itemResyncPendingRef = useRef(false)

  const refreshStops = useCallback(async () => {
    if (stopSyncPausedRef.current) {
      stopResyncPendingRef.current = true
      return
    }
    const { data, error } = await createClient()
      .from('stops')
      .select('*')
      .eq('trip_id', trip.id)
      .order('order_index', { ascending: true })
    if (stopSyncPausedRef.current) {
      stopResyncPendingRef.current = true
      return
    }
    if (!error && data) {
      setStops(data as Stop[])
      return
    }
    if (error) {
      showToast("Couldn't refresh destinations.", 'error', { label: 'Retry', onClick: () => router.refresh() })
    }
  }, [router, trip.id])

  useTripRealtimeTable<Stop & Record<string, unknown>>(
    'stops',
    useCallback((change) => {
      if (stopSyncPausedRef.current) {
        stopResyncPendingRef.current = true
        return
      }
      const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<Stop>
      if (!row.id) return
      setStops((previous) => {
        if (change.eventType === 'DELETE') return previous.filter((stop) => stop.id !== row.id)
        const existing = previous.find((stop) => stop.id === row.id)
        const next = existing
          ? previous.map((stop) => (stop.id === row.id ? { ...stop, ...row } as Stop : stop))
          : [...previous, row as Stop]
        return next.sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
      })
    }, []),
    refreshStops,
  )

  const setStopSyncPaused = useCallback((paused: boolean) => {
    stopSyncPausedRef.current = paused
    if (!paused && stopResyncPendingRef.current) {
      stopResyncPendingRef.current = false
      void refreshStops()
    }
  }, [refreshStops])

  // Itinerary items mirror the stops pattern: optimistic local state, realtime
  // merge scoped to this trip, and a canonical refetch after reconnects.
  const refreshItems = useCallback(async () => {
    if (!itineraryEnabled) return
    if (itemSyncPausedRef.current) {
      itemResyncPendingRef.current = true
      return
    }
    const { data, error } = await createClient()
      .from('itinerary_items')
      .select('*')
      .eq('trip_id', trip.id)
      .order('local_date', { ascending: true })
      .order('order_index', { ascending: true })
    if (itemSyncPausedRef.current) {
      itemResyncPendingRef.current = true
      return
    }
    if (!error && data) setItems(data as ItineraryItem[])
  }, [itineraryEnabled, trip.id])

  useTripRealtimeTable<ItineraryItem & Record<string, unknown>>(
    'itinerary_items',
    useCallback((change) => {
      if (itemSyncPausedRef.current) {
        itemResyncPendingRef.current = true
        return
      }
      const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<ItineraryItem>
      if (!row.id) return
      setItems((previous) => {
        if (change.eventType === 'DELETE') return previous.filter((item) => item.id !== row.id)
        const existing = previous.find((item) => item.id === row.id)
        return existing
          ? previous.map((item) => (item.id === row.id ? { ...item, ...row } as ItineraryItem : item))
          : [...previous, row as ItineraryItem]
      })
    }, []),
    refreshItems,
  )

  const setItemSyncPaused = useCallback((paused: boolean) => {
    itemSyncPausedRef.current = paused
    if (!paused && itemResyncPendingRef.current) {
      itemResyncPendingRef.current = false
      void refreshItems()
    }
  }, [refreshItems])

  const markVisited = useCallback((key: LazySection | MoreDestination) => {
    setVisitedLazy((previous) => {
      if (previous.has(key)) return previous
      const next = new Set(previous)
      next.add(key)
      return next
    })
  }, [])

  // Deep-link sync: reflect nav state in the URL via the native History API so
  // sheet/section toggles never trigger a server re-fetch of this route.
  const urlFor = useCallback((section: 'overview' | 'plan' | 'explore' | 'bookings' | 'more') => {
    if (typeof window === 'undefined') return ''
    const url = new URL(window.location.href)
    url.searchParams.set('section', section)
    return `${url.pathname}${url.search}`
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.history.replaceState({ section: initialSection } satisfies HistoryState, '', urlFor(initialSection))
    // Only the initial history entry needs the starting section attached; deps intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPopState = (event: PopStateEvent) => {
      const state = (event.state ?? null) as HistoryState | null
      setIsMoreSheetOpen(!!state?.moreSheet)
      setActiveMoreDestination(state?.moreDestination ?? null)
      if (state?.section && isPrimaryNavSection(state.section)) setActiveSection(state.section)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const selectSection = useCallback((section: PrimaryNavSection) => {
    // Overview and Plan are always mounted; only lazy sections track visits.
    if (section === 'explore' || section === 'bookings') markVisited(section)
    setIsMoreSheetOpen(false)
    setActiveMoreDestination(null)
    setActiveSection(section)
    if (typeof window !== 'undefined') {
      window.history.pushState({ section } satisfies HistoryState, '', urlFor(section))
    }
  }, [markVisited, urlFor])

  const openMoreSheet = useCallback(() => {
    setIsMoreSheetOpen(true)
    if (typeof window !== 'undefined') {
      window.history.pushState({ section: activeSection, moreSheet: true } satisfies HistoryState, '', urlFor('more'))
    }
  }, [activeSection, urlFor])

  const closeMoreSheet = useCallback(() => setIsMoreSheetOpen(false), [])

  const openMoreDestination = useCallback((destination: MoreDestination) => {
    markVisited(destination)
    setIsMoreSheetOpen(false)
    setActiveMoreDestination(destination)
    if (typeof window !== 'undefined') {
      window.history.pushState({ section: activeSection, moreDestination: destination } satisfies HistoryState, '', urlFor('more'))
    }
  }, [activeSection, markVisited, urlFor])

  const closeMoreDestination = useCallback(() => setActiveMoreDestination(null), [])

  const prefetchSection = useCallback((section: PrimaryNavSection) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    if (section === 'explore') void loadExploreDomain().catch(() => undefined)
    else if (section === 'bookings') void loadBookingsDomain().catch(() => undefined)
  }, [])

  const visibleScreen: VisibleScreen = activeMoreDestination ?? activeSection
  const navActive = isMoreSheetOpen || activeMoreDestination ? 'more' : activeSection

  return (
    <div style={{ width: '100%', minHeight: '100svh', position: 'relative', background: 'var(--gradient-bg-app)', color: 'var(--color-text-primary)', fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif" }}>
      <TripRealtimeStatusBadge />
      <div style={{ display: visibleScreen === 'plan' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'plan'}>
        <PlanRouteDomain
          trip={trip}
          stops={stops}
          setStops={setStops}
          items={items}
          setItems={setItems}
          itineraryEnabled={itineraryEnabled}
          onItemSyncPaused={setItemSyncPaused}
          currentUserId={currentUserId}
          members={members}
          routePath={routePath}
          setRoutePath={setRoutePath}
          routeLegs={routeLegs}
          setRouteLegs={setRouteLegs}
          onSelectSection={selectSection}
          onPrefetchSection={prefetchSection}
          onOpenMore={openMoreSheet}
          capabilities={capabilities}
          onStopSyncPaused={setStopSyncPaused}
        />
      </div>

      <div
        aria-hidden={visibleScreen === 'plan'}
        style={{ position: 'relative', zIndex: 10, height: '100svh', maxWidth: 480, margin: '0 auto', display: visibleScreen === 'plan' ? 'none' : 'flex', flexDirection: 'column' }}
      >
        <TripMobileHeader
          variant="solid"
          title={visibleScreen === 'overview' ? tripTitle(trip, stops) : SCREEN_LABEL[visibleScreen === 'plan' ? 'explore' : visibleScreen]}
          subtitle={visibleScreen === 'overview' ? (formatDateRange(trip.start_date, trip.end_date) || 'No dates set') : undefined}
          readOnly={!capabilities.canEdit}
          members={members}
          tripId={trip.id}
          onBack={() => {
            if (activeMoreDestination) closeMoreDestination()
            else if (visibleScreen === 'overview') router.push('/trips')
            else selectSection('overview')
          }}
          onOpenMore={openMoreSheet}
          backLabel={activeMoreDestination ? `Back to ${SCREEN_LABEL[activeSection]}` : visibleScreen === 'overview' ? 'Back to trips' : 'Back to overview'}
        />
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 16px 16px' }}>
          <div style={{ display: visibleScreen === 'overview' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'overview'}>
            <TripOverviewDomain
              trip={trip}
              stops={stops}
              members={members}
              capabilities={capabilities}
              initialData={overview}
              routeLegs={routeLegs}
              visible={visibleScreen === 'overview'}
              onSelectSection={selectSection}
              onOpenDestination={openMoreDestination}
            />
          </div>
          {visitedLazy.has('explore') && (
            <div style={{ display: visibleScreen === 'explore' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'explore'}>
              <DeferredBoundary label="the explore section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="explore" />}>
                  <ExploreDomain />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('bookings') && (
            <div style={{ display: visibleScreen === 'bookings' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'bookings'}>
              <DeferredBoundary label="the bookings section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="bookings" />}>
                  <BookingsDomain trip={trip} stops={stops} />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('budget') && (
            <div style={{ display: visibleScreen === 'budget' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'budget'}>
              <DeferredBoundary label="the budget section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="budget" />}>
                  <BudgetDomain trip={trip} members={members} currentUserId={currentUserId} canEdit={capabilities.canEdit} />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('packing') && (
            <div style={{ display: visibleScreen === 'packing' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'packing'}>
              <DeferredBoundary label="the packing section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="packing" />}>
                  <PrepDomain tripId={trip.id} vibe={trip.vibe} userId={currentUserId} canEdit={capabilities.canEdit} />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('journal') && (
            <div style={{ display: visibleScreen === 'journal' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'journal'}>
              <DeferredBoundary label="the journal section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="journal" />}>
                  <JournalDomain trip={trip} stops={stops} routeLegs={routeLegs} routePath={routePath} currentUserId={currentUserId} canEdit={capabilities.canEdit} />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
        </main>
        <TripPrimaryNav active={navActive} onSelect={selectSection} onOpenMore={openMoreSheet} onPrefetch={prefetchSection} />
      </div>

      <TripMoreSheet open={isMoreSheetOpen} onClose={closeMoreSheet} onNavigate={openMoreDestination} trip={trip} stops={stops} />
    </div>
  )
}
