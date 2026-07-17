'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItineraryItem, Reservation, ReservationPaymentStatus, ReservationStatus, ReservationType, Trip, TripCurrency } from '@/types'
import { CURRENCY_SYMBOLS } from '@/types'
import { FilterChip, InlineError, tokens } from '@/components/mobile'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import { createRandomId } from '@/lib/random-id'
import {
  ATTACHMENT_ACCEPT,
  buildAttachmentPath,
  decideItineraryLink,
  DOCUMENTS_BUCKET,
  formatAttachmentSize,
  itineraryTypeForReservation,
  reservationLocalDate,
  sanitizeExternalUrl,
  validateAttachmentFile,
} from './bookings-logic'
import { PAYMENT_STATUS_META, RESERVATION_STATUS_META, RESERVATION_TYPE_META } from './bookings-ui'

/** Editable wall-clock draft; instants are built in the device zone on save. */
export interface ReservationDraft {
  id: string | null
  reservation_type: ReservationType
  title: string
  provider: string
  confirmation_number: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  address: string
  amount: string
  currency: TripCurrency
  payment_status: ReservationPaymentStatus
  status: ReservationStatus
  booking_url: string
  notes: string
  /** 'none' | 'create' | an existing itinerary item id. */
  itineraryLink: string
}

export function emptyReservationDraft(currency: TripCurrency): ReservationDraft {
  return {
    id: null, reservation_type: 'stay', title: '', provider: '', confirmation_number: '',
    startDate: '', startTime: '', endDate: '', endTime: '', address: '', amount: '',
    currency, payment_status: 'unpaid', status: 'confirmed', booking_url: '', notes: '',
    itineraryLink: 'none',
  }
}

export function draftFromReservation(reservation: Reservation, fallbackCurrency: TripCurrency): ReservationDraft {
  const toParts = (instant: string | null): { date: string; time: string } => {
    if (!instant) return { date: '', time: '' }
    const value = new Date(instant)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
      time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
    }
  }
  const start = toParts(reservation.start_at)
  const end = toParts(reservation.end_at)
  return {
    id: reservation.id,
    reservation_type: reservation.reservation_type,
    title: reservation.title,
    provider: reservation.provider ?? '',
    confirmation_number: reservation.confirmation_number ?? '',
    startDate: start.date, startTime: start.time,
    endDate: end.date, endTime: end.time,
    address: reservation.address ?? '',
    amount: reservation.amount !== null ? String(reservation.amount) : '',
    currency: reservation.currency ?? fallbackCurrency,
    payment_status: reservation.payment_status,
    status: reservation.status,
    booking_url: reservation.booking_url ?? '',
    notes: reservation.notes ?? '',
    itineraryLink: reservation.itinerary_item_id ?? 'none',
  }
}

interface DraftFile {
  id: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'error' | 'offline' | 'invalid' | 'cleanup-error'
  progress: number
  storagePath?: string
  errorMessage?: string
}

/** Existing attachment row shown alongside new uploads. */
interface ExistingAttachment {
  id: string
  storage_path: string
  original_name: string
  size_bytes: number
}

/**
 * Streams the document to the Storage REST endpoint via XHR (supabase-js does
 * not expose upload progress), mirroring the journal photo uploader.
 */
function uploadDocumentWithProgress(
  accessToken: string,
  path: string,
  file: File,
  signal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const apiKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${DOCUMENTS_BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('apikey', apiKey)
    xhr.setRequestHeader('Content-Type', file.type)
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
    xhr.send(file)
  })
}

export interface ReservationEditorSheetProps {
  trip: Trip
  draft: ReservationDraft | null
  /** Attachment rows already saved for the reservation being edited. */
  existingAttachments: ExistingAttachment[]
  items: ItineraryItem[]
  setItems: React.Dispatch<React.SetStateAction<ItineraryItem[]>>
  itineraryEnabled: boolean
  currentUserId: string
  onClose: () => void
  /** Called after any successful persist so the list refetches. */
  onSaved: () => Promise<void>
}

type Step = 'basics' | 'schedule' | 'payment' | 'documents' | 'itinerary'
const STEPS: { key: Step; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'schedule', label: 'When & where' },
  { key: 'payment', label: 'Payment' },
  { key: 'documents', label: 'Documents' },
  { key: 'itinerary', label: 'Itinerary' },
]

const FIELD_STYLE = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 12,
  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)',
  color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
} as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}

/** Local wall-clock date+time → absolute instant; date alone anchors midnight. */
function instantFromParts(date: string, time: string): string | null {
  if (!date) return null
  return new Date(`${date}T${time || '00:00'}:00`).toISOString()
}

/**
 * Full-screen create/edit flow for one booking, split into five sections.
 * The reservation row is saved first; documents upload afterwards, so an
 * upload failure is partial success (record kept, per-file retry) — never a
 * silent rollback of the booking itself.
 */
export function ReservationEditorSheet({
  trip, draft, existingAttachments, items, setItems, itineraryEnabled, currentUserId, onClose, onSaved,
}: ReservationEditorSheetProps) {
  const [step, setStep] = useState<Step>('basics')
  const [form, setForm] = useState<ReservationDraft | null>(draft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([])
  const [removedExistingIds, setRemovedExistingIds] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeUploadControllersRef = useRef(new Map<string, AbortController>())
  // Survives a partial failure: the second Save updates instead of re-inserting.
  const persistedIdRef = useRef<string | null>(draft?.id ?? null)

  useEffect(() => {
    setForm(draft)
    setStep('basics')
    setError(null)
    setDraftFiles([])
    setRemovedExistingIds(new Set())
    persistedIdRef.current = draft?.id ?? null
  }, [draft])

  useEffect(() => {
    if (!draft) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [draft, onClose])

  useEffect(() => () => {
    activeUploadControllersRef.current.forEach((controller) => controller.abort())
  }, [])

  const validation = useMemo(() => {
    if (!form) return null
    if (!form.title.trim()) return 'Give the booking a title.'
    const startInstant = instantFromParts(form.startDate, form.startTime)
    const endInstant = instantFromParts(form.endDate, form.endTime)
    if (startInstant && endInstant && endInstant < startInstant) return 'End can’t be before the start.'
    if (form.amount && (Number.isNaN(Number(form.amount)) || Number(form.amount) < 0)) return 'Amount must be a non-negative number.'
    if (form.booking_url.trim() && !sanitizeExternalUrl(form.booking_url)) return 'The booking link must be a valid http(s) URL.'
    return null
  }, [form])

  if (!draft || !form) return null

  const set = <K extends keyof ReservationDraft>(key: K, value: ReservationDraft[K]) =>
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous))

  const visibleExisting = existingAttachments.filter((attachment) => !removedExistingIds.has(attachment.id))

  const addFiles = (files: File[]) => {
    setDraftFiles((previous) => [
      ...previous,
      ...files.map((file): DraftFile => {
        const invalid = validateAttachmentFile(file)
        return {
          id: createRandomId(),
          file,
          status: invalid ? 'invalid' : 'queued',
          progress: 0,
          errorMessage: invalid?.message,
        }
      }),
    ])
  }

  const removeDraftFile = async (entry: DraftFile) => {
    activeUploadControllersRef.current.get(entry.id)?.abort()
    if (entry.status === 'done' || entry.status === 'cleanup-error') {
      const supabase = createClient()
      if (entry.storagePath) {
        const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([entry.storagePath])
        if (storageError) {
          setDraftFiles((previous) => previous.map((item) => item.id === entry.id
            ? { ...item, status: 'cleanup-error', errorMessage: 'Could not remove the uploaded file. Try again.' }
            : item))
          showToast("Couldn't remove the uploaded document.", 'error')
          return
        }
        await supabase.from('reservation_attachments').delete().eq('storage_path', entry.storagePath)
      }
    }
    setDraftFiles((previous) => previous.filter((item) => item.id !== entry.id))
  }

  const removeExistingAttachment = async (attachment: ExistingAttachment) => {
    const supabase = createClient()
    const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([attachment.storage_path])
    if (storageError) {
      showToast("Couldn't remove the document file. Retry is safe.", 'error')
      return
    }
    const { error: rowError } = await supabase.from('reservation_attachments').delete().eq('id', attachment.id)
    if (rowError) {
      showToast('The file was removed, but its record still needs cleanup. Retry removal.', 'error')
      return
    }
    setRemovedExistingIds((previous) => new Set(previous).add(attachment.id))
    await onSaved()
  }

  const trySave = async () => {
    if (saving) return
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    setSaving(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setSaving(false)
      showToast('Your session expired. Sign in again before saving.', 'error')
      return
    }

    const deviceZone = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null } catch { return null }
    })()
    const startAt = instantFromParts(form.startDate, form.startTime)
    const endAt = instantFromParts(form.endDate, form.endTime)
    const payload = {
      reservation_type: form.reservation_type,
      provider: form.provider.trim() || null,
      title: form.title.trim(),
      confirmation_number: form.confirmation_number.trim() || null,
      start_at: startAt,
      end_at: endAt,
      timezone: startAt || endAt ? deviceZone : null,
      address: form.address.trim() || null,
      amount: form.amount ? Number(form.amount) : null,
      currency: form.amount ? form.currency : null,
      payment_status: form.payment_status,
      status: form.status,
      booking_url: sanitizeExternalUrl(form.booking_url),
      notes: form.notes.trim() || null,
    }

    // 1. Persist the reservation row itself.
    let reservationId = persistedIdRef.current
    if (reservationId) {
      const { error: updateError } = await supabase.from('reservations').update(payload).eq('id', reservationId)
      if (updateError) {
        setSaving(false)
        showToast("Couldn't save the booking changes. Retry is safe.", 'error')
        return
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('reservations')
        .insert({ ...payload, trip_id: trip.id, created_by: currentUserId })
        .select('id')
        .single()
      if (insertError || !inserted) {
        setSaving(false)
        showToast("Couldn't create the booking. No documents were uploaded.", 'error')
        return
      }
      reservationId = inserted.id
      persistedIdRef.current = reservationId
    }
    if (!reservationId) {
      setSaving(false)
      return
    }

    // 2. Upload queued documents. Failures leave the saved record intact.
    let failedCount = 0
    let cleanupFailureCount = 0
    for (const entry of draftFiles) {
      if (entry.status === 'done' || entry.status === 'invalid') continue

      if (entry.status === 'cleanup-error' && entry.storagePath) {
        const { error: cleanupError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([entry.storagePath])
        if (cleanupError) {
          failedCount += 1
          cleanupFailureCount += 1
          continue
        }
      }

      const path = buildAttachmentPath(trip.id, reservationId, createRandomId(), entry.file.type)
      const controller = new AbortController()
      activeUploadControllersRef.current.set(entry.id, controller)
      setDraftFiles((previous) => previous.map((item) => item.id === entry.id
        ? { ...item, status: 'uploading', progress: 0, storagePath: path, errorMessage: undefined }
        : item))
      try {
        await uploadDocumentWithProgress(session.access_token, path, entry.file, controller.signal, (progress) => {
          setDraftFiles((previous) => previous.map((item) => item.id === entry.id ? { ...item, progress } : item))
        })
        const { error: linkError } = await supabase
          .from('reservation_attachments')
          .insert({
            reservation_id: reservationId,
            storage_path: path,
            original_name: entry.file.name.slice(0, 255),
            mime_type: entry.file.type,
            size_bytes: entry.file.size,
            uploaded_by: currentUserId,
          })
        if (linkError) throw new Error('Document uploaded but could not be linked to the booking')
        setDraftFiles((previous) => previous.map((item) => item.id === entry.id
          ? { ...item, status: 'done', progress: 100, storagePath: path }
          : item))
      } catch (uploadError) {
        const { error: cleanupError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([path])
        const wasCancelled = uploadError instanceof DOMException && uploadError.name === 'AbortError'
        const status = cleanupError ? 'cleanup-error' : (!navigator.onLine ? 'offline' : 'error')
        const message = cleanupError
          ? 'Upload failed and automatic cleanup also failed; Retry will clean this file first.'
          : wasCancelled ? 'Upload cancelled.' : 'Upload failed; Retry is safe.'
        setDraftFiles((previous) => previous.map((item) => item.id === entry.id
          ? { ...item, status, progress: 0, storagePath: cleanupError ? path : undefined, errorMessage: message }
          : item))
        failedCount += 1
        if (cleanupError) cleanupFailureCount += 1
      } finally {
        activeUploadControllersRef.current.delete(entry.id)
      }
    }

    // 3. Itinerary link — duplicate-safe via decideItineraryLink.
    let itineraryFailed = false
    if (itineraryEnabled && form.itineraryLink !== 'none') {
      const existingIds = new Set(items.map((item) => item.id))
      const decision = decideItineraryLink(
        { itinerary_item_id: draft.id ? (form.itineraryLink !== 'create' ? form.itineraryLink : null) : null },
        existingIds,
        form.itineraryLink !== 'create' ? form.itineraryLink : null,
      )
      const alreadyLinked = draft.itineraryLink !== 'none' && draft.itineraryLink !== 'create' && draft.itineraryLink === form.itineraryLink
      if (!alreadyLinked) {
        if (decision.action === 'create-item') {
          const localDate = startAt ? reservationLocalDate(startAt, deviceZone) : null
          const { data: createdItem, error: itemError } = await supabase
            .from('itinerary_items')
            .insert({
              trip_id: trip.id,
              item_type: itineraryTypeForReservation(form.reservation_type),
              title: form.title.trim(),
              notes: null,
              start_at: startAt,
              end_at: endAt,
              all_day: !form.startTime,
              local_date: localDate,
              timezone: startAt ? deviceZone : null,
              address: form.address.trim() || null,
              status: 'planned',
              is_locked: true,
              created_by: currentUserId,
            })
            .select('*')
            .single()
          if (itemError || !createdItem) {
            itineraryFailed = true
          } else {
            const { error: linkError } = await supabase
              .from('reservations')
              .update({ itinerary_item_id: createdItem.id })
              .eq('id', reservationId)
            if (linkError) itineraryFailed = true
            else setItems((previous) => [...previous, createdItem as ItineraryItem])
          }
        } else if (decision.action === 'link-existing' && decision.itemId) {
          const { error: linkError } = await supabase
            .from('reservations')
            .update({ itinerary_item_id: decision.itemId })
            .eq('id', reservationId)
          if (linkError) itineraryFailed = true
        }
      }
    } else if (draft.itineraryLink !== 'none' && form.itineraryLink === 'none' && draft.id) {
      const { error: unlinkError } = await supabase
        .from('reservations')
        .update({ itinerary_item_id: null })
        .eq('id', reservationId)
      if (unlinkError) itineraryFailed = true
    }

    await onSaved()
    setSaving(false)

    if (failedCount > 0 || itineraryFailed) {
      const parts: string[] = ['Booking saved.']
      if (failedCount > 0) {
        parts.push(`${failedCount} document${failedCount === 1 ? '' : 's'} need retry.`)
        if (cleanupFailureCount > 0) parts.push(`${cleanupFailureCount} still need cleanup.`)
      }
      if (itineraryFailed) parts.push("The itinerary link couldn't be applied — save again to retry.")
      showToast(parts.join(' '), 'error')
      if (failedCount > 0) setStep('documents')
      return
    }

    showToast(draft.id ? 'Booking updated ✅' : 'Booking added ✅', 'success')
    onClose()
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const linkedElsewhere = form.itineraryLink !== 'none' && form.itineraryLink !== 'create'
  const linkTargets = items.filter((item) => item.title.trim().length > 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-editor-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 140, display: 'flex', flexDirection: 'column',
        background: tokens.bgBase, fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
      }}
    >
      {/* Glass header — the form body below stays solid. */}
      <header
        style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 10,
          padding: 'max(12px, env(safe-area-inset-top)) 16px 12px',
          background: tokens.glassStandardFill, borderBottom: `1px solid ${tokens.glassStandardBorder}`,
          backdropFilter: 'blur(var(--glass-standard-blur))', WebkitBackdropFilter: 'blur(var(--glass-standard-blur))',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: tokens.textPrimary, cursor: 'pointer' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="reservation-editor-title" style={{ fontSize: 16, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.01em' }}>
            {draft.id ? 'Edit booking' : 'New booking'}
          </div>
          <div style={{ fontSize: 11.5, color: tokens.textMuted, marginTop: 1 }}>{RESERVATION_TYPE_META[form.reservation_type].label}</div>
        </div>
        <button
          type="button"
          onClick={() => { void trySave() }}
          disabled={saving}
          style={{
            minHeight: 40, padding: '0 18px', borderRadius: 12, border: 'none', cursor: saving ? 'default' : 'pointer',
            background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, fontSize: 13.5,
            fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      {/* Section selector — navigation, not a wizard lock. */}
      <nav aria-label="Form sections" style={{ flex: 'none', display: 'flex', gap: 6, padding: '12px 16px 0', overflowX: 'auto' }}>
        {STEPS.map((s, index) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            aria-current={s.key === step ? 'step' : undefined}
            style={{
              flex: 'none', minHeight: 40, padding: '0 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              background: s.key === step ? 'rgba(245,166,35,.16)' : 'rgba(255,255,255,.05)',
              border: `1px solid ${s.key === step ? 'rgba(245,140,0,.4)' : 'rgba(255,255,255,.1)'}`,
              color: s.key === step ? tokens.accentLight : tokens.textSecondary, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            {index + 1}. {s.label}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 16px max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <InlineError>{error}</InlineError>}

        {step === 'basics' && (
          <>
            <Field label="Type">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(RESERVATION_TYPE_META) as ReservationType[]).map((type) => (
                  <FilterChip key={type} selected={form.reservation_type === type} onClick={() => set('reservation_type', type)}>
                    {RESERVATION_TYPE_META[type].label}
                  </FilterChip>
                ))}
              </div>
            </Field>
            <Field label="Title">
              <input autoFocus={!form.id} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Flight to Rome" style={FIELD_STYLE} />
            </Field>
            <Field label="Provider (optional)">
              <input value={form.provider} onChange={(e) => set('provider', e.target.value)} placeholder="e.g. Turkish Airlines" style={FIELD_STYLE} />
            </Field>
            <Field label="Booking link (optional)">
              <input inputMode="url" value={form.booking_url} onChange={(e) => set('booking_url', e.target.value)} placeholder="https://…" style={FIELD_STYLE} />
            </Field>
          </>
        )}

        {step === 'schedule' && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.2 }}>
                <Field label="Start date">
                  <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} style={{ ...FIELD_STYLE, colorScheme: 'dark' }} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Start time">
                  <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} disabled={!form.startDate} style={{ ...FIELD_STYLE, colorScheme: 'dark' }} />
                </Field>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.2 }}>
                <Field label="End date">
                  <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} style={{ ...FIELD_STYLE, colorScheme: 'dark' }} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="End time">
                  <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} disabled={!form.endDate} style={{ ...FIELD_STYLE, colorScheme: 'dark' }} />
                </Field>
              </div>
            </div>
            <Field label="Address / location (optional)">
              <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, terminal, or venue" style={FIELD_STYLE} />
            </Field>
          </>
        )}

        {step === 'payment' && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.4 }}>
                <Field label={`Amount (${CURRENCY_SYMBOLS[form.currency]})`}>
                  <input inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" style={FIELD_STYLE} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Currency">
                  <select value={form.currency} onChange={(e) => set('currency', e.target.value as TripCurrency)} style={FIELD_STYLE}>
                    {(Object.keys(CURRENCY_SYMBOLS) as TripCurrency[]).map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <Field label="Payment">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(PAYMENT_STATUS_META) as ReservationPaymentStatus[]).map((status) => (
                  <FilterChip key={status} selected={form.payment_status === status} onClick={() => set('payment_status', status)}>
                    {PAYMENT_STATUS_META[status].label}
                  </FilterChip>
                ))}
              </div>
            </Field>
            <Field label="Booking status">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(RESERVATION_STATUS_META) as ReservationStatus[]).map((status) => (
                  <FilterChip key={status} selected={form.status === status} onClick={() => set('status', status)}>
                    {RESERVATION_STATUS_META[status].label}
                  </FilterChip>
                ))}
              </div>
            </Field>
            <Field label="Confirmation number (optional)">
              <input value={form.confirmation_number} onChange={(e) => set('confirmation_number', e.target.value)} maxLength={64} placeholder="e.g. ABC123" style={FIELD_STYLE} />
            </Field>
          </>
        )}

        {step === 'documents' && (
          <>
            <input
              ref={fileInputRef}
              aria-label="Booking documents"
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []))
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48,
                borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px dashed rgba(255,255,255,.25)',
                color: tokens.textPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              Add PDF or image (max 20 MB)
            </button>

            {visibleExisting.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleExisting.map((attachment) => (
                  <div key={attachment.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)' }}>
                    <span style={{ minWidth: 0, flex: 1, fontSize: 13, color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.original_name}</span>
                    <span style={{ flex: 'none', fontSize: 11.5, color: tokens.textMuted }}>{formatAttachmentSize(attachment.size_bytes)}</span>
                    <button
                      type="button"
                      onClick={() => { void removeExistingAttachment(attachment) }}
                      aria-label={`Remove ${attachment.original_name}`}
                      style={{ flex: 'none', width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: tokens.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {draftFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draftFiles.map((entry) => (
                  <div key={entry.id} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: `1px solid ${entry.status === 'invalid' || entry.status === 'error' || entry.status === 'cleanup-error' ? 'rgba(239,68,68,.35)' : 'rgba(255,255,255,.1)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ minWidth: 0, flex: 1, fontSize: 13, color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.file.name}</span>
                      <span style={{ flex: 'none', fontSize: 11.5, color: tokens.textMuted }}>
                        {entry.status === 'uploading' ? `${entry.progress}%`
                          : entry.status === 'done' ? 'Uploaded'
                          : entry.status === 'queued' ? 'Ready'
                          : entry.status === 'offline' ? 'Offline'
                          : entry.status === 'invalid' ? 'Unsupported'
                          : 'Failed'}
                      </span>
                      {(entry.status === 'error' || entry.status === 'offline') && (
                        <button
                          type="button"
                          onClick={() => setDraftFiles((previous) => previous.map((item) => item.id === entry.id ? { ...item, status: 'queued', progress: 0, errorMessage: undefined } : item))}
                          aria-label={`Retry uploading ${entry.file.name}`}
                          style={{ flex: 'none', minHeight: 32, padding: '0 10px', borderRadius: 8, background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.35)', color: tokens.accentLight, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { void removeDraftFile(entry) }}
                        aria-label={`Remove ${entry.file.name}`}
                        style={{ flex: 'none', width: 32, height: 32, borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,.15)', color: tokens.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                      </button>
                    </div>
                    {entry.status === 'uploading' && (
                      <div aria-hidden="true" style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
                        <div style={{ width: `${entry.progress}%`, height: '100%', borderRadius: 2, background: tokens.accentGradient, transition: 'width .2s linear' }} />
                      </div>
                    )}
                    {entry.errorMessage && (
                      <div style={{ marginTop: 6, fontSize: 11.5, color: entry.status === 'invalid' || entry.status === 'error' || entry.status === 'cleanup-error' ? tokens.danger : tokens.warning, lineHeight: 1.45 }}>
                        {entry.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
                {draftFiles.some((entry) => entry.status === 'offline') && (
                  <div style={{ fontSize: 11.5, color: tokens.warning, fontWeight: 600 }}>Offline — documents upload when you save again online.</div>
                )}
              </div>
            )}

            <Field label="Notes (optional)">
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={4} placeholder="Seat numbers, check-in hints, cancellation policy…" style={{ ...FIELD_STYLE, resize: 'vertical' }} />
            </Field>
          </>
        )}

        {step === 'itinerary' && (
          <>
            {!itineraryEnabled ? (
              <p style={{ margin: 0, fontSize: 12.5, color: tokens.textMuted, lineHeight: 1.6 }}>
                The itinerary isn’t available yet — apply the itinerary migration to link bookings to your daily plan.
              </p>
            ) : (
              <>
                <Field label="Itinerary">
                  <select value={form.itineraryLink} onChange={(e) => set('itineraryLink', e.target.value)} style={FIELD_STYLE}>
                    <option value="none">Not on the itinerary</option>
                    <option value="create">Create a plan item from this booking</option>
                    {linkTargets.map((item) => (
                      <option key={item.id} value={item.id}>
                        Link to: {item.title}{item.local_date ? ` (${item.local_date})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <p style={{ margin: 0, fontSize: 12, color: tokens.textMuted, lineHeight: 1.6 }}>
                  {linkedElsewhere
                    ? 'This booking points at an existing plan item — no duplicate is created.'
                    : form.itineraryLink === 'create'
                      ? 'A locked plan item is created on the booking’s start day. Saving again never creates a second one.'
                      : 'Linking keeps Plan and Bookings in sync without duplicating entries.'}
                </p>
              </>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => setStep(STEPS[stepIndex - 1].key)}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: tokens.textPrimary, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Back
            </button>
          )}
          {stepIndex < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => setStep(STEPS[stepIndex + 1].key)}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: tokens.textPrimary, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Next
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
