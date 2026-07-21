'use client'

import { useEffect, useMemo, useState } from 'react'
import { tokens, FilterChip, InlineError } from '@/components/mobile'
import { CURRENCY_SYMBOLS, type ItineraryItemStatus, type ItineraryItemType, type TripCurrency, type TripMember } from '@/types'
import { ITEM_TYPE_META, STATUS_META } from './itinerary-ui'
import { CommentSection } from '../components/CollaborationSheets'
import { useTripEditingEntity, useTripPresence } from '@/lib/supabase/trip-realtime'

/** Editable wall-clock draft; the timeline converts it to/from row instants. */
export interface ItineraryItemDraft {
  id: string | null
  item_type: ItineraryItemType
  title: string
  notes: string
  /** YYYY-MM-DD or '' for unscheduled. */
  localDate: string
  allDay: boolean
  /** HH:mm wall-clock times; '' when unset. */
  startTime: string
  endTime: string
  address: string
  estimatedCost: string
  currency: TripCurrency
  status: ItineraryItemStatus
  isLocked: boolean
  stopId: string | null
}

export interface DayOption {
  /** YYYY-MM-DD, or '' for the unscheduled bucket. */
  value: string
  label: string
}

export interface ItineraryItemSheetProps {
  draft: ItineraryItemDraft | null
  dayOptions: DayOption[]
  saving: boolean
  onClose: () => void
  onSave: (draft: ItineraryItemDraft) => void
  tripId: string
  currentUserId: string
  members: TripMember[]
  canComment: boolean
}

type Step = 'basics' | 'schedule' | 'details' | 'comments'
const STEPS: { key: Step; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'details', label: 'Details' },
  { key: 'comments', label: 'Comments' },
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

/**
 * Full-screen create/edit sheet. The long form is split into three steps
 * (Basics → Schedule → Details); Save is available from every step once the
 * draft is valid, so steps are navigation, not a wizard lock.
 */
export function ItineraryItemSheet({ draft, dayOptions, saving, onClose, onSave, tripId, currentUserId, members, canComment }: ItineraryItemSheetProps) {
  const [step, setStep] = useState<Step>('basics')
  const [form, setForm] = useState<ItineraryItemDraft | null>(draft)
  const [error, setError] = useState<string | null>(null)
  const presence = useTripPresence()
  useTripEditingEntity(draft?.id ?? null)

  useEffect(() => {
    setForm(draft)
    setStep('basics')
    setError(null)
  }, [draft])

  useEffect(() => {
    if (!draft) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [draft, onClose])

  const validation = useMemo(() => {
    if (!form) return null
    if (!form.title.trim()) return 'Give the item a title.'
    if (!form.allDay && form.startTime && form.endTime && form.endTime < form.startTime) {
      return 'End time can’t be before the start time.'
    }
    if (form.estimatedCost && Number.isNaN(Number(form.estimatedCost))) return 'Cost must be a number.'
    return null
  }, [form])

  if (!draft || !form) return null

  const set = <K extends keyof ItineraryItemDraft>(key: K, value: ItineraryItemDraft[K]) =>
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous))

  const trySave = () => {
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    onSave(form)
  }

  const availableSteps = form.id ? STEPS : STEPS.filter((item) => item.key !== 'comments')
  const stepIndex = availableSteps.findIndex((s) => s.key === step)
  const otherEditor = form.id ? presence.find((entry) => entry.userId !== currentUserId && entry.editingEntityId === form.id) : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="itinerary-item-sheet-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 140, display: 'flex', flexDirection: 'column',
        background: tokens.bgBase, fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
      }}
    >
      {/* Glass header — the body below stays solid. */}
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
          <div id="itinerary-item-sheet-title" style={{ fontSize: 16, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.01em' }}>
            {form.id ? 'Edit item' : 'New item'}
          </div>
          <div style={{ fontSize: 11.5, color: tokens.textMuted, marginTop: 1 }}>{ITEM_TYPE_META[form.item_type].label}</div>
        </div>
        <button
          type="button"
          onClick={trySave}
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

      {/* Step selector */}
      <nav aria-label="Form sections" style={{ flex: 'none', display: 'flex', gap: 6, padding: '12px 16px 0' }}>
        {availableSteps.map((s, index) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            aria-current={s.key === step ? 'step' : undefined}
            style={{
              flex: 1, minHeight: 40, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              background: s.key === step ? 'rgba(245,166,35,.16)' : 'rgba(255,255,255,.05)',
              border: `1px solid ${s.key === step ? 'rgba(245,140,0,.4)' : 'rgba(255,255,255,.1)'}`,
              color: s.key === step ? tokens.accentLight : tokens.textSecondary, fontSize: 12.5, fontWeight: 700,
            }}
          >
            {index + 1}. {s.label}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 16px max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <InlineError>{error}</InlineError>}
        {otherEditor && <div aria-live="off" style={{ alignSelf: 'flex-start', padding: '5px 9px', borderRadius: 999, background: 'rgba(56,217,150,.1)', border: '1px solid rgba(56,217,150,.25)', color: '#8ee8bd', fontSize: 11.5 }}>{otherEditor.profile?.display_name || 'A trip member'} is editing this activity</div>}

        {step === 'basics' && (
          <>
            <Field label="Type">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(ITEM_TYPE_META) as ItineraryItemType[]).map((type) => (
                  <FilterChip key={type} selected={form.item_type === type} onClick={() => set('item_type', type)}>
                    {ITEM_TYPE_META[type].label}
                  </FilterChip>
                ))}
              </div>
            </Field>
            <Field label="Title">
              <input autoFocus={!form.id} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Louvre tickets" style={FIELD_STYLE} />
            </Field>
            <Field label="Notes">
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={4} placeholder="Anything the group should know" style={{ ...FIELD_STYLE, resize: 'vertical' }} />
            </Field>
          </>
        )}

        {step === 'schedule' && (
          <>
            <Field label="Day">
              <select value={form.localDate} onChange={(e) => set('localDate', e.target.value)} style={FIELD_STYLE}>
                <option value="">Unscheduled</option>
                {dayOptions.filter((option) => option.value !== '').map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#f5a623' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>All day</span>
            </label>
            {!form.allDay && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Starts">
                    <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} disabled={!form.localDate} style={FIELD_STYLE} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Ends">
                    <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} disabled={!form.localDate || !form.startTime} style={FIELD_STYLE} />
                  </Field>
                </div>
              </div>
            )}
            {!form.localDate && (
              <p style={{ margin: 0, fontSize: 12, color: tokens.textMuted, lineHeight: 1.5 }}>
                Without a day, the item waits in the Unscheduled drawer.
              </p>
            )}
          </>
        )}

        {step === 'details' && (
          <>
            <Field label="Location / address">
              <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, area, or venue" style={FIELD_STYLE} />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1.4 }}>
                <Field label={`Estimated cost (${CURRENCY_SYMBOLS[form.currency]})`}>
                  <input inputMode="decimal" value={form.estimatedCost} onChange={(e) => set('estimatedCost', e.target.value)} placeholder="0" style={FIELD_STYLE} />
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
            <Field label="Status">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(STATUS_META) as ItineraryItemStatus[]).map((status) => (
                  <FilterChip key={status} selected={form.status === status} onClick={() => set('status', status)}>
                    {STATUS_META[status].label}
                  </FilterChip>
                ))}
              </div>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isLocked} onChange={(e) => set('isLocked', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#f5a623' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>
                Lock time
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: tokens.textMuted }}>Fixed booking — planners shouldn’t shuffle it.</span>
              </span>
            </label>
          </>
        )}

        {step === 'comments' && form.id && (
          <CommentSection tripId={tripId} entityType="itinerary_item" entityId={form.id} currentUserId={currentUserId} members={members} canComment={canComment} />
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => setStep(availableSteps[stepIndex - 1].key)}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: tokens.textPrimary, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Back
            </button>
          )}
          {stepIndex < availableSteps.length - 1 && (
            <button
              type="button"
              onClick={() => setStep(availableSteps[stepIndex + 1].key)}
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
