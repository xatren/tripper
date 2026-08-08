'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Camera,
  CheckSquare,
  ChevronRight,
  CloudDownload,
  Map as MapIcon,
  MoreHorizontal,
  Plane,
  Plus,
  ReceiptText,
  Route,
  WalletCards,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import type { Stop, Trip, TripCapabilities, TripMember } from '@/types'
import type { RouteLeg } from '@/lib/mapbox/directions'
import type { PlacesSearchResponse } from '@/lib/google-places/types'
import { selectIconicLandmarkPhoto, selectTripPhotoStop, tripLandmarkSearchParams } from '@/lib/trip-photo'
import { InlineError, SkeletonBlock } from '@/components/mobile'
import { DUSK } from '@/components/design/tokens'
import { computeStopSchedule, formatDateRange, totalNights, type StopSchedule } from './trip-domain-utils'
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
import {
  heroCopy,
  orderStops,
  photosActionLabel,
  preparationProgress,
  routeContextLabel,
  safeCoverImageUrl,
  splitDuskTitle,
  stopDateLabel,
  travelModeIsAccented,
  tripScopeLabel,
} from './overview-visual'
import type { PrimaryNavSection } from './components/TripPrimaryNav'
import { BottomSheet } from './components/BottomSheet'
import styles from './TripOverview.module.css'

export interface TripOverviewDomainProps {
  trip: Trip
  stops: Stop[]
  members: TripMember[]
  capabilities: TripCapabilities
  /** Server-fetched summary sections; each degrades independently. */
  initialData: TripOverviewData
  /** Route stats remain lifted from Plan, so Overview never causes another Mapbox request. */
  routeLegs: RouteLeg[]
  /** Whether the overview screen is currently on screen (it stays mounted). */
  visible: boolean
  onBack: () => void
  onOpenMore: () => void
  onOpenItinerary: () => void
  onSelectSection: (section: PrimaryNavSection) => void
  onOpenDestination: (destination: 'budget' | 'packing' | 'journal' | 'travel') => void
  onOpenOffline: () => void
}

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

  const refreshQuietly = useCallback(async () => {
    const { data, error } = await createClient().from(table).select(select).eq('trip_id', tripId)
    if (!error && data) setSection({ status: 'ready', rows: data as T[] })
  }, [table, select, tripId])

  return { section, retrying, retry, refreshQuietly }
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className={styles.sectionHeading}>{children}</h2>
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={styles.primaryButton}>
      {children}
    </button>
  )
}

function fallbackGradient(seed: string) {
  const palettes = [
    ['#284d55', '#2f7d78'],
    ['#342b66', '#62559b'],
    ['#21445b', '#3c7188'],
    ['#493253', '#7d5064'],
  ]
  const hash = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const [from, to] = palettes[hash % palettes.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}

/**
 * A trip-specific fallback for trips that do not have an explicit cover yet.
 * Photo references are cached per session so returning to Overview does not
 * repeat the Places search, while the actual media still flows through our
 * authenticated photo proxy.
 */
function useDestinationCover(trip: Trip, destination: Stop | null, enabled: boolean) {
  const [photoReference, setPhotoReference] = useState<string | null>(null)
  const country = trip.countries?.[0]
  const label = destination?.name.trim() || country?.name.trim() || ''
  const lat = destination?.lat ?? trip.focus_lat
  const lng = destination?.lng ?? trip.focus_lng

  useEffect(() => {
    setPhotoReference(null)
    if (!enabled || label.length < 2) return

    const controller = new AbortController()
    // v3 retires references chosen before the cover ranker rejected hotels,
    // shops and unknown pins; a stale key would keep serving those photos.
    const cacheKey = `tripper:overview-cover:v3:${trip.id}:${label.toLocaleLowerCase()}`
    try {
      const cached = window.sessionStorage.getItem(cacheKey)
      if (cached) {
        setPhotoReference(cached)
        return () => controller.abort()
      }
    } catch {
      // Storage can be unavailable in privacy modes; the cover still loads.
    }

    const params = destination
      ? tripLandmarkSearchParams(destination)
      : new URLSearchParams({ q: label, category: 'all', limit: '5' })
    if (!destination && lat != null && lng != null) {
      params.set('lat', String(lat))
      params.set('lng', String(lng))
      params.set('radius', '50000')
    }
    fetch(`/api/places/search?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<PlacesSearchResponse>
      })
      .then((body) => {
        const reference = destination
          ? selectIconicLandmarkPhoto(destination, body?.results ?? [])?.ref ?? null
          : body?.results.find((result) => result.photoRef)?.photoRef ?? null
        if (!reference || controller.signal.aborted) return
        setPhotoReference(reference)
        try { window.sessionStorage.setItem(cacheKey, reference) } catch { /* optional cache */ }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setPhotoReference(null)
      })

    return () => controller.abort()
  }, [destination, enabled, label, lat, lng, trip.id])

  return photoReference
    ? `/api/places/photo?ref=${encodeURIComponent(photoReference)}&maxWidth=1200`
    : null
}

function Hero({ trip, lifecycle, dateRange, scope, routeLabel, dayNumber, totalDays, currentStop, featuredStop, onBack, onOpenMore }: {
  trip: Trip
  lifecycle: TripLifecycle
  dateRange: string
  scope: string | null
  routeLabel: string | null
  dayNumber: number
  totalDays: number
  currentStop: Stop | null
  featuredStop: Stop | null
  onBack: () => void
  onOpenMore: () => void
}) {
  const coverUrl = safeCoverImageUrl(trip.cover_image_url)
  const [coverFailed, setCoverFailed] = useState(false)
  const [destinationCoverFailed, setDestinationCoverFailed] = useState(false)
  const destinationCoverUrl = useDestinationCover(trip, featuredStop, !coverUrl || coverFailed)
  useEffect(() => setCoverFailed(false), [coverUrl])
  useEffect(() => setDestinationCoverFailed(false), [destinationCoverUrl])
  const activeCoverUrl = coverUrl && !coverFailed
    ? coverUrl
    : destinationCoverUrl && !destinationCoverFailed ? destinationCoverUrl : null

  const today = localDateISO()
  const copy = heroCopy(lifecycle, {
    daysUntilStart: trip.start_date ? daysBetween(today, trip.start_date) : undefined,
    dayNumber,
    totalDays,
    currentStopName: currentStop?.name,
  })
  const contextLabel = routeLabel || trip.countries?.map((country) => country.name).slice(0, 3).join(' · ') || trip.vibe || 'Your trip'
  const duskTitle = splitDuskTitle(trip.title)

  return (
    <section aria-label="Trip cover" className={styles.hero}>
      {activeCoverUrl && (
        // A controlled img keeps existing Supabase signed URLs independent of Next remote-host config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeCoverUrl}
          alt=""
          decoding="async"
          fetchPriority="high"
          referrerPolicy="no-referrer"
          onError={() => coverUrl && !coverFailed ? setCoverFailed(true) : setDestinationCoverFailed(true)}
          className={styles.heroImage}
        />
      )}
      <div aria-hidden="true" className={activeCoverUrl ? styles.heroScrim : styles.heroScrimBare} />
      <div aria-hidden="true" className={styles.heroSideScrim} />
      {!activeCoverUrl ? (
        <svg aria-hidden="true" viewBox="0 0 430 280" preserveAspectRatio="none" className={styles.heroDoodle}>
          <path d="M-20 205 C72 128, 121 236, 210 160 S341 76, 456 134" fill="none" stroke="rgba(255,199,102,.25)" strokeWidth="1.7" strokeDasharray="7 9" />
          <circle cx="75" cy="164" r="4" fill={DUSK.amber} />
          <circle cx="344" cy="108" r="4" fill={DUSK.amberLight} />
        </svg>
      ) : null}

      <div className={styles.heroChrome}>
        <button type="button" onClick={onBack} aria-label="Back to Map Home" title="Back to Map Home" className={styles.iconButton}><ArrowLeft size={20} aria-hidden="true" /></button>
        <button type="button" onClick={onOpenMore} aria-label="More trip options" title="More trip options" className={styles.iconButton}><MoreHorizontal size={21} aria-hidden="true" /></button>
      </div>

      <div className={styles.heroFoot}>
        <div className={styles.heroTopRow}>
          <div className={styles.heroCopy}>
            <div className={styles.heroContext}>{contextLabel}</div>
            <h1 className={styles.heroTitle}><span>{duskTitle.lead}</span>{duskTitle.accent && <span className={styles.heroAccent}>{duskTitle.accent}</span>}</h1>
          </div>
          <span className={styles.heroBadge}>{copy.badge}</span>
        </div>
        <div className={styles.heroMeta}>
          <span>{dateRange || 'Dates not set'}</span>
          {scope && <><span aria-hidden="true">·</span><span>{scope}</span></>}
        </div>
        <div className={styles.heroMessage}>{copy.message}</div>
      </div>
    </section>
  )
}

function StopCarousel({ stops, schedule, canEdit, onOpenPlan }: { stops: Stop[]; schedule: StopSchedule[]; canEdit: boolean; onOpenPlan: () => void }) {
  if (stops.length === 0) {
    return (
      <section aria-label="Trip destinations" className={`${styles.card} ${styles.stopsEmpty}`}>
        <div className={styles.stopsEmptyRow}>
          <span aria-hidden="true" className={styles.stopsEmptyIcon}><MapIcon size={20} /></span>
          <div className={styles.stopsEmptyCopy}>
            <div className={styles.stopsEmptyTitle}>No destinations yet</div>
            <div className={styles.stopsEmptyHint}>{canEdit ? 'Start shaping your route.' : 'A trip editor can add destinations.'}</div>
          </div>
          {canEdit && <button type="button" onClick={onOpenPlan} className={styles.stopsEmptyAction}>Start planning</button>}
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Trip destinations" className={styles.carousel}>
      <div role="list" tabIndex={0} aria-label="Trip stops, scroll horizontally" className={styles.carouselTrack}>
        {stops.map((stop, index) => (
          <button
            key={stop.id}
            type="button"
            role="listitem"
            aria-label={`${stop.name}, ${stopDateLabel(schedule[index])}. Open in Plan`}
            onClick={onOpenPlan}
            className={styles.stopCard}
          >
            <span aria-hidden="true" className={styles.stopAvatar} style={{ background: fallbackGradient(`${stop.stop_type}${stop.name}`) }}>{stop.name.trim().charAt(0).toUpperCase() || '·'}</span>
            <span className={styles.stopCopy}>
              <span className={styles.stopName}>{stop.name}</span>
              <span className={styles.stopDate}>{stopDateLabel(schedule[index])}</span>
            </span>
          </button>
        ))}
        <div aria-hidden="true" className={styles.carouselTail} />
      </div>
    </section>
  )
}

function FocusCard({ lifecycle, canEdit, hasStops, currentStop, nextStop, packing, journal, journalPhotos, onAddDates, onPlan, onPacking, onJournal }: {
  lifecycle: TripLifecycle
  canEdit: boolean
  hasStops: boolean
  currentStop: Stop | null
  nextStop: Stop | null
  packing: OverviewSection<OverviewPackingItem>
  journal: OverviewSection<OverviewJournalEntry>
  journalPhotos: number
  onAddDates: () => void
  onPlan: () => void
  onPacking: () => void
  onJournal: () => void
}) {
  let eyebrow = 'NEXT STEP'
  let title = canEdit ? 'Set your travel dates' : 'Trip dates are not set yet'
  let detail = canEdit ? 'Dates unlock your timeline and preparation progress.' : hasStops ? 'You can still explore the planned route.' : 'A trip editor can add dates and destinations.'
  let action = canEdit ? 'Add dates' : 'View plan'
  let onAction = canEdit ? onAddDates : onPlan
  let icon: ReactNode = <CalendarDays size={21} />

  if (lifecycle === 'upcoming') {
    eyebrow = "TODAY'S PREPARATION"
    action = 'Review checklist'
    onAction = onPacking
    icon = <CheckSquare size={21} />
    if (packing.status === 'error') {
      title = 'Preparation details unavailable'
      detail = 'Your checklist could not be loaded. Retry below or open it directly.'
    } else {
      const unchecked = packing.rows.filter((item) => !item.checked)
      const documents = unchecked.filter((item) => item.category === 'documents').length
      if (documents > 0) {
        title = `Pack ${documents} travel ${documents === 1 ? 'document' : 'documents'}`
        detail = 'Keep passports, bookings and insurance within reach.'
      } else if (unchecked.length > 0) {
        title = `${unchecked.length} packing ${unchecked.length === 1 ? 'item' : 'items'} left`
        detail = 'Finish the next items on your trip checklist.'
      } else if (packing.rows.length > 0) {
        title = 'Your packing list is complete'
        detail = 'Review the checklist once more before departure.'
      } else {
        title = canEdit ? 'Start your trip checklist' : 'Checklist not started'
        detail = canEdit ? 'Build a practical packing list for this trip.' : 'A trip editor can add packing items.'
      }
    }
  } else if (lifecycle === 'active') {
    eyebrow = "TODAY'S PLAN"
    icon = <Route size={21} />
    title = currentStop ? `Today in ${currentStop.name}` : hasStops ? 'Continue your journey' : 'No stops planned for today'
    detail = nextStop ? `${nextStop.name} is the next stop on your route.` : currentStop ? 'This is the final planned stop.' : 'Open Plan to choose where to go next.'
    action = 'View itinerary'
    onAction = onPlan
  } else if (lifecycle === 'completed') {
    eyebrow = 'TRIP HIGHLIGHTS'
    icon = <BookOpen size={21} />
    action = 'Open recap'
    onAction = onJournal
    if (journal.status === 'error') {
      title = 'Trip recap unavailable'
      detail = 'Your journal could not be loaded. Retry below or open it directly.'
    } else if (journal.rows.length === 0 && journalPhotos === 0) {
      title = 'Capture the story while it is fresh'
      detail = 'Add photos and notes to remember the journey.'
    } else {
      title = `${journal.rows.length} ${journal.rows.length === 1 ? 'memory' : 'memories'} from your trip`
      detail = `${journalPhotos} ${journalPhotos === 1 ? 'photo' : 'photos'} saved in your private trip journal.`
    }
  }

  return (
    <section aria-label={eyebrow.toLowerCase()}>
      <div className={styles.focusEyebrow}>{eyebrow}</div>
      <div className={`${styles.card} ${styles.focusBody}`}>
        <div className={styles.focusRow}>
          <span aria-hidden="true" className={styles.focusIcon}>{icon}</span>
          <div className={styles.focusCopy}>
            <div className={styles.focusTitle}>{title}</div>
            <div className={styles.focusDetail}>{detail}</div>
          </div>
        </div>
        <button type="button" onClick={onAction} className={styles.focusAction}>
          {action}<ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

function ProgressBlock({ section }: { section: OverviewSection<OverviewPackingItem> }) {
  const checked = section.rows.filter((item) => item.checked).length
  const progress = preparationProgress(section.status, section.rows.length, checked)
  return (
    <section aria-label="Preparation progress" className={styles.progress}>
      <div className={styles.progressRow}>
        <span className={styles.progressLabel}>Preparation progress</span>
        <span className={`${styles.progressValue} ${progress.status === 'error' ? styles.progressValueMuted : ''}`}>{progress.label}</span>
      </div>
      {progress.status === 'ready' && (
        <div role="progressbar" aria-label="Preparation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.value} className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress.value}%` }} />
        </div>
      )}
      {progress.status === 'empty' && <div className={styles.progressTrack} />}
    </section>
  )
}

function ActionTile({ label, icon, accented, onClick }: { label: string; icon: ReactNode; accented?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`${styles.tile} ${accented ? styles.tileAccented : ''}`}
    >
      <span aria-hidden="true" className={styles.tileIcon}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function QuickActions({ lifecycle, onOpenItinerary, onSelectSection, onOpenDestination }: Pick<TripOverviewDomainProps, 'onOpenItinerary' | 'onSelectSection' | 'onOpenDestination'> & { lifecycle: TripLifecycle }) {
  const actions = [
    { label: 'Itinerary', icon: <Route size={20} />, onClick: onOpenItinerary },
    { label: 'Budget', icon: <WalletCards size={20} />, onClick: () => onOpenDestination('budget') },
    { label: 'Bookings', icon: <ReceiptText size={20} />, onClick: () => onSelectSection('bookings') },
    { label: 'Checklist', icon: <CheckSquare size={20} />, onClick: () => onOpenDestination('packing') },
    { label: photosActionLabel(lifecycle), icon: <Camera size={20} />, onClick: () => onOpenDestination('journal') },
    { label: 'Travel Mode', icon: <Plane size={20} />, onClick: () => onOpenDestination('travel'), accented: travelModeIsAccented(lifecycle) },
  ]
  return (
    <section aria-labelledby="quick-actions-title">
      <SectionHeading>Quick actions</SectionHeading>
      <div className={styles.tileGrid}>
        {actions.map((action) => <ActionTile key={action.label} {...action} />)}
      </div>
    </section>
  )
}

function memberName(member: TripMember) {
  return member.profile?.display_name?.trim() || member.profile?.email?.trim() || 'Trip member'
}

function MemberAvatar({ member }: { member: TripMember }) {
  const [failed, setFailed] = useState(false)
  const name = memberName(member)
  const avatar = safeCoverImageUrl(member.profile?.avatar_url)
  return (
    <span title={name} aria-label={name} className={styles.avatar} style={{ background: fallbackGradient(member.user_id) }}>
      {avatar && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={styles.avatarImage} />
      ) : name.charAt(0).toUpperCase()}
    </span>
  )
}

function MembersSection({ members, canInvite, onMembers, onInvite }: { members: TripMember[]; canInvite: boolean; onMembers: () => void; onInvite: () => void }) {
  const uniqueMembers = [...new Map(members.map((member) => [member.user_id, member])).values()]
  const shown = uniqueMembers.slice(0, 4)
  const overflow = uniqueMembers.length - shown.length
  return (
    <section aria-labelledby="trip-members-title">
      <div className={styles.membersHeader}>
        <SectionHeading>Trip Members</SectionHeading>
        <button type="button" onClick={onMembers} className={styles.membersViewAll}>View all</button>
      </div>
      <div className={`${styles.card} ${styles.membersCard}`}>
        <button type="button" onClick={onMembers} aria-label="Open trip members" className={styles.membersStack}>
          {shown.length > 0 ? shown.map((member) => <span key={member.user_id} className={styles.memberSlot}><MemberAvatar member={member} /></span>) : <span className={styles.membersEmpty}>No members available</span>}
          {overflow > 0 && <span aria-label={`${overflow} more trip members`} className={styles.memberOverflow}>+{overflow}</span>}
        </button>
        {canInvite && <button type="button" onClick={onInvite} aria-label="Invite trip member" title="Invite trip member" className={`${styles.iconButton} ${styles.inviteButton}`}><Plus size={20} aria-hidden="true" /></button>}
      </div>
    </section>
  )
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
    if (error) return showToast("Couldn't save the dates. Try again.", 'error')
    showToast('Trip dates saved.', 'success')
    onClose()
    router.refresh()
  }

  return (
    <BottomSheet open={open} onClose={onClose} titleId="trip-dates-sheet-title" title="Trip dates">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
        <label className={styles.dateField}>Start<input type="date" value={start} max={end || undefined} onChange={(event) => setStart(event.target.value)} className={styles.dateInput} /></label>
        <label className={styles.dateField}>End<input type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} className={styles.dateInput} /></label>
        {start && end && end < start && <InlineError>The end date is before the start date.</InlineError>}
        <PrimaryButton onClick={save} disabled={invalid || saving}>{saving ? 'Saving…' : 'Save dates'}</PrimaryButton>
      </div>
    </BottomSheet>
  )
}

export function TripOverviewDomain({ trip, stops, members, capabilities, initialData, visible, onBack, onOpenMore, onOpenItinerary, onSelectSection, onOpenDestination, onOpenOffline }: TripOverviewDomainProps) {
  const [todayISO, setTodayISO] = useState<string | null>(null)
  useEffect(() => setTodayISO(localDateISO()), [])

  const expensesData = useOverviewSection<OverviewExpense>(trip.id, initialData.expenses, 'expenses', OVERVIEW_EXPENSE_SELECT)
  const packingData = useOverviewSection<OverviewPackingItem>(trip.id, initialData.packing, 'packing_items', OVERVIEW_PACKING_SELECT)
  const journalData = useOverviewSection<OverviewJournalEntry>(trip.id, initialData.journal, 'journal_entries', OVERVIEW_JOURNAL_SELECT)

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
  const lifecycle = todayISO ? tripLifecycle(trip, todayISO) : null
  const orderedStops = useMemo(() => orderStops(stops), [stops])
  const schedule = useMemo(() => computeStopSchedule(trip.start_date, orderedStops, Object.fromEntries(orderedStops.map((stop) => [stop.id, stop.nights ?? 1]))), [trip.start_date, orderedStops])
  const totalDays = trip.start_date && trip.end_date ? totalNights(trip) + 1 : 0
  const dayNumber = lifecycle === 'active' && trip.start_date && todayISO ? currentTripDay(trip.start_date, todayISO) : 0
  const currentStopIndex = dayNumber > 0 ? schedule.findIndex((entry) => entry.dayStart <= dayNumber && dayNumber <= entry.dayEnd) : -1
  const nextStopIndex = dayNumber > 0 ? schedule.findIndex((entry) => entry.dayStart > dayNumber) : -1
  const currentStop = currentStopIndex >= 0 ? orderedStops[currentStopIndex] : null
  const nextStop = nextStopIndex >= 0 ? orderedStops[nextStopIndex] : null
  const photoStop = currentStop
    ?? (lifecycle === 'completed' ? selectTripPhotoStop(orderedStops) : orderedStops[0] ?? null)
  const routeLabel = routeContextLabel(orderedStops)
  const journalPhotos = journalData.section.rows.reduce((sum, entry) => sum + (entry.journal_photos?.length ?? 0), 0)
  const scope = tripScopeLabel(members)

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/join/${trip.invite_code}`
    try {
      await navigator.clipboard.writeText(link)
      showToast('Invite link copied.', 'success')
    } catch {
      showToast(`Share this join code: ${trip.invite_code}`, 'info')
    }
  }

  if (!lifecycle) {
    return (
      <div role="status" aria-label="Loading trip overview" className={styles.skeleton}>
        <SkeletonBlock height={270} radius={0} />
        <div className={styles.skeletonBody}><SkeletonBlock height={70} /><SkeletonBlock height={150} /><SkeletonBlock height={210} /></div>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <Hero trip={trip} lifecycle={lifecycle} dateRange={formatDateRange(trip.start_date, trip.end_date)} scope={scope} routeLabel={routeLabel} dayNumber={dayNumber} totalDays={totalDays} currentStop={currentStop} featuredStop={photoStop} onBack={onBack} onOpenMore={onOpenMore} />
      <div className={styles.content}>
        <StopCarousel stops={orderedStops} schedule={schedule} canEdit={capabilities.canEdit} onOpenPlan={() => onSelectSection('plan')} />
        <FocusCard lifecycle={lifecycle} canEdit={capabilities.canEdit} hasStops={orderedStops.length > 0} currentStop={currentStop} nextStop={nextStop} packing={packingData.section} journal={journalData.section} journalPhotos={journalPhotos} onAddDates={() => setDatesSheetOpen(true)} onPlan={() => onSelectSection('plan')} onPacking={() => onOpenDestination('packing')} onJournal={() => onOpenDestination('journal')} />
        {lifecycle === 'upcoming' && <ProgressBlock section={packingData.section} />}

        <div className={styles.errorStack}>
          {expensesData.section.status === 'error' && <InlineError onRetry={expensesData.retrying ? undefined : expensesData.retry}>{expensesData.retrying ? 'Retrying expenses…' : "Couldn't load expenses."}</InlineError>}
          {packingData.section.status === 'error' && <InlineError onRetry={packingData.retrying ? undefined : packingData.retry}>{packingData.retrying ? 'Retrying packing list…' : "Couldn't load the packing list."}</InlineError>}
          {journalData.section.status === 'error' && <InlineError onRetry={journalData.retrying ? undefined : journalData.retry}>{journalData.retrying ? 'Retrying journal…' : "Couldn't load the journal."}</InlineError>}
        </div>

        <QuickActions lifecycle={lifecycle} onOpenItinerary={onOpenItinerary} onSelectSection={onSelectSection} onOpenDestination={onOpenDestination} />
        <MembersSection members={members} canInvite={capabilities.canManageTrip && !!trip.invite_code} onMembers={onOpenMore} onInvite={copyInviteLink} />
        <button type="button" onClick={onOpenOffline} className={styles.offlineButton}><CloudDownload size={16} aria-hidden="true" />Offline access</button>
      </div>
      {datesSheetOpen && <TripDatesSheet trip={trip} open={datesSheetOpen} onClose={() => setDatesSheetOpen(false)} />}
    </div>
  )
}
