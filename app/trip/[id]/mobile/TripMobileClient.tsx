'use client'

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ItineraryItem, MemberRole, Profile, Stop, Trip, TripCapabilities, TripMember } from '@/types'
import type { RouteLeg } from '@/lib/mapbox/directions'
import { createClient } from '@/lib/supabase/client'
import { TripRealtimeProvider, TripRealtimeStatusBadge, useTripPresenceSection, useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { tripCapabilitiesForRole } from '@/lib/trip-capabilities'
import { PlanRouteDomain } from './PlanRouteDomain'
import { TripOverviewDomain } from './TripOverviewDomain'
import type { TripOverviewData } from './overview-data'
import { formatDateRange, tripTitle } from './trip-domain-utils'
import type { PrimaryNavSection } from './components/TripPrimaryNav'
import { TripPrimaryNav } from './components/TripPrimaryNav'
import { TripMobileHeader } from './components/TripMobileHeader'
import { TripMoreSheet } from './components/TripMoreSheet'
import { OfflineAccessSheet } from './components/OfflineAccessSheet'
import { OfflineStatus } from './components/OfflineStatus'
import { DeferredBoundary } from '@/components/ui/deferred-boundary'
import { showToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'

type LazySection = 'explore' | 'bookings'
type MoreDestination = 'budget' | 'packing' | 'journal' | 'travel'
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
const loadTravelModeDomain = () => import('./TravelModeDomain')

const ExploreDomain = lazy(() => loadExploreDomain().then((module) => ({ default: module.ExploreDomain })))
const BookingsDomain = lazy(() => loadBookingsDomain().then((module) => ({ default: module.BookingsDomain })))
const PrepDomain = lazy(() => loadPrepDomain().then((module) => ({ default: module.PrepDomain })))
const BudgetDomain = lazy(() => loadBudgetDomain().then((module) => ({ default: module.BudgetDomain })))
const JournalDomain = lazy(() => loadJournalDomain().then((module) => ({ default: module.JournalDomain })))
const TravelModeDomain = lazy(() => loadTravelModeDomain().then((module) => ({ default: module.TravelModeDomain })))

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

function orb(p: { top?: string; bottom?: string; left?: string; right?: string; translate?: string; w: number; h: number; color: string; blur: number }): React.CSSProperties {
  return {
    position: 'absolute',
    ...(p.top !== undefined && { top: p.top }),
    ...(p.bottom !== undefined && { bottom: p.bottom }),
    ...(p.left !== undefined && { left: p.left }),
    ...(p.right !== undefined && { right: p.right }),
    ...(p.translate !== undefined && { translate: p.translate }),
    width: p.w, height: p.h, borderRadius: '50%',
    background: p.color, filter: `blur(${p.blur}px)`,
    pointerEvents: 'none',
  }
}

const SCREEN_LABEL: Record<VisibleScreen, string> = {
  overview: 'Overview',
  plan: 'Plan',
  explore: 'Explore',
  bookings: 'Bookings',
  budget: 'Budget',
  packing: 'Packing',
  journal: 'Journal',
  travel: 'Travel Mode',
}

/** Coordinates navigation and the small amount of state shared by Plan and Journal. */
export function TripMobileClient({ trip, stops: initialStops, items: initialItems, itineraryEnabled, currentUserId, members, capabilities, initialSection, overview }: TripMobileClientProps) {
  return (
    <TripRealtimeProvider tripId={trip.id} currentUserId={currentUserId} members={members}>
      <TripMobileContent trip={trip} stops={initialStops} items={initialItems} itineraryEnabled={itineraryEnabled} currentUserId={currentUserId} members={members} capabilities={capabilities} initialSection={initialSection} overview={overview} />
    </TripRealtimeProvider>
  )
}

interface HistoryState {
  section?: PrimaryNavSection
  moreSheet?: boolean
  moreDestination?: MoreDestination
}

function TripMobileContent({ trip, stops: initialStops, items: initialItems, itineraryEnabled, currentUserId, members: initialMembers, capabilities: initialCapabilities, initialSection, overview }: TripMobileClientProps) {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<PrimaryNavSection>(initialSection)
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false)
  const [isOfflineSheetOpen, setIsOfflineSheetOpen] = useState(false)
  const [activeMoreDestination, setActiveMoreDestination] = useState<MoreDestination | null>(null)
  const [visitedLazy, setVisitedLazy] = useState<Set<LazySection | MoreDestination>>(() => {
    const visited = new Set<LazySection | MoreDestination>()
    if (initialSection === 'explore' || initialSection === 'bookings') visited.add(initialSection)
    return visited
  })
  const [stops, setStops] = useState(initialStops)
  const [items, setItems] = useState(initialItems)
  const [members, setMembers] = useState(initialMembers)
  const [capabilities, setCapabilities] = useState(initialCapabilities)
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([])
  const [routeLegs, setRouteLegs] = useState<RouteLeg[]>([])
  const stopSyncPausedRef = useRef(false)
  const stopResyncPendingRef = useRef(false)
  const itemSyncPausedRef = useRef(false)
  const itemResyncPendingRef = useRef(false)

  const visiblePresenceSection = activeMoreDestination ?? (isMoreSheetOpen ? 'more' : activeSection)
  useTripPresenceSection(visiblePresenceSection)

  const refreshMembership = useCallback(async () => {
    const supabase = createClient()
    const { data: memberships, error } = await supabase
      .from('trip_members')
      .select('user_id, role, joined_at')
      .eq('trip_id', trip.id)
    if (error || !memberships) return
    const own = memberships.find((member) => member.user_id === currentUserId)
    if (!own) {
      setMembers([])
      setCapabilities(tripCapabilitiesForRole('viewer'))
      showToast('Your access to this trip was removed.', 'info')
      router.replace('/trips?error=permission_revoked')
      return
    }
    const ids = memberships.map((member) => member.user_id)
    const { data: profiles } = await supabase.from('profiles').select('id,email,display_name,avatar_url').in('id', ids)
    const byId = new Map(((profiles ?? []) as Profile[]).map((profile) => [profile.id, profile]))
    setMembers(memberships.map((member) => ({
      trip_id: trip.id,
      user_id: member.user_id,
      role: member.role as MemberRole,
      joined_at: member.joined_at,
      profile: byId.get(member.user_id),
    })))
    setCapabilities(tripCapabilitiesForRole(own.role as MemberRole))
  }, [currentUserId, router, trip.id])

  useTripRealtimeTable<TripMember & Record<string, unknown>>(
    'trip_members',
    useCallback(() => { void refreshMembership() }, [refreshMembership]),
    refreshMembership,
  )

  // A removed user cannot read the trip-scoped delete signal after RLS takes
  // effect. This low-frequency canonical check closes that revocation gap
  // while the screen stays open without treating Presence as authorization.
  useEffect(() => {
    const interval = window.setInterval(() => void refreshMembership(), 30_000)
    return () => window.clearInterval(interval)
  }, [refreshMembership])

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
    <div className="atmosphere" style={{ width: '100%', minHeight: '100svh', position: 'relative', color: 'var(--color-text-primary)', fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif" }}>
      <div style={orb({ top: '2%', left: '50%', translate: '-50% 0', w: 380, h: 380, color: 'rgba(245,166,35,0.22)', blur: 90 })} />
      <div style={orb({ bottom: '22%', left: '-12%', w: 280, h: 280, color: 'rgba(120,50,220,0.18)', blur: 80 })} />
      <div style={orb({ top: '48%', right: '-10%', w: 240, h: 240, color: 'rgba(20,210,190,0.14)', blur: 80 })} />
      <TripRealtimeStatusBadge />
      <OfflineStatus userId={currentUserId} tripId={trip.id} />
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
              onOpenOffline={() => setIsOfflineSheetOpen(true)}
            />
          </div>
          {visitedLazy.has('explore') && (
            <div style={{ display: visibleScreen === 'explore' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'explore'}>
              <DeferredBoundary label="the explore section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="explore" />}>
                  <ExploreDomain
                    trip={trip}
                    stops={stops}
                    items={items}
                    setItems={setItems}
                    itineraryEnabled={itineraryEnabled}
                    currentUserId={currentUserId}
                    capabilities={capabilities}
                    onSelectSection={selectSection}
                  />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('bookings') && (
            <div style={{ display: visibleScreen === 'bookings' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'bookings'}>
              <DeferredBoundary label="the bookings section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="bookings" />}>
                  <BookingsDomain
                    trip={trip}
                    stops={stops}
                    items={items}
                    setItems={setItems}
                    itineraryEnabled={itineraryEnabled}
                    currentUserId={currentUserId}
                    capabilities={capabilities}
                    onSelectSection={selectSection}
                  />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('budget') && (
            <div style={{ display: visibleScreen === 'budget' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'budget'}>
              <DeferredBoundary label="the budget section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="budget" />}>
                  <BudgetDomain trip={trip} members={members} currentUserId={currentUserId} canEdit={capabilities.canEdit} itineraryItems={items} itineraryEnabled={itineraryEnabled} />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('packing') && (
            <div style={{ display: visibleScreen === 'packing' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'packing'}>
              <DeferredBoundary label="the packing section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="packing" />}>
                  <PrepDomain tripId={trip.id} vibe={trip.vibe} userId={currentUserId} canEdit={capabilities.canEdit} members={members} />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('journal') && (
            <div style={{ display: visibleScreen === 'journal' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'journal'}>
              <DeferredBoundary label="the journal section" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="journal" />}>
                  <JournalDomain trip={trip} stops={stops} routeLegs={routeLegs} routePath={routePath} currentUserId={currentUserId} canEdit={capabilities.canEdit} items={items} />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
          {visitedLazy.has('travel') && (
            <div style={{ display: visibleScreen === 'travel' ? 'block' : 'none' }} aria-hidden={visibleScreen !== 'travel'}>
              <DeferredBoundary label="travel mode" style={{ minHeight: 180 }}>
                <Suspense fallback={<DomainLoading label="travel mode" />}>
                  <TravelModeDomain
                    trip={trip}
                    items={items}
                    setItems={setItems}
                    currentUserId={currentUserId}
                    canEdit={capabilities.canEdit}
                    onOpenJournal={() => openMoreDestination('journal')}
                    onRecordExpense={() => openMoreDestination('budget')}
                  />
                </Suspense>
              </DeferredBoundary>
            </div>
          )}
        </main>
        <TripPrimaryNav active={navActive} onSelect={selectSection} onOpenMore={openMoreSheet} onPrefetch={prefetchSection} />
      </div>

      <TripMoreSheet
        open={isMoreSheetOpen}
        onClose={closeMoreSheet}
        onNavigate={openMoreDestination}
        trip={trip}
        stops={stops}
        userId={currentUserId}
        members={members}
        capabilities={capabilities}
        overview={overview}
        onOpenOffline={() => setIsOfflineSheetOpen(true)}
        onMembersChanged={() => void refreshMembership()}
      />
      <OfflineAccessSheet
        open={isOfflineSheetOpen}
        onClose={() => setIsOfflineSheetOpen(false)}
        userId={currentUserId}
        trip={trip}
        members={members}
        stops={stops}
        itinerary={items}
        routeGeometry={routePath}
      />
    </div>
  )
}
