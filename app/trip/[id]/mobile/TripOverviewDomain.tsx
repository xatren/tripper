'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import type { Stop, Trip, TripCapabilities, TripMember } from '@/types'
import { CURRENCY_SYMBOLS } from '@/types'
import type { RouteLeg } from '@/lib/mapbox/directions'
import { fetchDayWeather, type DayWeather } from '@/lib/weather/openMeteo'
import { useDistanceUnit, formatDistanceValue, type DistanceUnit } from '@/lib/settings'
import { tokens, InlineError, SkeletonBlock, StatusChip } from '@/components/mobile'
import { ACCENT_GRADIENT, SoonBadge } from './domain-ui'
import { computeStopSchedule, formatDateRange, formatHeaderDate, formatMoney, totalNights, type StopSchedule } from './trip-domain-utils'
import { tripLifecycle, currentTripDay, daysBetween, localDateISO, type TripLifecycle } from './trip-lifecycle'
import {
  OVERVIEW_EXPENSE_SELECT,
  OVERVIEW_JOURNAL_SELECT,
  OVERVIEW_PACKING_SELECT,
  type OverviewExpense,
  type OverviewJournalEntry,
  type OverviewPackingItem,
  type OverviewSection,
  type TripOverviewData,
} from './overview-data'
import { calculateEqualSplitSettlement } from './budget-settlement'
import type { PrimaryNavSection } from './components/TripPrimaryNav'
import { BottomSheet } from './components/BottomSheet'

export interface TripOverviewDomainProps {
  trip: Trip
  stops: Stop[]
  members: TripMember[]
  capabilities: TripCapabilities
  /** Server-fetched summary sections; each degrades independently. */
  initialData: TripOverviewData
  /** Route stats lifted from Plan's single Mapbox fetch — never refetched here. */
  routeLegs: RouteLeg[]
  /** Whether the overview screen is currently on screen (it stays mounted). */
  visible: boolean
  onSelectSection: (section: PrimaryNavSection) => void
  onOpenDestination: (destination: 'budget' | 'packing' | 'journal') => void
}

// ─── Section data (server-seeded, client-retryable) ─────────────────────────

function useOverviewSection<T>(tripId: string, initial: OverviewSection<T>, table: string, select: string) {
  const [section, setSection] = useState(initial)
  const [retrying, setRetrying] = useState(false)

  const retry = useCallback(async () => {
    setRetrying(true)
    const { data, error } = await createClient().from(table).select(select).eq('trip_id', tripId)
    if (!error && data) setSection({ status: 'ready', rows: data as T[] })
    else showToast("Still couldn't load that section.", 'error')
    setRetrying(false)
  }, [table, select, tripId])

  /** Background refresh when returning to the screen: update on success, keep current data on failure. */
  const refreshQuietly = useCallback(async () => {
    const { data, error } = await createClient().from(table).select(select).eq('trip_id', tripId)
    if (!error && data) setSection({ status: 'ready', rows: data as T[] })
  }, [table, select, tripId])

  return { section, retrying, retry, refreshQuietly }
}

// ─── Building blocks ─────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  background: tokens.surfaceRaised,
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 20,
  padding: 16,
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
      {children}
    </div>
  )
}

function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div style={{ padding: '12px 10px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: `1px solid ${tokens.glassSubtleBorder}`, textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: tokens.textMuted, letterSpacing: '.05em', textTransform: 'uppercase', marginTop: 3 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, fontWeight: 500, color: tokens.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>}
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', minHeight: 48, padding: '13px 20px', borderRadius: 14, border: 'none',
        background: ACCENT_GRADIENT, color: '#1a0800', fontWeight: 800, fontSize: 14, fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        boxShadow: '0 0 20px rgba(245,140,0,.25)',
      }}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', minHeight: 48, padding: '12px 20px', borderRadius: 14,
        background: 'rgba(255,255,255,.06)', border: `1px solid ${tokens.glassStandardBorder}`,
        color: tokens.textPrimary, fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

type RowTone = 'neutral' | 'warning' | 'success'

const ROW_TONES: Record<RowTone, { border: string; iconBg: string; iconColor: string }> = {
  neutral: { border: 'rgba(255,255,255,.08)', iconBg: 'rgba(255,255,255,.06)', iconColor: 'var(--color-accent-light)' },
  warning: { border: 'rgba(251,191,36,.32)', iconBg: 'rgba(251,191,36,.13)', iconColor: 'var(--color-warning)' },
  success: { border: 'rgba(30,180,110,.32)', iconBg: 'rgba(30,140,90,.14)', iconColor: 'var(--color-success)' },
}

function OverviewRow({ icon, title, hint, tone = 'neutral', onSelect, trailing }: {
  icon: ReactNode
  title: string
  hint?: string
  tone?: RowTone
  /** Omit for a purely informational row. */
  onSelect?: () => void
  trailing?: ReactNode
}) {
  const t = ROW_TONES[tone]
  const content = (
    <>
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: t.iconColor }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', color: tokens.textPrimary, fontWeight: 700, fontSize: 13.5 }}>{title}</span>
        {hint && <span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, marginTop: 1 }}>{hint}</span>}
      </span>
      {trailing}
      {onSelect && (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
          <path d="M6 4L10 8L6 12" stroke="rgba(215,215,255,.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  )
  const base: CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '10px 12px',
    borderRadius: 16, background: tokens.surfaceRaised, border: `1px solid ${t.border}`, textAlign: 'left',
  }
  if (!onSelect) return <div style={base}>{content}</div>
  return (
    <button type="button" onClick={onSelect} style={{ ...base, cursor: 'pointer', fontFamily: 'inherit' }}>
      {content}
    </button>
  )
}

function formatDriveTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Trip dates sheet (real mutation; no optimistic state) ───────────────────

const dateInputStyle: CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 12, padding: '11px 12px', fontSize: 14, color: '#fff', outline: 'none',
  fontFamily: 'inherit', colorScheme: 'dark', minHeight: 44,
}

function TripDatesSheet({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [start, setStart] = useState(trip.start_date ?? '')
  const [end, setEnd] = useState(trip.end_date ?? '')
  const [saving, setSaving] = useState(false)

  const invalid = !start || !end || end < start

  const save = async () => {
    if (invalid || saving) return
    setSaving(true)
    const { error } = await createClient().from('trips').update({ start_date: start, end_date: end }).eq('id', trip.id)
    setSaving(false)
    if (error) {
      showToast("Couldn't save the dates. Try again.", 'error')
      return
    }
    showToast('Trip dates saved.', 'success')
    onClose()
    router.refresh()
  }

  return (
    <BottomSheet open={open} onClose={onClose} titleId="trip-dates-sheet-title" title="Trip dates">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary }}>
          Start
          <input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} style={{ ...dateInputStyle, marginTop: 6 }} />
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary }}>
          End
          <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} style={{ ...dateInputStyle, marginTop: 6 }} />
        </label>
        {start && end && end < start && (
          <InlineError>The end date is before the start date.</InlineError>
        )}
        <PrimaryButton onClick={save} disabled={invalid || saving}>{saving ? 'Saving…' : 'Save dates'}</PrimaryButton>
      </div>
    </BottomSheet>
  )
}

// ─── Icons (16px, stroke inherits via color) ─────────────────────────────────

const icons = {
  route: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="2.4" /><circle cx="18" cy="5" r="2.4" /><path d="M8.2 17.5H15a3.2 3.2 0 0 0 0-6.4H9a3.2 3.2 0 0 1 0-6.4h6.6" /></svg>,
  packing: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l1 4M18 2l-1 4" /><rect x="5" y="6" width="14" height="15" rx="4" /><path d="M9 10v4M15 10v4" /></svg>,
  documents: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2.5H14L18 6.5V21.5H7Z" /><path d="M10 12H15M10 16H15" /></svg>,
  invite: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>,
  offline: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>,
  wallet: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.4" /><path d="M16 12h2.5" /><path d="M3 9.5h18" /></svg>,
  journal: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>,
  calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.4" /><path d="M8 3v4M16 3v4M3 10.5h18" /></svg>,
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function TripOverviewDomain({ trip, stops, members, capabilities, initialData, routeLegs, visible, onSelectSection, onOpenDestination }: TripOverviewDomainProps) {
  const { canEdit, canManageTrip } = capabilities
  const distanceUnit = useDistanceUnit()

  // Resolved after mount so SSR/hydration never disagree about "today"
  // (the server may sit in a different timezone than the device).
  const [todayISO, setTodayISO] = useState<string | null>(null)
  useEffect(() => { setTodayISO(localDateISO()) }, [])

  const expensesData = useOverviewSection<OverviewExpense>(trip.id, initialData.expenses, 'expenses', OVERVIEW_EXPENSE_SELECT)
  const packingData = useOverviewSection<OverviewPackingItem>(trip.id, initialData.packing, 'packing_items', OVERVIEW_PACKING_SELECT)
  const journalData = useOverviewSection<OverviewJournalEntry>(trip.id, initialData.journal, 'journal_entries', OVERVIEW_JOURNAL_SELECT)

  // Counts go stale while the user edits Budget/Packing/Journal; refresh
  // quietly whenever the overview comes back on screen.
  const wasHiddenRef = useRef(false)
  const refreshExpenses = expensesData.refreshQuietly
  const refreshPacking = packingData.refreshQuietly
  const refreshJournal = journalData.refreshQuietly
  useEffect(() => {
    if (!visible) {
      wasHiddenRef.current = true
      return
    }
    if (!wasHiddenRef.current) return
    void refreshExpenses()
    void refreshPacking()
    void refreshJournal()
  }, [visible, refreshExpenses, refreshPacking, refreshJournal])

  const [datesSheetOpen, setDatesSheetOpen] = useState(false)

  const lifecycle: TripLifecycle | null = todayISO ? tripLifecycle(trip, todayISO) : null

  const schedule: StopSchedule[] = useMemo(() => {
    const nights = Object.fromEntries(stops.map((s) => [s.id, s.nights ?? 1]))
    return computeStopSchedule(trip.start_date, stops, nights)
  }, [trip.start_date, stops])

  const hasDates = !!(trip.start_date && trip.end_date)
  const totalDays = hasDates ? totalNights(trip) + 1 : 0
  const dateRange = formatDateRange(trip.start_date, trip.end_date)

  const routeMeters = routeLegs.reduce((sum, leg) => sum + leg.distanceMeters, 0)
  const routeSeconds = routeLegs.reduce((sum, leg) => sum + leg.durationSeconds, 0)

  const sym = CURRENCY_SYMBOLS[trip.currency ?? 'USD'] ?? '$'
  const expensesReady = expensesData.section.status === 'ready'
  const spent = expensesData.section.rows.reduce((sum, e) => sum + Number(e.amount), 0)
  const budgetTotal = trip.total_budget || 0

  const packingReady = packingData.section.status === 'ready'
  const packingTotal = packingData.section.rows.length
  const packingChecked = packingData.section.rows.filter((i) => i.checked).length
  const uncheckedDocs = packingData.section.rows.filter((i) => i.category === 'documents' && !i.checked).length

  const journalReady = journalData.section.status === 'ready'
  const journalEntries = journalData.section.rows.length
  const journalPhotos = journalData.section.rows.reduce((sum, e) => sum + (e.journal_photos?.length ?? 0), 0)

  // Active-day derivations (the stop schedule is the itinerary fallback until
  // a richer per-day model exists).
  const dayNumber = lifecycle === 'active' && trip.start_date && todayISO ? currentTripDay(trip.start_date, todayISO) : 0
  const currentStopIndex = dayNumber > 0 ? schedule.findIndex((s) => s.dayStart <= dayNumber && dayNumber <= s.dayEnd) : -1
  const nextStopIndex = dayNumber > 0 ? schedule.findIndex((s) => s.dayStart > dayNumber) : -1
  const currentStop = currentStopIndex >= 0 ? stops[currentStopIndex] : null
  const nextStop = nextStopIndex >= 0 ? stops[nextStopIndex] : null
  const nextLeg = nextStopIndex > 0 ? routeLegs[nextStopIndex - 1] ?? null : null

  // Weather for the place that matters next: the upcoming stop on its arrival
  // date, else tonight's stop today. Hidden entirely when no real forecast.
  const weatherTarget = useMemo(() => {
    if (lifecycle !== 'active' || !todayISO) return null
    if (nextStop && nextStopIndex >= 0 && schedule[nextStopIndex]?.arrival) {
      return { name: nextStop.name, lat: nextStop.lat, lng: nextStop.lng, date: schedule[nextStopIndex].arrival as string }
    }
    if (currentStop) return { name: currentStop.name, lat: currentStop.lat, lng: currentStop.lng, date: todayISO }
    return null
  }, [lifecycle, todayISO, nextStop, nextStopIndex, currentStop, schedule])

  const [weather, setWeather] = useState<DayWeather | null>(null)
  useEffect(() => {
    setWeather(null)
    if (!weatherTarget) return
    let cancelled = false
    fetchDayWeather(weatherTarget.lat, weatherTarget.lng, weatherTarget.date).then((w) => {
      if (!cancelled) setWeather(w)
    })
    return () => { cancelled = true }
  }, [weatherTarget])

  const settlement = useMemo(
    () => calculateEqualSplitSettlement(members.map((m) => ({ id: m.user_id })), expensesData.section.rows),
    [members, expensesData.section.rows],
  )

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/join/${trip.invite_code}`
    try {
      await navigator.clipboard.writeText(link)
      showToast('Invite link copied.', 'success')
    } catch {
      showToast(`Share this join code: ${trip.invite_code}`, 'info')
    }
  }

  // Layout-stable skeleton while "today" resolves (one frame after mount).
  if (!lifecycle) {
    return (
      <div role="status" aria-label="Loading trip overview" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 14 }}>
        <SkeletonBlock height={148} radius={20} />
        <SkeletonBlock height={128} radius={20} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonBlock height={56} />
          <SkeletonBlock height={56} />
          <SkeletonBlock height={56} />
        </div>
      </div>
    )
  }

  const summaryCard = (
    <section aria-label="Trip summary" style={cardStyle}>
      <SectionLabel>Trip summary</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <StatTile
          label="Days"
          value={hasDates ? totalDays : 'Not set'}
          hint={hasDates ? dateRange : canEdit ? 'Add dates below' : 'No dates yet'}
        />
        <StatTile
          label="Stops"
          value={stops.length > 0 ? stops.length : 'None yet'}
          hint={stops.length === 0 ? 'Plan your route' : undefined}
        />
        <StatTile
          label="Route"
          value={routeLegs.length > 0 ? formatDistanceValue(routeMeters, distanceUnit) : '—'}
          hint={routeLegs.length > 0 ? `≈ ${formatDriveTime(routeSeconds)} driving` : stops.length >= 2 ? 'Calculating…' : 'Add 2+ stops'}
        />
        <StatTile
          label="Budget"
          value={expensesReady ? `${sym}${formatMoney(spent)}` : '—'}
          hint={!expensesReady ? 'Unavailable' : budgetTotal > 0 ? `of ${sym}${formatMoney(budgetTotal)}` : 'No budget set'}
        />
      </div>
    </section>
  )

  // Independent-section failures surface as their own retry strips.
  const errorStrips = (
    <>
      {!expensesReady && (
        <InlineError onRetry={expensesData.retrying ? undefined : expensesData.retry}>
          {expensesData.retrying ? 'Retrying expenses…' : "Couldn't load expenses."}
        </InlineError>
      )}
      {!packingReady && (
        <InlineError onRetry={packingData.retrying ? undefined : packingData.retry}>
          {packingData.retrying ? 'Retrying packing list…' : "Couldn't load the packing list."}
        </InlineError>
      )}
      {!journalReady && (
        <InlineError onRetry={journalData.retrying ? undefined : journalData.retry}>
          {journalData.retrying ? 'Retrying journal…' : "Couldn't load the journal."}
        </InlineError>
      )}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 14, paddingBottom: 8 }}>
      {lifecycle === 'undated' && (
        <UndatedContent
          canEdit={canEdit}
          hasStops={stops.length > 0}
          onAddDates={() => setDatesSheetOpen(true)}
          onOpenPlan={() => onSelectSection('plan')}
        />
      )}

      {lifecycle === 'upcoming' && trip.start_date && todayISO && (
        <section aria-label="Countdown" className="glass-standard" style={{ borderRadius: 20, padding: '20px 16px', textAlign: 'center' }}>
          <SectionLabel>Starts {formatHeaderDate(trip.start_date)}</SectionLabel>
          <div style={{ fontSize: 44, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 6 }}>
            {daysBetween(todayISO, trip.start_date)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: tokens.textSecondary, marginTop: 2 }}>
            {daysBetween(todayISO, trip.start_date) === 1 ? 'day to go' : 'days to go'}
          </div>
        </section>
      )}

      {lifecycle === 'active' && (
        <ActiveContent
          dayNumber={dayNumber}
          totalDays={totalDays}
          todayISO={todayISO}
          currentStop={currentStop}
          nextStop={nextStop}
          nextArrival={nextStopIndex >= 0 ? schedule[nextStopIndex]?.arrival ?? null : null}
          nextLeg={nextLeg}
          distanceUnit={distanceUnit}
          weather={weather}
          weatherPlace={weatherTarget?.name ?? null}
          canEdit={canEdit}
          hasStops={stops.length > 0}
          onViewPlan={() => onSelectSection('plan')}
          onAddMemory={() => onOpenDestination('journal')}
        />
      )}

      {lifecycle === 'completed' && (
        <CompletedContent
          dateRange={dateRange}
          journalReady={journalReady}
          journalEntries={journalEntries}
          journalPhotos={journalPhotos}
          expensesReady={expensesReady}
          hasExpenses={expensesData.section.rows.length > 0}
          transfersPending={settlement.transfers.length}
          onOpenJournal={() => onOpenDestination('journal')}
          onOpenBudget={() => onOpenDestination('budget')}
        />
      )}

      {summaryCard}
      {errorStrips}

      {lifecycle === 'upcoming' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Get ready</SectionLabel>
          <UpcomingReadiness
            hasStops={stops.length > 0}
            hasDates={hasDates}
            totalDays={totalDays}
            coveredDays={schedule.length > 0 ? schedule[schedule.length - 1].dayEnd : 0}
            packingReady={packingReady}
            packingTotal={packingTotal}
            packingChecked={packingChecked}
            uncheckedDocs={uncheckedDocs}
            canEdit={canEdit}
            showInvite={canManageTrip && members.length < 2 && !!trip.invite_code}
            onOpenPlan={() => onSelectSection('plan')}
            onOpenPacking={() => onOpenDestination('packing')}
            onInvite={copyInviteLink}
          />
        </div>
      )}

      {datesSheetOpen && <TripDatesSheet trip={trip} open={datesSheetOpen} onClose={() => setDatesSheetOpen(false)} />}
    </div>
  )
}

// ─── Undated ─────────────────────────────────────────────────────────────────

function UndatedContent({ canEdit, hasStops, onAddDates, onOpenPlan }: {
  canEdit: boolean
  hasStops: boolean
  onAddDates: () => void
  onOpenPlan: () => void
}) {
  return (
    <section aria-label="Trip dates" className="glass-standard" style={{ borderRadius: 20, padding: '22px 16px', textAlign: 'center' }}>
      <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.35)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: tokens.accentLight }}>
        {icons.calendar}
      </span>
      <div style={{ fontSize: 16, fontWeight: 800, color: tokens.textPrimary, marginTop: 10 }}>When is this trip?</div>
      <div style={{ fontSize: 12.5, color: tokens.textMuted, marginTop: 4, lineHeight: 1.5 }}>
        {canEdit
          ? 'Add dates to unlock the countdown, day-by-day plans and packing reminders.'
          : 'Dates haven’t been set yet. A trip editor can add them.'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {canEdit && <PrimaryButton onClick={onAddDates}>Add dates</PrimaryButton>}
        <GhostButton onClick={onOpenPlan}>{hasStops ? 'View plan' : 'Start planning stops'}</GhostButton>
      </div>
    </section>
  )
}

// ─── Upcoming readiness rows ─────────────────────────────────────────────────

function UpcomingReadiness({ hasStops, hasDates, totalDays, coveredDays, packingReady, packingTotal, packingChecked, uncheckedDocs, canEdit, showInvite, onOpenPlan, onOpenPacking, onInvite }: {
  hasStops: boolean
  hasDates: boolean
  totalDays: number
  coveredDays: number
  packingReady: boolean
  packingTotal: number
  packingChecked: number
  uncheckedDocs: number
  canEdit: boolean
  showInvite: boolean
  onOpenPlan: () => void
  onOpenPacking: () => void
  onInvite: () => void
}) {
  const unplanned = hasDates ? totalDays - coveredDays : 0
  const packingPct = packingTotal > 0 ? Math.round((packingChecked / packingTotal) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!hasStops ? (
        <OverviewRow icon={icons.route} title="No stops yet" hint="Sketch your route in Plan" tone="warning" onSelect={onOpenPlan} />
      ) : unplanned > 0 ? (
        <OverviewRow
          icon={icons.route}
          title={`${unplanned} ${unplanned === 1 ? 'day' : 'days'} unplanned`}
          hint="Extend a stay or add stops in Plan"
          tone="warning"
          onSelect={onOpenPlan}
        />
      ) : unplanned < 0 ? (
        <OverviewRow
          icon={icons.route}
          title={`Plan runs ${-unplanned} ${unplanned === -1 ? 'day' : 'days'} past your dates`}
          hint="Trim nights or adjust dates in Plan"
          tone="warning"
          onSelect={onOpenPlan}
        />
      ) : (
        <OverviewRow icon={icons.check} title="Every day has a stop" hint="Route covers your full date range" tone="success" onSelect={onOpenPlan} />
      )}

      {packingReady && (packingTotal > 0 ? (
        <OverviewRow
          icon={icons.packing}
          title={`Packing · ${packingChecked}/${packingTotal} packed`}
          hint={packingPct === 100 ? 'All packed' : `${packingPct}% done`}
          tone={packingPct === 100 ? 'success' : 'neutral'}
          onSelect={onOpenPacking}
        />
      ) : (
        <OverviewRow
          icon={icons.packing}
          title={canEdit ? 'Start your packing list' : 'No packing list yet'}
          hint={canEdit ? 'Get a starter list for this trip' : 'An editor can add one'}
          onSelect={onOpenPacking}
        />
      ))}

      {packingReady && uncheckedDocs > 0 && (
        <OverviewRow
          icon={icons.documents}
          title={`${uncheckedDocs} ${uncheckedDocs === 1 ? 'document' : 'documents'} not packed`}
          hint="Passport, bookings, insurance…"
          tone="warning"
          onSelect={onOpenPacking}
        />
      )}

      {showInvite && (
        <OverviewRow icon={icons.invite} title="Invite friends" hint="Copy a join link to share" onSelect={onInvite} />
      )}

      <OverviewRow
        icon={icons.offline}
        title="Download for offline"
        hint="Take the plan off-grid"
        trailing={<SoonBadge />}
        onSelect={() => showToast('Offline access is coming soon.', 'info')}
      />
    </div>
  )
}

// ─── Active ──────────────────────────────────────────────────────────────────

function ActiveContent({ dayNumber, totalDays, todayISO, currentStop, nextStop, nextArrival, nextLeg, distanceUnit, weather, weatherPlace, canEdit, hasStops, onViewPlan, onAddMemory }: {
  dayNumber: number
  totalDays: number
  todayISO: string | null
  currentStop: Stop | null
  nextStop: Stop | null
  nextArrival: string | null
  nextLeg: RouteLeg | null
  distanceUnit: DistanceUnit
  weather: DayWeather | null
  weatherPlace: string | null
  canEdit: boolean
  hasStops: boolean
  onViewPlan: () => void
  onAddMemory: () => void
}) {
  if (!hasStops) {
    return (
      <section aria-label="Today" className="glass-standard" style={{ borderRadius: 20, padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: tokens.textPrimary }}>Your trip has started</div>
        <div style={{ fontSize: 12.5, color: tokens.textMuted, marginTop: 4, lineHeight: 1.5 }}>
          No stops are planned yet — add where you’re headed.
        </div>
        <div style={{ marginTop: 14 }}>
          <PrimaryButton onClick={onViewPlan}>Open plan</PrimaryButton>
        </div>
      </section>
    )
  }

  const navTarget = nextStop ?? currentStop
  const navUrl = navTarget ? `https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}` : null
  const badWeather = weather && (weather.kind === 'rainy' || weather.kind === 'snowy')

  return (
    <section aria-label="Today" className="glass-standard" style={{ borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <SectionLabel>{totalDays > 0 ? `Day ${dayNumber} of ${totalDays}` : `Day ${dayNumber}`}</SectionLabel>
        {todayISO && <span style={{ fontSize: 11.5, fontWeight: 600, color: tokens.textMuted }}>{formatHeaderDate(todayISO)}</span>}
      </div>

      {currentStop && (
        <div style={{ fontSize: 17, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.01em', marginTop: 8 }}>
          Tonight in {currentStop.name}
        </div>
      )}

      {nextStop ? (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: tokens.textSecondary, marginTop: currentStop ? 4 : 8, lineHeight: 1.5 }}>
          Next: {nextStop.name}
          {nextArrival ? ` · arrives ${formatHeaderDate(nextArrival)}` : ''}
          {nextLeg ? ` · ≈ ${nextLeg.durationText} drive (${formatDistanceValue(nextLeg.distanceMeters, distanceUnit)})` : ''}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: tokens.textSecondary, marginTop: currentStop ? 4 : 8 }}>
          {currentStop ? 'This is your final stop — enjoy it.' : 'Check today’s plan for what’s next.'}
        </div>
      )}

      {weather && weatherPlace && (
        <div style={{ marginTop: 10 }}>
          <StatusChip tone={badWeather ? 'warning' : 'neutral'}>
            {badWeather
              ? `${weather.kind === 'snowy' ? 'Snow' : 'Rain'} expected in ${weatherPlace}`
              : `${weatherPlace} forecast`} · {weather.high}°/{weather.low}°
          </StatusChip>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {navUrl && navTarget && (
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48,
              padding: '13px 20px', borderRadius: 14, background: ACCENT_GRADIENT, color: '#1a0800',
              fontWeight: 800, fontSize: 14, textDecoration: 'none', boxShadow: '0 0 20px rgba(245,140,0,.25)',
            }}
          >
            Navigate to {navTarget.name}
          </a>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <GhostButton onClick={onViewPlan}>View day</GhostButton>
          {canEdit && <GhostButton onClick={onAddMemory}>Add memory</GhostButton>}
        </div>
      </div>
    </section>
  )
}

// ─── Completed ───────────────────────────────────────────────────────────────

function CompletedContent({ dateRange, journalReady, journalEntries, journalPhotos, expensesReady, hasExpenses, transfersPending, onOpenJournal, onOpenBudget }: {
  dateRange: string
  journalReady: boolean
  journalEntries: number
  journalPhotos: number
  expensesReady: boolean
  hasExpenses: boolean
  transfersPending: number
  onOpenJournal: () => void
  onOpenBudget: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <section aria-label="Trip recap" className="glass-standard" style={{ borderRadius: 20, padding: 16 }}>
        <SectionLabel>Trip complete</SectionLabel>
        <div style={{ fontSize: 17, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.01em', marginTop: 6 }}>
          How was the ride?
        </div>
        {dateRange && <div style={{ fontSize: 12.5, fontWeight: 600, color: tokens.textSecondary, marginTop: 2 }}>{dateRange}</div>}
        {journalReady && (
          <div style={{ fontSize: 12.5, fontWeight: 600, color: tokens.textSecondary, marginTop: 8 }}>
            {journalEntries === 0 && journalPhotos === 0
              ? 'No journal entries yet — relive it while it’s fresh.'
              : `${journalEntries} journal ${journalEntries === 1 ? 'entry' : 'entries'} · ${journalPhotos} ${journalPhotos === 1 ? 'photo' : 'photos'}`}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <PrimaryButton onClick={onOpenJournal}>Open recap &amp; journal</PrimaryButton>
        </div>
        <div style={{ fontSize: 11.5, color: tokens.textMuted, marginTop: 10, lineHeight: 1.5 }}>
          Your recap, journal and photos stay private to trip members until you choose to share them.
        </div>
      </section>

      {expensesReady && hasExpenses && (transfersPending > 0 ? (
        <OverviewRow
          icon={icons.wallet}
          title={`Unsettled balances · ${transfersPending} ${transfersPending === 1 ? 'transfer' : 'transfers'} pending`}
          hint="See who owes whom in Budget"
          tone="warning"
          onSelect={onOpenBudget}
        />
      ) : (
        <OverviewRow icon={icons.check} title="All settled up" hint="No balances left to sort out" tone="success" onSelect={onOpenBudget} />
      ))}

      {journalReady && journalEntries === 0 && (
        <OverviewRow icon={icons.journal} title="Capture the highlights" hint="Add photos and notes to the journal" onSelect={onOpenJournal} />
      )}
    </div>
  )
}
