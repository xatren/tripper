'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import type { ItineraryItem, JournalEntry, Stop, Trip } from '@/types'
import type { RouteLeg } from '@/lib/mapbox/directions'
import { createClient } from '@/lib/supabase/client'
import { enqueueMutation } from '@/lib/offline/db'
import { useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { TripSummaryHero } from '@/components/journal/TripSummaryHero'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { showToast } from '@/components/ui/toast'
import { convertKm, useDistanceUnit } from '@/lib/settings'
import { createRandomId } from '@/lib/random-id'
import { ACCENT_GRADIENT, ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL, RetryCard } from './domain-ui'
import { DUSK } from '@/components/design/tokens'
import { formatDateRange, totalNights, tripTitle } from './trip-domain-utils'
import { allowlistedRecapPayload, buildRecapStats, type RecapShareField } from '@/lib/travel-mode'
import { BottomSheet } from './components/BottomSheet'

const JOURNAL_BUCKET = 'trip-photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60
const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000

const loadRecapImage = () => import('@/lib/recap-image')

// Session-lifetime cache so re-opening the Journal tab never refetches.
const journalCache = new Map<string, JournalEntry[]>()

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatJournalDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function sortJournalEntries(entries: JournalEntry[]) {
  return entries.sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
}

/** Downscale to max 1600px and re-encode as JPEG before upload (keeps the bucket lean). */
async function compressJournalPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress failed'))), 'image/jpeg', 0.85)
  })
}

interface DraftPhoto {
  id: string
  file: File
  /** Local object URL — the thumbnail shown while the real upload is still in flight. */
  previewUrl: string
  status: 'queued' | 'uploading' | 'done' | 'error' | 'offline' | 'cleanup-error'
  progress: number
  storagePath?: string
  journalPhotoId?: string
  errorMessage?: string
}

interface SignedPhotoUrl {
  url: string
  expiresAt: number
}

/**
 * Uploads straight to the Storage REST endpoint via XHR (bypassing supabase-js's
 * fetch-based client) so we get real `upload.onprogress` byte counts — the
 * supabase-js storage client doesn't expose progress at all.
 */
function uploadPhotoWithProgress(
  accessToken: string,
  path: string,
  blob: Blob,
  signal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const apiKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${JOURNAL_BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('apikey', apiKey)
    xhr.setRequestHeader('Content-Type', 'image/jpeg')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

export interface JournalDomainProps {
  trip: Trip
  stops: Stop[]
  routeLegs: RouteLeg[]
  routePath: { lat: number; lng: number }[]
  currentUserId: string
  canEdit: boolean
  items: ItineraryItem[]
}

export function JournalDomain({
  trip, stops, routeLegs, routePath, currentUserId, canEdit, items,
}: JournalDomainProps) {
  const distanceUnit = useDistanceUnit()
  const [sharing, setSharing] = useState(false)
  const [recapPreviewOpen, setRecapPreviewOpen] = useState(false)
  const [expenseCount, setExpenseCount] = useState(0)
  const [recapFields, setRecapFields] = useState<RecapShareField[]>(['title', 'dateRange', 'routePath', 'stops', 'distance', 'distanceUnit', 'durationHours', 'days', 'plannedCount', 'visitedCount', 'photoCount', 'journalCount'])
  const [entries, setEntriesState] = useState<JournalEntry[] | null>(() => journalCache.get(trip.id) ?? null)
  const [entriesError, setEntriesError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  // Write-through wrapper: keeps the session cache in sync with every mutation.
  const setEntries: Dispatch<SetStateAction<JournalEntry[] | null>> = useCallback((action) =>
    setEntriesState((prev) => {
      const next = typeof action === 'function' ? (action as (p: JournalEntry[] | null) => JournalEntry[] | null)(prev) : action
      if (next) journalCache.set(trip.id, next)
      return next
    }), [trip.id])
  const [draftNote, setDraftNote] = useState('')
  const [draftDate, setDraftDate] = useState(todayIso())
  const [draftPhotos, setDraftPhotos] = useState<DraftPhoto[]>([])
  const [saving, setSaving] = useState(false)
  const [draftEntryId, setDraftEntryId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [signedPhotoUrls, setSignedPhotoUrls] = useState<Record<string, SignedPhotoUrl>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lightboxCloseRef = useRef<HTMLButtonElement>(null)
  const lightboxTriggerRef = useRef<HTMLElement | null>(null)
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeUploadControllersRef = useRef(new Map<string, AbortController>())
  const draftPhotosRef = useRef<DraftPhoto[]>([])

  useEffect(() => {
    draftPhotosRef.current = draftPhotos
  }, [draftPhotos])

  const refreshEntries = useCallback(async (surfaceError = false) => {
    const { data, error } = await createClient()
      .from('journal_entries')
      .select('*, journal_photos(*)')
      .eq('trip_id', trip.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) {
      setEntries((data ?? []) as JournalEntry[])
      setEntriesError(false)
    } else if (surfaceError) {
      setEntries([])
      setEntriesError(true)
    }
    return { data, error }
  }, [setEntries, trip.id])

  useEffect(() => {
    if (reloadToken === 0 && journalCache.has(trip.id)) return
    let cancelled = false
    setEntriesState(null)
    setEntriesError(false)
    refreshEntries(true).then(({ error }) => {
        if (cancelled) return
        if (error) {
          // Table missing until migration 011_journal runs, or the request
          // failed — degrade without poisoning the cache.
          setEntriesError(true)
          return
        }
      })
    return () => { cancelled = true }
  }, [refreshEntries, trip.id, reloadToken])

  useEffect(() => () => {
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current)
    activeUploadControllersRef.current.forEach((controller) => controller.abort())
    draftPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
  }, [])

  const photoPaths = (entries ?? []).flatMap((entry) => (entry.journal_photos ?? []).map((photo) => photo.storage_path))
  const photoPathKey = [...new Set(photoPaths)].sort().join('\n')

  // Signed URLs last one hour. Missing or expiring URLs refresh five minutes
  // before expiry, including while the journal remains open for a long time.
  useEffect(() => {
    const paths = photoPathKey ? photoPathKey.split('\n') : []
    if (paths.length === 0) {
      setSignedPhotoUrls({})
      return
    }
    let cancelled = false
    let currentUrls = signedPhotoUrls
    const refresh = async () => {
      const now = Date.now()
      const expiring = paths.filter((path) => {
        const cached = currentUrls[path]
        return !cached || cached.expiresAt - now <= SIGNED_URL_REFRESH_MARGIN_MS
      })
      if (expiring.length === 0) return
      const { data, error } = await createClient().storage.from(JOURNAL_BUCKET).createSignedUrls(expiring, SIGNED_URL_TTL_SECONDS)
      if (cancelled || error || !data) return
      const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000
      setSignedPhotoUrls((previous) => {
        const next = { ...previous }
        for (const result of data) {
          if (result.path && result.signedUrl) next[result.path] = { url: result.signedUrl, expiresAt }
        }
        currentUrls = next
        return next
      })
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  // A path-set change restarts the signer; the local snapshot is updated after
  // each successful refresh without making the URL map an effect dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoPathKey])

  useTripRealtimeTable<JournalEntry & Record<string, unknown>>(
    'journal_entries',
    useCallback((change) => {
      const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<JournalEntry>
      if (!row.id) return
      if (change.eventType === 'DELETE') {
        setEntries((previous) => (previous ?? []).filter((entry) => entry.id !== row.id))
        setPendingDelete((pending) => pending?.id === row.id ? null : pending)
        return
      }
      setEntries((previous) => {
        const current = previous ?? []
        const existing = current.find((entry) => entry.id === row.id)
        const next = existing
          ? current.map((entry) => entry.id === row.id ? { ...entry, ...row } as JournalEntry : entry)
          : [{ ...row, journal_photos: [] } as JournalEntry, ...current]
        return sortJournalEntries(next)
      })
      // Photos are stored in a child table without trip_id, so subscribing to
      // that whole table would violate trip scoping. Refresh the scoped parent
      // query shortly after an entry event to pick up its nested photo rows.
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current)
      realtimeRefreshTimerRef.current = setTimeout(() => { void refreshEntries(false) }, 750)
    }, [refreshEntries, setEntries]),
    useCallback(() => { void refreshEntries(false) }, [refreshEntries]),
  )

  // Keep focus inside the lightbox, close with Escape, and restore the opener.
  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setLightbox(null)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        lightboxCloseRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      lightboxTriggerRef.current?.focus?.()
    }
  }, [lightbox])

  // Draft photos remain local until the parent row exists. Uploading begins only
  // after Save creates that row, eliminating the pre-row orphan window.
  const hasContent = draftNote.trim().length > 0 || draftPhotos.length > 0

  const removeDraftPhoto = async (photo: DraftPhoto) => {
    activeUploadControllersRef.current.get(photo.id)?.abort()
    const supabase = createClient()
    if (photo.storagePath) {
      const { error } = await supabase.storage.from(JOURNAL_BUCKET).remove([photo.storagePath])
      if (error) {
        setDraftPhotos((previous) => previous.map((item) => item.id === photo.id
          ? { ...item, status: 'cleanup-error', errorMessage: 'Could not remove the uploaded object. Try removing it again.' }
          : item))
        showToast("Couldn't remove the uploaded photo. It remains recoverable in this draft.", 'error')
        return
      }
    }
    if (photo.journalPhotoId) {
      const { error } = await supabase.from('journal_photos').delete().eq('id', photo.journalPhotoId)
      if (error) {
        showToast("The object was removed, but its photo record still needs cleanup. Try again.", 'error')
        return
      }
    }
    URL.revokeObjectURL(photo.previewUrl)
    setDraftPhotos((previous) => previous.filter((item) => item.id !== photo.id))
    await refreshEntries(false)
  }

  const discardDraft = async () => {
    if (saving) return
    activeUploadControllersRef.current.forEach((controller) => controller.abort())
    const supabase = createClient()
    const paths = draftPhotos.flatMap((photo) => photo.storagePath ? [photo.storagePath] : [])
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(JOURNAL_BUCKET).remove(paths)
      if (error) {
        showToast("Couldn't discard the draft because its uploaded media could not be removed. Retry is safe.", 'error')
        return
      }
    }
    if (draftEntryId) {
      const { error } = await supabase.from('journal_entries').delete().eq('id', draftEntryId)
      if (error) {
        showToast('Draft media was removed, but the entry record still needs cleanup. Retry discard.', 'error')
        return
      }
    }
    draftPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    setDraftPhotos([])
    setDraftNote('')
    setDraftEntryId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await refreshEntries(false)
  }

  const submitEntry = async () => {
    if (!canEdit) return
    const note = draftNote.trim()
    if (saving || !hasContent) return
    setSaving(true)
    if (!navigator.onLine) {
      const entryId = draftEntryId ?? crypto.randomUUID()
      const createdAt = new Date().toISOString()
      try {
        await enqueueMutation({
          user_id: currentUserId, trip_id: trip.id, entity: 'journal_entry', action: draftEntryId ? 'update_note' : 'create', entity_id: entryId,
          payload: draftEntryId ? { note: note || null } : { id: entryId, trip_id: trip.id, entry_date: draftDate, note: note || null, created_by: currentUserId, created_at: createdAt },
        })
        if (!draftEntryId) setEntries((previous) => sortJournalEntries([...(previous ?? []), { id: entryId, trip_id: trip.id, entry_date: draftDate, note: note || null, created_by: currentUserId, created_at: createdAt, journal_photos: [] }]))
        setDraftNote('')
        setDraftEntryId(null)
        showToast(draftPhotos.length ? 'Journal text queued. Photos stay on this screen and require a connection.' : 'Journal note saved on this device · queued.', 'info')
      } catch {
        showToast("Couldn't queue the journal note.", 'error')
      } finally {
        setSaving(false)
      }
      return
    }
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setSaving(false)
      showToast('Your session expired. Sign in again before saving.', 'error')
      return
    }

    let entryId = draftEntryId
    if (entryId) {
      const { error } = await supabase
        .from('journal_entries')
        .update({ entry_date: draftDate, note: note || null })
        .eq('id', entryId)
      if (error) {
        setSaving(false)
        showToast("The entry exists, but its latest changes couldn't be saved. Retry is safe.", 'error')
        return
      }
    } else {
      const { data: entry, error } = await supabase
        .from('journal_entries')
        .insert({ trip_id: trip.id, entry_date: draftDate, note: note || null, created_by: currentUserId })
        .select('id')
        .single()
      if (error || !entry) {
        setSaving(false)
        showToast("Couldn't create the journal entry. No photos were uploaded.", 'error', { label: 'Retry', onClick: () => { void submitEntry() } })
        return
      }
      entryId = entry.id
      setDraftEntryId(entryId)
    }

    let failedCount = 0
    let cleanupFailureCount = 0
    for (const photo of draftPhotos) {
      if (photo.status === 'done') continue

      if (photo.status === 'cleanup-error' && photo.storagePath) {
        const { error: cleanupError } = await supabase.storage.from(JOURNAL_BUCKET).remove([photo.storagePath])
        if (cleanupError) {
          failedCount += 1
          cleanupFailureCount += 1
          continue
        }
      }

      const path = `${trip.id}/${createRandomId()}.jpg`
      const controller = new AbortController()
      activeUploadControllersRef.current.set(photo.id, controller)
      setDraftPhotos((previous) => previous.map((item) => item.id === photo.id
        ? { ...item, status: 'uploading', progress: 0, storagePath: path, errorMessage: undefined }
        : item))
      try {
        const blob = await compressJournalPhoto(photo.file)
        await uploadPhotoWithProgress(session.access_token, path, blob, controller.signal, (progress) => {
          setDraftPhotos((previous) => previous.map((item) => item.id === photo.id ? { ...item, progress } : item))
        })
        const { data: journalPhoto, error: linkError } = await supabase
          .from('journal_photos')
          .insert({ entry_id: entryId, storage_path: path, uploaded_by: currentUserId })
          .select('id')
          .single()
        if (linkError || !journalPhoto) throw new Error('Photo uploaded but could not be linked to the entry')
        setDraftPhotos((previous) => previous.map((item) => item.id === photo.id
          ? { ...item, status: 'done', progress: 100, storagePath: path, journalPhotoId: journalPhoto.id }
          : item))
      } catch (uploadError) {
        const { error: cleanupError } = await supabase.storage.from(JOURNAL_BUCKET).remove([path])
        const wasCancelled = uploadError instanceof DOMException && uploadError.name === 'AbortError'
        const status = cleanupError ? 'cleanup-error' : (!navigator.onLine ? 'offline' : 'error')
        const message = cleanupError
          ? 'Upload failed and automatic cleanup also failed; Retry will clean this object first.'
          : wasCancelled ? 'Upload cancelled.' : 'Upload failed; Retry is safe.'
        setDraftPhotos((previous) => previous.map((item) => item.id === photo.id
          ? { ...item, status, progress: 0, storagePath: cleanupError ? path : undefined, errorMessage: message }
          : item))
        failedCount += 1
        if (cleanupError) cleanupFailureCount += 1
      } finally {
        activeUploadControllersRef.current.delete(photo.id)
      }
    }

    await refreshEntries(false)
    setSaving(false)
    if (failedCount > 0) {
      const cleanupWarning = cleanupFailureCount > 0 ? ` ${cleanupFailureCount} object${cleanupFailureCount === 1 ? '' : 's'} still need cleanup.` : ''
      showToast(`Entry saved, but ${failedCount} photo${failedCount === 1 ? '' : 's'} need retry.${cleanupWarning}`, 'error')
      return
    }

    setDraftNote('')
    draftPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    setDraftPhotos([])
    setDraftEntryId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    showToast('Journal entry saved 📝', 'success')
  }

  const deleteEntry = async (entry: JournalEntry) => {
    if (!canEdit) return
    setPendingDelete(null)
    const supabase = createClient()
    const paths = (entry.journal_photos ?? []).map((p) => p.storage_path)
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(JOURNAL_BUCKET).remove(paths)
      if (storageError) {
        showToast("Couldn't remove the entry's photos, so the entry was kept. Retry is safe.", 'error')
        return
      }
    }
    const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
    if (error) {
      showToast("Photos were removed, but the entry record wasn't. Retry deletion to finish cleanup.", 'error')
      return
    }
    setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id))
  }

  const points = stops.map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, label: i + 1, title: s.name }))
  const distanceKm = routeLegs.reduce((sum, l) => sum + l.distanceMeters, 0) / 1000
  const distanceValue = convertKm(distanceKm, distanceUnit)
  const durationHours = routeLegs.reduce((sum, l) => sum + l.durationSeconds, 0) / 3600
  const days = trip.start_date && trip.end_date ? totalNights(trip) + 1 : stops.length
  const recapReady = stops.length >= 2 && routePath.length >= 2
  const recapStats = buildRecapStats({ itinerary: items, journal: entries ?? [], expenses: Array.from({ length: expenseCount }, (_, index) => ({ id: String(index) })), routeLegs })
  const firstShareableNote = (entries ?? []).find((entry) => !entry.is_hidden && entry.note)?.note ?? undefined
  const firstShareablePhoto = (entries ?? []).flatMap((entry) => entry.journal_photos ?? []).find((photo) => signedPhotoUrls[photo.storage_path])

  const setRecapField = (field: RecapShareField, enabled: boolean) => setRecapFields((current) => enabled ? [...new Set([...current, field])] : current.filter((key) => key !== field))

  const shareRecap = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const raw = {
        title: tripTitle(trip, stops), dateRange: formatDateRange(trip.start_date, trip.end_date) || 'Dates not set',
        routePath, stops: stops.map((stop) => ({ lat: stop.lat, lng: stop.lng, name: stop.name })),
        distance: distanceValue, distanceUnit, durationHours, days,
        plannedCount: recapStats.planned, visitedCount: recapStats.visited, photoCount: recapStats.photos,
        journalCount: recapStats.journal, expenseCount: recapStats.expenses,
        memoryText: firstShareableNote, photoUrl: firstShareablePhoto ? signedPhotoUrls[firstShareablePhoto.storage_path]?.url : undefined,
      }
      const { shareTripRecap } = await loadRecapImage()
      const result = await shareTripRecap(allowlistedRecapPayload(raw, recapFields) as typeof raw)
      if (result === 'failed') showToast("Couldn't create the recap image.", 'error')
      else if (result === 'downloaded') showToast('Recap image downloaded.', 'success')
      setRecapPreviewOpen(false)
    } catch {
      showToast("Couldn't create the recap. Try again when you're online.", 'error')
    } finally { setSharing(false) }
  }

  const inputStyle: CSSProperties = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: DUSK.textPrimary, outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ paddingTop: 14, paddingBottom: 20 }}>
      {recapReady ? (
        <>
          <TripSummaryHero
            title={tripTitle(trip, stops)}
            dateRange={formatDateRange(trip.start_date, trip.end_date) || 'Dates not set'}
            points={points}
            routePath={routePath}
            distance={distanceValue}
            distanceUnit={distanceUnit}
            durationHours={durationHours}
            days={days}
          />
          <button
            onClick={async () => {
              const { count } = await createClient().from('expenses').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id)
              setExpenseCount(count ?? 0)
              setRecapPreviewOpen(true)
            }}
            onPointerEnter={() => { if (navigator.onLine) void loadRecapImage().catch(() => undefined) }}
            onFocus={() => { if (navigator.onLine) void loadRecapImage().catch(() => undefined) }}
            disabled={sharing}
            aria-busy={sharing}
            style={{ width: '100%', marginTop: 12, padding: '14px 16px', borderRadius: 16, background: ACCENT_GRADIENT, border: 'none', color: DUSK.onAmber, fontWeight: 800, fontSize: 14.5, cursor: sharing ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: '0 0 24px rgba(245,140,0,.3)', opacity: sharing ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={DUSK.onAmber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <path d="M16 6l-4-4-4 4M12 2v13" />
            </svg>
            Preview &amp; share recap
          </button>
        </>
      ) : (
        <div style={{ padding: '18px 16px', borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', textAlign: 'center' }}>
          <span style={{ color: DUSK.textMuted, fontSize: 12.5 }}>
            {stops.length < 2 ? 'Add at least 2 stops to see your trip recap' : 'Loading route recap…'}
          </span>
        </div>
      )}

      {/* ── Daily journal ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: DUSK.textSecondary, letterSpacing: '.02em', marginBottom: 10 }}>Daily journal</div>

        {/* composer */}
        {canEdit && <div style={{ borderRadius: 16, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            aria-label="Journal date"
            type="date"
            value={draftDate}
            onChange={(e) => e.target.value && setDraftDate(e.target.value)}
            style={{ ...inputStyle, colorScheme: 'dark', width: 'fit-content' }}
          />
          <textarea
            aria-label="Journal entry"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="How was the day? Notes, highlights, hidden gems…"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
          {draftPhotos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {draftPhotos.map((p) => {
                const ringR = 15
                const ringC = 2 * Math.PI * ringR
                const dimmed = p.status !== 'done'
                return (
                  <div key={p.id} style={{ position: 'relative', width: 64, height: 64 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.previewUrl}
                      alt={p.file.name}
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', opacity: dimmed ? 0.45 : 1, filter: dimmed ? 'saturate(.6)' : 'none', transition: 'opacity .3s ease' }}
                    />
                    {(p.status === 'uploading' || p.status === 'queued') && (
                      <svg width="64" height="64" viewBox="0 0 34 34" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
                        <circle cx="17" cy="17" r={ringR} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2.5" />
                        <circle
                          cx="17" cy="17" r={ringR} fill="none" stroke={ACCENT_LIGHT} strokeWidth="2.5" strokeLinecap="round"
                          strokeDasharray={ringC} strokeDashoffset={ringC * (1 - p.progress / 100)}
                          style={{ transition: 'stroke-dashoffset .2s linear' }}
                        />
                      </svg>
                    )}
                    {(p.status === 'uploading' || p.status === 'queued') && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, color: DUSK.textPrimary, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                        {p.progress}%
                      </span>
                    )}
                    {p.status === 'offline' && (
                      <span title="Waiting for connection" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0" />
                          <path d="M2 2l20 20" stroke="#f87171" />
                          <circle cx="12" cy="20" r="1" fill="#fbbf24" stroke="none" />
                        </svg>
                      </span>
                    )}
                    {(p.status === 'error' || p.status === 'offline') && (
                      <button
                        onClick={() => setDraftPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'queued', progress: 0, errorMessage: undefined } : x)))}
                        aria-label={`Retry uploading ${p.file.name}`}
                        title="Upload failed — tap, then save to retry"
                        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 4v6h6M23 20v-6h-6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </button>
                    )}
                    {p.status === 'cleanup-error' && (
                      <span title={p.errorMessage} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontWeight: 900, fontSize: 18 }}>!</span>
                    )}
                    <button
                      onClick={() => { void removeDraftPhoto(p) }}
                      aria-label="Remove photo"
                      style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'rgba(20,20,40,.9)', border: '1px solid rgba(255,255,255,.25)', color: DUSK.textPrimary, fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {draftPhotos.some((p) => p.status === 'offline') && (
            <div style={{ fontSize: 11.5, color: '#fbbf24', fontWeight: 600 }}>Offline — photos will upload once you&apos;re back online.</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              ref={fileInputRef}
              aria-label="Journal photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                setDraftPhotos((prev) => [
                  ...prev,
                  ...files.map((file) => ({
                    id: createRandomId(),
                    file,
                    previewUrl: URL.createObjectURL(file),
                    status: 'queued' as const,
                    progress: 0,
                  })),
                ])
              }}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add photos to journal entry"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, color: DUSK.textSecondary, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3.2" /><path d="M8 5l1.2-2h5.6L16 5" />
              </svg>
              Add photos
            </button>
            <button
              onClick={() => { void discardDraft() }}
              disabled={saving || !hasContent}
              style={{ padding: '8px 10px', borderRadius: 10, background: 'none', border: 'none', color: DUSK.textMuted, fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              Discard
            </button>
            <button
              onClick={submitEntry}
              disabled={saving || !hasContent}
              style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 10, background: ACCENT_GRADIENT, border: 'none', color: DUSK.onAmber, fontSize: 12.5, fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving || !hasContent ? 0.5 : 1 }}
            >
              {saving ? 'Saving & uploading…' : draftEntryId ? 'Retry photos' : 'Save entry'}
            </button>
          </div>
        </div>}

        {/* entries */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries === null && (
            <div style={{ height: 76, borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
          )}
          {entriesError && (
            <RetryCard
              title="Couldn't load the journal"
              hint="Check your connection — or run migration 011 if you haven't yet."
              onRetry={() => setReloadToken((t) => t + 1)}
            />
          )}
          {entries?.length === 0 && !entriesError && (
            <span style={{ color: DUSK.textMuted, fontSize: 12.5, textAlign: 'center', padding: '12px 0' }}>{canEdit ? 'No entries yet — write your first note above ✍️' : 'No journal entries yet. An editor can add the first memory.'}</span>
          )}
          {entries?.map((entry) => (
            <div key={entry.id} style={{ borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT_LIGHT }}>{formatJournalDate(entry.entry_date)}</span>
                {canEdit && entry.created_by === currentUserId && <button
                  onClick={() => setPendingDelete(entry)}
                  aria-label="Delete entry"
                  style={{ marginLeft: 'auto', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: DUSK.textMuted }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>}
              </div>
              {entry.note && (
                <div style={{ marginTop: 6, fontSize: 13.5, color: DUSK.textPrimary, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{entry.note}</div>
              )}
              {(entry.journal_photos?.length ?? 0) > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {entry.journal_photos!.map((p) => {
                    const url = signedPhotoUrls[p.storage_path]?.url
                    return (
                      <button
                        key={p.id}
                        onClick={(e) => {
                          if (!url) return
                          lightboxTriggerRef.current = e.currentTarget
                          setLightbox(url)
                        }}
                        disabled={!url}
                        aria-label="View photo full-screen"
                        style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'block', width: '100%' }}
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={p.caption ?? 'Trip photo'}
                            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', display: 'block' }}
                          />
                        ) : (
                          <span aria-label="Authorizing photo" style={{ width: '100%', aspectRatio: '1', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', display: 'block', background: 'rgba(255,255,255,.04)' }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Trip photo"
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <button
            ref={lightboxCloseRef}
            autoFocus
            onClick={() => setLightbox(null)}
            aria-label="Close photo"
            style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.22)', color: DUSK.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Trip photo" style={{ maxWidth: '100%', maxHeight: '90svh', borderRadius: 14, objectFit: 'contain' }} />
        </div>
      )}

      {canEdit && <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete journal entry?"
        message="The note and its photos will be removed for everyone on this trip."
        onConfirm={() => pendingDelete && deleteEntry(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />}
      <BottomSheet open={recapPreviewOpen} onClose={() => !sharing && setRecapPreviewOpen(false)} titleId="recap-privacy-title" title="Choose what to share">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.04)', color: DUSK.textSecondary, fontSize: 12, lineHeight: 1.5 }}>
            Private by default: confirmation numbers, private notes, member debt and precise locations are never included.
          </div>
          {([
            ['distance', 'Route distance & drive time', true],
            ['visitedCount', `Visited stops · ${recapStats.visited}/${recapStats.planned}`, true],
            ['photoCount', `Photo count · ${recapStats.photos}`, true],
            ['journalCount', `Memory count · ${recapStats.journal}`, true],
            ['expenseCount', `Expense count · ${expenseCount}`, true],
            ['memoryText', firstShareableNote ? 'First journal note' : 'No note available', !!firstShareableNote],
            ['photoUrl', firstShareablePhoto ? 'First journal photo' : 'No photo available', !!firstShareablePhoto],
          ] as [RecapShareField, string, boolean][]).map(([field, label, available]) => (
            <label key={field} style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, opacity: available ? 1 : .45, color: DUSK.textPrimary, fontSize: 13 }}>
              <input type="checkbox" disabled={!available} checked={recapFields.includes(field)} onChange={(event) => {
                setRecapField(field, event.target.checked)
                if (field === 'distance') setRecapField('durationHours', event.target.checked)
              }} /> {label}
            </label>
          ))}
          <button type="button" onClick={() => void shareRecap()} disabled={sharing} style={{ minHeight: 48, borderRadius: 14, border: 0, background: ACCENT_GRADIENT, color: DUSK.onAmber, fontWeight: 850 }}>{sharing ? 'Creating image…' : 'Share selected recap'}</button>
        </div>
      </BottomSheet>
    </div>
  )
}
