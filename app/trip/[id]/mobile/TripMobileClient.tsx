'use client'

import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import type { Stop, Trip, TripCapabilities, TripMember } from '@/types'
import type { RouteLeg } from '@/lib/mapbox/directions'
import { createClient } from '@/lib/supabase/client'
import { TripRealtimeProvider, TripRealtimeStatusBadge, useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { PlanRouteDomain, TripBottomNav, type Section } from './PlanRouteDomain'
import { GLASS_BORDER, GLASS_FILL } from './domain-ui'
import { DeferredBoundary } from '@/components/ui/deferred-boundary'
import { showToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'

const loadPrepDomain = () => import('./PrepDomain')
const loadBudgetDomain = () => import('./BudgetDomain')
const loadJournalDomain = () => import('./JournalDomain')

const PrepDomain = lazy(() => loadPrepDomain().then((module) => ({ default: module.PrepDomain })))
const BudgetDomain = lazy(() => loadBudgetDomain().then((module) => ({ default: module.BudgetDomain })))
const JournalDomain = lazy(() => loadJournalDomain().then((module) => ({ default: module.JournalDomain })))

export interface TripMobileClientProps {
  trip: Trip
  stops: Stop[]
  currentUserId: string
  /** Active membership rows with role and lightweight profile data. */
  members: TripMember[]
  capabilities: TripCapabilities
}

const backButtonStyle = {
  width: 40,
  height: 40,
  borderRadius: 14,
  background: GLASS_FILL,
  border: `1px solid ${GLASS_BORDER}`,
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
} as const

function DomainLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(215,215,255,.62)', fontSize: 13 }}
    >
      Loading {label}…
    </div>
  )
}

/** Coordinates navigation and the small amount of state shared by Plan and Journal. */
export function TripMobileClient({ trip, stops: initialStops, currentUserId, members, capabilities }: TripMobileClientProps) {
  return (
    <TripRealtimeProvider tripId={trip.id}>
      <TripMobileContent trip={trip} stops={initialStops} currentUserId={currentUserId} members={members} capabilities={capabilities} />
    </TripRealtimeProvider>
  )
}

function TripMobileContent({ trip, stops: initialStops, currentUserId, members, capabilities }: TripMobileClientProps) {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<Section>('plan')
  const [visitedSections, setVisitedSections] = useState<Set<Section>>(() => new Set(['plan']))
  const [stops, setStops] = useState(initialStops)
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([])
  const [routeLegs, setRouteLegs] = useState<RouteLeg[]>([])
  const stopSyncPausedRef = useRef(false)
  const stopResyncPendingRef = useRef(false)

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

  const selectSection = useCallback((section: Section) => {
    setVisitedSections((previous) => {
      if (previous.has(section)) return previous
      const next = new Set(previous)
      next.add(section)
      return next
    })
    setActiveSection(section)
  }, [])

  const prefetchSection = useCallback((section: Section) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    if (section === 'prep') void loadPrepDomain().catch(() => undefined)
    else if (section === 'budget') void loadBudgetDomain().catch(() => undefined)
    else if (section === 'journal') void loadJournalDomain().catch(() => undefined)
  }, [])

  return (
    <div style={{ width: '100%', minHeight: '100svh', position: 'relative', background: 'linear-gradient(145deg, #06061c, #0a1020, #071216)', color: '#fff', fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif" }}>
      <TripRealtimeStatusBadge />
      <div style={{ display: activeSection === 'plan' ? 'block' : 'none' }} aria-hidden={activeSection !== 'plan'}>
        <PlanRouteDomain
          trip={trip}
          stops={stops}
          setStops={setStops}
          currentUserId={currentUserId}
          routePath={routePath}
          setRoutePath={setRoutePath}
          routeLegs={routeLegs}
          setRouteLegs={setRouteLegs}
          onSelectSection={selectSection}
          onPrefetchSection={prefetchSection}
          capabilities={capabilities}
          onStopSyncPaused={setStopSyncPaused}
        />
      </div>

      <div
        aria-hidden={activeSection === 'plan'}
        style={{ position: 'relative', zIndex: 10, height: '100svh', maxWidth: 480, margin: '0 auto', display: activeSection === 'plan' ? 'none' : 'flex', flexDirection: 'column' }}
      >
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 18px 14px', paddingTop: 'max(20px, env(safe-area-inset-top))', flex: 'none' }}>
            <button onClick={() => selectSection('plan')} title="Back to plan" aria-label="Back to plan" style={backButtonStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.2px' }}>
                {activeSection === 'prep' ? 'Prep' : activeSection === 'budget' ? 'Budget' : 'Journal'}
              </div>
              {!capabilities.canEdit && <div style={{ marginTop: 3, fontSize: 10.5, color: 'rgba(215,215,255,.55)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Read only</div>}
            </div>
            <div style={{ width: 40 }} />
          </header>
          <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 16px 16px' }}>
            {visitedSections.has('prep') && (
              <div style={{ display: activeSection === 'prep' ? 'block' : 'none' }} aria-hidden={activeSection !== 'prep'}>
                <DeferredBoundary label="the prep section" style={{ minHeight: 180 }}>
                  <Suspense fallback={<DomainLoading label="prep" />}>
                    <PrepDomain tripId={trip.id} vibe={trip.vibe} userId={currentUserId} canEdit={capabilities.canEdit} />
                  </Suspense>
                </DeferredBoundary>
              </div>
            )}
            {visitedSections.has('budget') && (
              <div style={{ display: activeSection === 'budget' ? 'block' : 'none' }} aria-hidden={activeSection !== 'budget'}>
                <DeferredBoundary label="the budget section" style={{ minHeight: 180 }}>
                  <Suspense fallback={<DomainLoading label="budget" />}>
                    <BudgetDomain trip={trip} members={members} currentUserId={currentUserId} canEdit={capabilities.canEdit} />
                  </Suspense>
                </DeferredBoundary>
              </div>
            )}
            {visitedSections.has('journal') && (
              <div style={{ display: activeSection === 'journal' ? 'block' : 'none' }} aria-hidden={activeSection !== 'journal'}>
                <DeferredBoundary label="the journal section" style={{ minHeight: 180 }}>
                  <Suspense fallback={<DomainLoading label="journal" />}>
                    <JournalDomain trip={trip} stops={stops} routeLegs={routeLegs} routePath={routePath} currentUserId={currentUserId} canEdit={capabilities.canEdit} />
                  </Suspense>
                </DeferredBoundary>
              </div>
            )}
          </main>
          <TripBottomNav active={activeSection} onSelect={selectSection} onPrefetch={prefetchSection} />
        </div>
      </div>
  )
}
