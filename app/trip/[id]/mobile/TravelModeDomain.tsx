'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ItineraryItem, ItineraryItemStatus, JournalEntry, Trip, TripEvent } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { enqueueMediaUpload, enqueueMutation } from '@/lib/offline/db'
import { flushOfflineQueue } from '@/lib/offline/sync'
import { createRandomId } from '@/lib/random-id'
import { allowedStatusTransitions, canTransitionStatus, externalNavigationUrl, mergeDayStory, type NavigationProvider } from '@/lib/travel-mode'
import { showToast } from '@/components/ui/toast'
import { tokens } from '@/components/mobile'
import { ACCENT_GRADIENT } from './domain-ui'
import { DUSK } from '@/components/design/tokens'
import { BottomSheet } from './components/BottomSheet'
import { localDateISO } from './trip-lifecycle'

type ComposerKind = 'note' | 'photo' | 'unplanned' | null

export interface TravelModeDomainProps {
  trip: Trip
  items: ItineraryItem[]
  setItems: Dispatch<SetStateAction<ItineraryItem[]>>
  currentUserId: string
  canEdit: boolean
  onOpenJournal: () => void
  onRecordExpense: () => void
}

const statusLabel: Record<ItineraryItemStatus, string> = {
  planned: 'Planned', on_the_way: 'On the way', arrived: 'Arrived', completed: 'Completed', skipped: 'Skipped',
}

const transitionLabel: Record<ItineraryItemStatus, string> = {
  planned: 'Plan', on_the_way: 'Start', arrived: 'Arrived', completed: 'Complete', skipped: 'Skip',
}

function eventLabel(event: TripEvent) {
  if (event.event_type === 'arrived') return 'Arrived'
  if (event.event_type === 'completed') return 'Completed'
  if (event.event_type === 'unplanned') return `Unplanned stop${typeof event.metadata.title === 'string' ? ` · ${event.metadata.title}` : ''}`
  if (event.event_type === 'expense-link') return 'Expense recorded'
  if (event.event_type === 'photo') return 'Photo added'
  return 'Note added'
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return 'Any time'
  const date = new Date(iso)
  if (Number.isNaN(date.valueOf())) return 'Any time'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function validPhoto(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG or WebP image.'
  if (file.size > 10 * 1024 * 1024) return 'Photos must be 10 MB or smaller.'
  return null
}

export function TravelModeDomain({ trip, items, setItems, currentUserId, canEdit, onOpenJournal, onRecordExpense }: TravelModeDomainProps) {
  const today = localDateISO()
  const [events, setEvents] = useState<TripEvent[]>([])
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [loadingStory, setLoadingStory] = useState(true)
  const [composer, setComposer] = useState<ComposerKind>(null)
  const [note, setNote] = useState('')
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [privateMemory, setPrivateMemory] = useState(true)
  const [attachPlace, setAttachPlace] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoProgress, setPhotoProgress] = useState(0)
  const [unplannedStep, setUnplannedStep] = useState<1 | 2>(1)
  const [unplannedTitle, setUnplannedTitle] = useState('')
  const [unplannedAddress, setUnplannedAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncByItem, setSyncByItem] = useState<Record<string, 'queued' | 'failed'>>({})
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [busyItems, setBusyItems] = useState<Set<string>>(() => new Set())

  const dayItems = useMemo(() => items
    .filter((item) => item.local_date === today)
    .sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? '') || a.order_index - b.order_index), [items, today])
  const nextItem = dayItems.find((item) => item.status !== 'completed' && item.status !== 'skipped') ?? null

  const refreshStory = useCallback(async () => {
    const supabase = createClient()
    const [eventResult, journalResult] = await Promise.all([
      supabase.from('trip_events').select('*').eq('trip_id', trip.id).gte('occurred_at', `${today}T00:00:00`).lt('occurred_at', `${today}T23:59:59.999`),
      supabase.from('journal_entries').select('*,journal_photos(*)').eq('trip_id', trip.id).eq('entry_date', today),
    ])
    if (!eventResult.error) setEvents((eventResult.data ?? []) as TripEvent[])
    if (!journalResult.error) setJournal((journalResult.data ?? []) as JournalEntry[])
    setLoadingStory(false)
  }, [today, trip.id])

  useEffect(() => { void refreshStory() }, [refreshStory])

  const story = useMemo(() => mergeDayStory({ date: today, itinerary: dayItems, events, journal }), [dayItems, events, journal, today])

  const transition = useCallback(async (item: ItineraryItem, target: ItineraryItemStatus) => {
    if (!canEdit || !canTransitionStatus(item.status, target) || busyItems.has(item.id)) return
    setBusyItems((current) => new Set(current).add(item.id))
    const previous = item.status
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: target } : entry))
    try {
      if (!navigator.onLine) {
        await enqueueMutation({
          user_id: currentUserId, trip_id: trip.id, entity: 'itinerary_item', action: 'update_status', entity_id: item.id,
          payload: { status: target }, base_version: item.updated_at,
        })
        setSyncByItem((current) => ({ ...current, [item.id]: 'queued' }))
        showToast('Status saved on this device · queued.', 'info')
        return
      }
      const idempotencyKey = crypto.randomUUID()
      const { data, error } = await createClient().rpc('transition_itinerary_status', {
        p_trip_id: trip.id,
        p_item_id: item.id,
        p_target_status: target,
        p_occurred_at: new Date().toISOString(),
        p_idempotency_key: idempotencyKey,
        p_expected_updated_at: item.updated_at,
      })
      if (error) throw error
      if (data) setItems((current) => current.map((entry) => entry.id === item.id ? data as ItineraryItem : entry))
      setSyncByItem((current) => { const next = { ...current }; delete next[item.id]; return next })
      await refreshStory()
    } catch {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: previous } : entry))
      setSyncByItem((current) => ({ ...current, [item.id]: 'failed' }))
      showToast("Couldn't update this stop. Refresh and retry.", 'error')
    } finally {
      setBusyItems((current) => { const next = new Set(current); next.delete(item.id); return next })
    }
  }, [busyItems, canEdit, currentUserId, refreshStory, setItems, trip.id])

  const saveMemory = async () => {
    if (saving || (!note.trim() && !photo)) return
    setSaving(true)
    setPhotoProgress(photo ? 15 : 0)
    const entryId = editingEntryId ?? crypto.randomUUID()
    const occurredAt = new Date().toISOString()
    const linked = nextItem
    const payload: Omit<JournalEntry, 'journal_photos'> = {
      id: entryId, trip_id: trip.id, entry_date: today, note: note.trim() || null,
      created_by: currentUserId, created_at: occurredAt, occurred_at: occurredAt,
      itinerary_item_id: linked?.id ?? null, visibility: privateMemory ? 'private' : 'trip', is_hidden: false,
      location_lat: attachPlace && linked?.lat != null ? linked.lat : null,
      location_lng: attachPlace && linked?.lng != null ? linked.lng : null,
    }
    try {
      if (!navigator.onLine) {
        await enqueueMutation({ user_id: currentUserId, trip_id: trip.id, entity: 'journal_entry', action: editingEntryId ? 'update_note' : 'create', entity_id: entryId, payload: editingEntryId ? { note: payload.note, visibility: payload.visibility, is_hidden: false } : payload })
      } else {
        const { error } = editingEntryId
          ? await createClient().from('journal_entries').update({ note: payload.note, visibility: payload.visibility, is_hidden: false }).eq('id', editingEntryId).eq('trip_id', trip.id)
          : await createClient().from('journal_entries').insert(payload)
        if (error) throw error
      }
      if (photo && !editingEntryId) {
        setPhotoProgress(45)
        const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'
        await enqueueMediaUpload({
          user_id: currentUserId, trip_id: trip.id, entry_id: entryId,
          storage_path: `${trip.id}/${createRandomId()}.${extension}`,
          file_name: photo.name, mime_type: photo.type as 'image/jpeg' | 'image/png' | 'image/webp', size_bytes: photo.size, blob: photo,
        })
        setPhotoProgress(70)
        if (navigator.onLine) await flushOfflineQueue(currentUserId)
        setPhotoProgress(navigator.onLine ? 100 : 70)
      }
      setJournal((current) => editingEntryId
        ? current.map((entry) => entry.id === editingEntryId ? { ...entry, note: payload.note, visibility: payload.visibility, is_hidden: false } : entry)
        : [...current, { ...payload, journal_photos: [] }])
      showToast(editingEntryId ? 'Memory updated.' : photo && !navigator.onLine ? 'Memory and photo queued on this device.' : 'Memory added.', 'success')
      setComposer(null); setNote(''); setPhoto(null); setAttachPlace(false); setPhotoProgress(0); setEditingEntryId(null)
      if (navigator.onLine) await refreshStory()
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't save this memory.", 'error')
      setPhotoProgress(0)
    } finally {
      setSaving(false)
    }
  }

  const hideStoryItem = async (kind: 'event' | 'journal', id: string) => {
    const table = kind === 'event' ? 'trip_events' : 'journal_entries'
    if (!navigator.onLine) {
      await enqueueMutation({ user_id: currentUserId, trip_id: trip.id, entity: kind === 'event' ? 'trip_event' : 'journal_entry', action: 'update_note', entity_id: id, payload: { is_hidden: true } })
    } else {
      const { error } = await createClient().from(table).update({ is_hidden: true }).eq('id', id).eq('trip_id', trip.id)
      if (error) return showToast("Couldn't hide this memory.", 'error')
    }
    if (kind === 'event') setEvents((current) => current.map((event) => event.id === id ? { ...event, is_hidden: true } : event))
    else setJournal((current) => current.map((entry) => entry.id === id ? { ...entry, is_hidden: true } : entry))
    showToast(navigator.onLine ? 'Hidden from the story.' : 'Hide queued on this device.', 'success')
  }

  const saveUnplanned = async () => {
    if (saving || !unplannedTitle.trim()) return
    setSaving(true)
    const itemId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const occurredAt = new Date().toISOString()
    const itemPayload = {
      id: itemId, trip_id: trip.id, item_type: 'place', title: unplannedTitle.trim(), address: unplannedAddress.trim() || null,
      lat: null, lng: null, local_date: today, start_at: occurredAt, all_day: false, order_index: dayItems.length,
      status: 'arrived', created_by: currentUserId,
    }
    const eventPayload = {
      id: eventId, trip_id: trip.id, itinerary_item_id: itemId, event_type: 'unplanned', occurred_at: occurredAt,
      created_by: currentUserId, visibility: 'trip', metadata: { title: unplannedTitle.trim(), ...(unplannedAddress.trim() ? { address: unplannedAddress.trim() } : {}) },
      is_hidden: false, idempotency_key: crypto.randomUUID(),
    }
    try {
      const supabase = createClient()
      if (!navigator.onLine) {
        const queuedItem = await enqueueMutation({ user_id: currentUserId, trip_id: trip.id, entity: 'itinerary_item', action: 'create', entity_id: itemId, payload: itemPayload })
        await enqueueMutation({ user_id: currentUserId, trip_id: trip.id, entity: 'trip_event', action: 'create', entity_id: eventId, payload: eventPayload, depends_on: queuedItem.id })
        setSyncByItem((current) => ({ ...current, [itemId]: 'queued' }))
      } else {
        const { error: itemError } = await supabase.from('itinerary_items').insert(itemPayload)
        if (itemError) throw itemError
        const { error: eventError } = await supabase.from('trip_events').insert(eventPayload)
        if (eventError) throw eventError
      }
      const optimistic = {
        ...itemPayload, stop_id: null, notes: null, end_at: null, timezone: null,
        place_provider: null, external_place_id: null, normalized_address: null, duration_minutes: null,
        estimated_cost: null, currency: null, is_locked: false, created_at: occurredAt, updated_at: occurredAt,
      } as ItineraryItem
      setItems((current) => [...current, optimistic])
      showToast(navigator.onLine ? 'Unplanned stop added.' : 'Unplanned stop queued on this device.', 'success')
      setComposer(null); setUnplannedStep(1); setUnplannedTitle(''); setUnplannedAddress('')
      if (navigator.onLine) await refreshStory()
    } catch {
      showToast("Couldn't add the unplanned stop.", 'error')
    } finally { setSaving(false) }
  }

  const openNavigation = (provider: NavigationProvider) => {
    if (!nextItem) return
    const url = externalNavigationUrl(provider, nextItem)
    if (!url) return showToast('Add an address or map point before navigating.', 'info')
    window.open(url, '_blank', 'noopener,noreferrer')
    setNavigationOpen(false)
  }

  const quickButton = (label: string, onClick: () => void, accent = false) => (
    <button type="button" onClick={onClick} disabled={!canEdit} style={{ minHeight: 48, padding: '10px 12px', borderRadius: 14, border: `1px solid ${accent ? 'rgba(245,166,35,.45)' : tokens.glassStandardBorder}`, background: accent ? 'rgba(245,166,35,.14)' : tokens.surfaceSolid, color: accent ? tokens.accentLight : tokens.textPrimary, fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>{label}</button>
  )

  return (
    <div style={{ paddingTop: 12, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <section className="glass-standard" style={{ position: 'sticky', top: 0, zIndex: 5, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', background: 'rgba(12,18,32,.84)', border: `1px solid ${tokens.glassStandardBorder}` }}>
        <div style={{ fontSize: 12, fontWeight: 850, letterSpacing: '.06em', color: tokens.accentLight }}>TODAY · TRAVEL MODE</div>
        {nextItem ? <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 850, color: DUSK.textPrimary }}>{nextItem.title}</div><div style={{ marginTop: 4, color: tokens.textMuted, fontSize: 12.5 }}>{formatTime(nextItem.start_at)}{nextItem.address ? ` · ${nextItem.address}` : ''}</div></div>
            <span style={{ padding: '6px 9px', borderRadius: 999, color: tokens.textSecondary, background: tokens.surfaceSolid, fontSize: 12, fontWeight: 800 }}>{statusLabel[nextItem.status]}</span>
          </div>
          {syncByItem[nextItem.id] && <div role="status" style={{ marginTop: 8, color: syncByItem[nextItem.id] === 'queued' ? tokens.warning : tokens.danger, fontSize: 12, fontWeight: 750 }}>{syncByItem[nextItem.id] === 'queued' ? 'On device · waiting to sync' : 'Sync failed · retry from Sync center'}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 14 }}>
            {allowedStatusTransitions(nextItem.status).map((status) => quickButton(transitionLabel[status], () => void transition(nextItem, status), status !== 'skipped'))}
            {quickButton('Navigate', () => setNavigationOpen(true))}
          </div>
        </> : <div style={{ padding: '16px 0 4px', color: tokens.textSecondary, fontWeight: 750 }}>Today&apos;s plan is complete.</div>}
      </section>

      {canEdit && <section aria-label="Quick actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginTop: 12 }}>
        {quickButton('Add photo', () => setComposer('photo'), true)}
        {quickButton('Add note', () => { setEditingEntryId(null); setNote(''); setComposer('note') })}
        {quickButton('Expense', onRecordExpense)}
        {quickButton('Unplanned stop', () => { setUnplannedStep(1); setComposer('unplanned') })}
        {quickButton('Journal', onOpenJournal)}
      </section>}

      <section aria-label="Today story" style={{ marginTop: 20 }}>
        <div style={{ color: tokens.textPrimary, fontSize: 14, fontWeight: 850, marginBottom: 10 }}>Today&apos;s story</div>
        {loadingStory && <div role="status" style={{ height: 72, borderRadius: 16, background: tokens.surfaceSolid }} />}
        {!loadingStory && story.length === 0 && <div style={{ padding: 20, color: tokens.textMuted, textAlign: 'center', borderRadius: 16, background: tokens.surfaceSolid }}>Your plan and memories will meet here.</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {story.map((storyItem, index) => (
            <div key={storyItem.id} style={{ display: 'grid', gridTemplateColumns: '46px 18px minmax(0,1fr)', gap: 8, minHeight: 76 }}>
              <time style={{ paddingTop: 14, color: tokens.textMuted, fontSize: 12, fontWeight: 750 }}>{formatTime(storyItem.occurredAt)}</time>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}><span style={{ position: 'absolute', top: index === 0 ? 18 : 0, bottom: index === story.length - 1 ? 50 : 0, width: 1, background: 'rgba(255,255,255,.14)' }} /><span style={{ marginTop: 18, zIndex: 1, width: 9, height: 9, borderRadius: '50%', background: storyItem.kind === 'journal' ? tokens.accent : storyItem.kind === 'event' ? tokens.success : '#78839a', boxShadow: '0 0 0 4px #0b111e' }} /></div>
              <article style={{ marginBottom: 8, padding: '12px 13px', borderRadius: 16, background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}` }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: tokens.textMuted, fontWeight: 800 }}>{storyItem.kind === 'plan' ? 'Plan' : storyItem.kind === 'event' ? 'Journey' : storyItem.entry.visibility === 'private' ? 'Private memory' : 'Journal'}</div>
                <div style={{ marginTop: 3, color: tokens.textPrimary, fontSize: 13.5, fontWeight: 750 }}>{storyItem.kind === 'plan' ? storyItem.item.title : storyItem.kind === 'event' ? eventLabel(storyItem.event) : storyItem.entry.note || `${storyItem.entry.journal_photos?.length ?? 0} photo${(storyItem.entry.journal_photos?.length ?? 0) === 1 ? '' : 's'}`}</div>
                {storyItem.kind !== 'plan' && (storyItem.kind === 'event' ? storyItem.event.created_by : storyItem.entry.created_by) === currentUserId && <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                  {storyItem.kind === 'journal' && <button type="button" onClick={() => { setEditingEntryId(storyItem.entry.id); setNote(storyItem.entry.note ?? ''); setPrivateMemory(storyItem.entry.visibility === 'private'); setComposer('note') }} style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: tokens.textSecondary, fontSize: 12, fontWeight: 750 }}>Edit</button>}
                  <button type="button" onClick={() => void hideStoryItem(storyItem.kind, storyItem.kind === 'event' ? storyItem.event.id : storyItem.entry.id)} style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: tokens.textSecondary, fontSize: 12, fontWeight: 750 }}>Hide</button>
                </div>}
              </article>
            </div>
          ))}
        </div>
      </section>

      <BottomSheet open={navigationOpen} onClose={() => setNavigationOpen(false)} titleId="navigation-choice-title" title="Open directions with">
        <div style={{ display: 'grid', gap: 8 }}>{(['apple', 'google', 'waze'] as NavigationProvider[]).map((provider) => quickButton(`${provider[0].toUpperCase()}${provider.slice(1)} Maps`, () => openNavigation(provider), provider === 'google'))}</div>
      </BottomSheet>

      <BottomSheet open={composer === 'note' || composer === 'photo'} onClose={() => { if (!saving) { setComposer(null); setEditingEntryId(null) } }} titleId="quick-memory-title" title={composer === 'photo' ? 'Add a photo' : editingEntryId ? 'Edit note' : 'Add a note'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {composer === 'photo' && <label style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, border: `1px dashed ${tokens.glassStandardBorder}`, color: tokens.textSecondary, fontWeight: 750 }}>
            {photo ? photo.name : 'Camera or photo library'}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0] ?? null; const error = file ? validPhoto(file) : null; if (error) { showToast(error, 'error'); return } setPhoto(file) }} />
          </label>}
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder={composer === 'photo' ? 'Caption (optional)' : 'A quick memory…'} style={{ minHeight: 72, resize: 'none', padding: 12, borderRadius: 14, border: `1px solid ${tokens.glassStandardBorder}`, background: tokens.surfaceSolid, color: tokens.textPrimary, fontFamily: 'inherit', fontSize: 14 }} />
          <label style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, color: tokens.textSecondary, fontSize: 12.5 }}><input type="checkbox" checked={privateMemory} onChange={(event) => setPrivateMemory(event.target.checked)} /> Private to me</label>
          {nextItem?.lat != null && nextItem.lng != null && <label style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, color: tokens.textSecondary, fontSize: 12.5 }}><input type="checkbox" checked={attachPlace} onChange={(event) => setAttachPlace(event.target.checked)} /> Attach {nextItem.title}&apos;s saved place</label>}
          {photoProgress > 0 && <div role="status" aria-label={`Photo ${photoProgress}% uploaded`} style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}><div style={{ width: `${photoProgress}%`, height: '100%', background: tokens.accentCtaGradient, transition: 'width .2s' }} /></div>}
          <button type="button" onClick={() => void saveMemory()} disabled={saving || (!note.trim() && !photo)} style={{ minHeight: 48, border: 0, borderRadius: 14, background: ACCENT_GRADIENT, color: DUSK.onAmber, fontWeight: 850 }}>{saving ? 'Saving…' : typeof navigator === 'undefined' || navigator.onLine ? 'Add memory' : 'Save on device'}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={composer === 'unplanned'} onClose={() => !saving && setComposer(null)} titleId="unplanned-stop-title" title={`Unplanned stop · ${unplannedStep}/2`}>
        {unplannedStep === 1 ? <div style={{ display: 'grid', gap: 12 }}><input autoFocus value={unplannedTitle} onChange={(event) => setUnplannedTitle(event.target.value)} placeholder="Where did you stop?" style={{ minHeight: 48, padding: 12, borderRadius: 14, border: `1px solid ${tokens.glassStandardBorder}`, background: tokens.surfaceSolid, color: DUSK.textPrimary, fontSize: 15 }} /><button type="button" disabled={!unplannedTitle.trim()} onClick={() => setUnplannedStep(2)} style={{ minHeight: 48, border: 0, borderRadius: 14, background: ACCENT_GRADIENT, color: DUSK.onAmber, fontWeight: 850 }}>Continue</button></div> : <div style={{ display: 'grid', gap: 12 }}><input value={unplannedAddress} onChange={(event) => setUnplannedAddress(event.target.value)} placeholder="Address (optional)" style={{ minHeight: 48, padding: 12, borderRadius: 14, border: `1px solid ${tokens.glassStandardBorder}`, background: tokens.surfaceSolid, color: DUSK.textPrimary, fontSize: 14 }} /><div style={{ color: tokens.textMuted, fontSize: 12 }}>No location is tracked. Only the address you type is stored.</div><button type="button" disabled={saving} onClick={() => void saveUnplanned()} style={{ minHeight: 48, border: 0, borderRadius: 14, background: ACCENT_GRADIENT, color: DUSK.onAmber, fontWeight: 850 }}>{saving ? 'Adding…' : 'Add stop'}</button></div>}
      </BottomSheet>
    </div>
  )
}
