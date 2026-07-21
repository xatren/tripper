'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FilterChip, InlineError, tokens } from '@/components/mobile'
import { createClient } from '@/lib/supabase/client'
import { enqueueMutation } from '@/lib/offline/db'
import { showToast } from '@/components/ui/toast'
import { createRandomId } from '@/lib/random-id'
import type { Expense, ExpenseCategory, ExpenseSplitType, ItineraryItem, Trip, TripMember } from '@/types'
import { CURRENCY_SYMBOLS, EXPENSE_CATEGORIES } from '@/types'
import { SplitEditor, type SplitParticipant, type SplitResolution } from './SplitEditor'
import {
  buildReceiptPath, RECEIPT_ACCEPT, RECEIPTS_BUCKET, validateReceiptFile,
} from './expense-receipts-logic'

export interface ExpenseDraft {
  id: string | null
  category: ExpenseCategory
  description: string
  amount: string
  paidBy: string
  expenseDate: string
  itineraryItemId: string | null
  splitType: ExpenseSplitType
  participantIds: string[]
  exactAmounts: Record<string, string>
  percentages: Record<string, string>
}

function todayISO(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function emptyExpenseDraft(currentUserId: string, activeMemberIds: string[]): ExpenseDraft {
  return {
    id: null, category: 'other', description: '', amount: '', paidBy: currentUserId,
    expenseDate: todayISO(), itineraryItemId: null, splitType: 'equal',
    participantIds: activeMemberIds, exactAmounts: {}, percentages: {},
  }
}

export function draftFromExpense(expense: Expense, activeMemberIds: string[]): ExpenseDraft {
  const splits = expense.expense_splits ?? []
  const participantIds = splits.length > 0
    ? [...new Set(splits.map((s) => s.member_id).filter((id): id is string => !!id))]
    : activeMemberIds
  const exactAmounts: Record<string, string> = {}
  const percentages: Record<string, string> = {}
  for (const split of splits) {
    if (!split.member_id) continue
    if (expense.split_type === 'exact') exactAmounts[split.member_id] = (split.share_amount_minor / 100).toFixed(2)
    if (expense.split_type === 'percentage') percentages[split.member_id] = split.share_value !== null ? String(split.share_value) : ''
  }
  return {
    id: expense.id,
    category: expense.category,
    description: expense.description ?? '',
    amount: String(expense.amount),
    paidBy: expense.paid_by ?? '',
    expenseDate: expense.expense_date || expense.created_at.slice(0, 10),
    itineraryItemId: expense.itinerary_item_id,
    splitType: expense.split_type,
    participantIds,
    exactAmounts,
    percentages,
  }
}

interface DraftReceipt {
  id: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'error' | 'invalid'
  errorMessage?: string
}

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

export interface AddExpenseSheetProps {
  trip: Trip
  members: TripMember[]
  currentUserId: string
  draft: ExpenseDraft | null
  itineraryItems: ItineraryItem[]
  onClose: () => void
  onSaved: () => void
}

/**
 * Full-screen add/edit flow: amount, category, description, date, payer,
 * participants, equal/exact/percentage split, optional itinerary link, and
 * receipt upload. Saves the expense + splits atomically through
 * save_expense_with_splits, then uploads any queued receipts against the
 * returned expense id (same two-phase pattern as ReservationEditorSheet).
 */
export function AddExpenseSheet({ trip, members, currentUserId, draft, itineraryItems, onClose, onSaved }: AddExpenseSheetProps) {
  const [form, setForm] = useState<ExpenseDraft | null>(draft)
  const [resolution, setResolution] = useState<SplitResolution | null>(null)
  const [receipts, setReceipts] = useState<DraftReceipt[]>([])
  const [existingReceiptCount, setExistingReceiptCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const persistedIdRef = useRef<string | null>(draft?.id ?? null)

  useEffect(() => {
    setForm(draft)
    setError(null)
    setReceipts([])
    persistedIdRef.current = draft?.id ?? null
    if (draft?.id) {
      void createClient().from('expense_receipts').select('id', { count: 'exact', head: true }).eq('expense_id', draft.id)
        .then(({ count }) => setExistingReceiptCount(count ?? 0))
    } else {
      setExistingReceiptCount(0)
    }
  }, [draft])

  const sym = CURRENCY_SYMBOLS[trip.currency ?? 'USD'] ?? '$'
  const activeMemberIds = useMemo(() => members.map((m) => m.user_id), [members])
  const memberName = (member: TripMember) => member.user_id === currentUserId
    ? 'You'
    : (member.profile?.display_name?.trim() || member.profile?.email?.split('@')[0] || 'Trip member')

  // Memoized so SplitEditor's resolution stays referentially stable across
  // re-renders that don't actually change the split inputs — without this,
  // a fresh array every render feeds a new "resolution" object into
  // SplitEditor's onResolutionChange effect on every render, which calls
  // setResolution here, triggering another render: an infinite update loop.
  // Must run before the null-draft early return: hooks cannot be conditional.
  const participants: SplitParticipant[] = useMemo(() => (form ? members.map((member) => ({
    memberId: member.user_id,
    name: memberName(member),
    included: form.participantIds.includes(member.user_id),
    exactAmount: form.exactAmounts[member.user_id] ?? '',
    percentage: form.percentages[member.user_id] ?? '',
  })) : []),
  // memberName is a stable-enough closure over currentUserId (already listed) and
  // the per-member profile data carried by `members` itself — not a separate dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [members, form?.participantIds, form?.exactAmounts, form?.percentages, currentUserId])

  if (!draft || !form) return null

  const set = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) =>
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous))

  const amountMinor = Math.round((Number(form.amount) || 0) * 100)

  const toggleParticipant = (memberId: string) => set(
    'participantIds',
    form.participantIds.includes(memberId)
      ? form.participantIds.filter((id) => id !== memberId)
      : [...form.participantIds, memberId],
  )

  const addFiles = (files: File[]) => {
    setReceipts((previous) => [
      ...previous,
      ...files.map((file): DraftReceipt => {
        const invalid = validateReceiptFile(file)
        return { id: createRandomId(), file, status: invalid ? 'invalid' : 'queued', errorMessage: invalid?.message }
      }),
    ])
  }

  const removeReceipt = (id: string) => setReceipts((previous) => previous.filter((entry) => entry.id !== id))

  const amountValid = Number.isFinite(Number(form.amount)) && Number(form.amount) > 0
  const canSave = amountValid && form.paidBy && resolution?.ok

  const trySave = async () => {
    if (saving || !canSave || !resolution?.ok) return
    setError(null)
    setSaving(true)
    const supabase = createClient()

    const activeMemberIdSet = new Set(activeMemberIds)
    const isDefaultEqualAcrossAll = form.splitType === 'equal'
      && form.participantIds.length === activeMemberIdSet.size
      && form.participantIds.every((id) => activeMemberIdSet.has(id))

    const splitsPayload = isDefaultEqualAcrossAll ? [] : resolution.shares.map((share) => ({
      member_id: share.memberId,
      share_value: form.splitType === 'percentage' ? Number(form.percentages[share.memberId] ?? 0) : null,
      share_amount_minor: share.shareMinor,
    }))

    if (!navigator.onLine) {
      if (form.id || splitsPayload.length > 0 || receipts.length > 0) {
        setSaving(false)
        setError('Offline expense creation supports new equal-split expenses without receipts. Reconnect for edits, custom splits, or uploads.')
        return
      }
      const id = crypto.randomUUID()
      try {
        await enqueueMutation({
          user_id: currentUserId, trip_id: trip.id, entity: 'expense', action: 'create', entity_id: id,
          payload: { id, trip_id: trip.id, category: form.category, description: form.description.trim() || null, amount: Number(form.amount), paid_by: form.paidBy, expense_date: form.expenseDate, itinerary_item_id: form.itineraryItemId, split_type: 'equal' },
        })
        setSaving(false)
        showToast('Expense saved on this device · queued.', 'info')
        onClose()
      } catch {
        setSaving(false)
        setError("Couldn't queue this expense.")
      }
      return
    }

    const { data, error: rpcError } = await supabase.rpc('save_expense_with_splits', {
      p_trip_id: trip.id,
      p_expense_id: form.id,
      p_category: form.category,
      p_description: form.description.trim() || null,
      p_amount: Number(form.amount) || 0,
      p_paid_by: form.paidBy,
      p_expense_date: form.expenseDate,
      p_itinerary_item_id: form.itineraryItemId,
      p_split_type: form.splitType,
      p_splits: splitsPayload,
    })

    if (rpcError || !data) {
      setSaving(false)
      setError(rpcError?.message ?? "Couldn't save the expense.")
      return
    }

    const expenseId = (data as { expense: { id: string } }).expense.id
    persistedIdRef.current = expenseId

    let failedCount = 0
    for (const entry of receipts) {
      if (entry.status === 'done' || entry.status === 'invalid') continue
      const path = buildReceiptPath(trip.id, expenseId, createRandomId(), entry.file.type)
      setReceipts((previous) => previous.map((item) => item.id === entry.id ? { ...item, status: 'uploading' } : item))
      const { error: uploadError } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, entry.file, { contentType: entry.file.type })
      if (uploadError) {
        failedCount += 1
        setReceipts((previous) => previous.map((item) => item.id === entry.id
          ? { ...item, status: 'error', errorMessage: 'Upload failed; retry is safe.' }
          : item))
        continue
      }
      const { error: linkError } = await supabase.from('expense_receipts').insert({
        expense_id: expenseId,
        storage_path: path,
        original_name: entry.file.name.slice(0, 255),
        mime_type: entry.file.type,
        size_bytes: entry.file.size,
        uploaded_by: currentUserId,
      })
      if (linkError) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
        failedCount += 1
        setReceipts((previous) => previous.map((item) => item.id === entry.id
          ? { ...item, status: 'error', errorMessage: 'Uploaded but could not be linked; retry is safe.' }
          : item))
        continue
      }
      setReceipts((previous) => previous.map((item) => item.id === entry.id ? { ...item, status: 'done' } : item))
    }

    setSaving(false)
    onSaved()

    if (failedCount > 0) {
      showToast(`Expense saved. ${failedCount} receipt${failedCount === 1 ? '' : 's'} need retry.`, 'error')
      return
    }
    showToast(form.id ? 'Expense updated' : 'Expense added', 'success')
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-expense-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 140, display: 'flex', flexDirection: 'column',
        background: tokens.bgBase, fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
      }}
    >
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
        <div id="add-expense-title" style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.01em' }}>
          {form.id ? 'Edit expense' : 'New expense'}
        </div>
        <button
          type="button"
          onClick={() => { void trySave() }}
          disabled={saving || !canSave}
          style={{
            minHeight: 40, padding: '0 18px', borderRadius: 12, border: 'none', cursor: saving || !canSave ? 'default' : 'pointer',
            background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, fontSize: 13.5,
            fontFamily: 'inherit', opacity: saving || !canSave ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 16px max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <InlineError>{error}</InlineError>}

        <Field label="Category">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EXPENSE_CATEGORIES.map(({ value, label }) => (
              <FilterChip key={value} selected={form.category === value} onClick={() => set('category', value)}>
                {label}
              </FilterChip>
            ))}
          </div>
        </Field>

        <Field label="Description">
          <input autoFocus={!form.id} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Dinner at the harbor" style={FIELD_STYLE} />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label={`Amount (${sym})`}>
              <input inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" style={FIELD_STYLE} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Date">
              <input type="date" value={form.expenseDate} onChange={(e) => set('expenseDate', e.target.value)} style={{ ...FIELD_STYLE, colorScheme: 'dark' }} />
            </Field>
          </div>
        </div>

        <Field label="Paid by">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {members.map((member) => (
              <FilterChip key={member.user_id} selected={form.paidBy === member.user_id} onClick={() => set('paidBy', member.user_id)}>
                {memberName(member)}
              </FilterChip>
            ))}
          </div>
        </Field>

        <Field label="Split">
          <SplitEditor
            currencySymbol={sym}
            totalMinor={amountMinor}
            splitType={form.splitType}
            onSplitTypeChange={(type) => set('splitType', type)}
            participants={participants}
            onToggleParticipant={toggleParticipant}
            onChangeExactAmount={(memberId, value) => set('exactAmounts', { ...form.exactAmounts, [memberId]: value })}
            onChangePercentage={(memberId, value) => set('percentages', { ...form.percentages, [memberId]: value })}
            onResolutionChange={setResolution}
          />
        </Field>

        {itineraryItems.length > 0 && (
          <Field label="Linked itinerary item (optional)">
            <select value={form.itineraryItemId ?? ''} onChange={(e) => set('itineraryItemId', e.target.value || null)} style={FIELD_STYLE}>
              <option value="">Not linked</option>
              {itineraryItems.map((item) => (
                <option key={item.id} value={item.id}>{item.title}{item.local_date ? ` (${item.local_date})` : ''}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Receipt (optional)">
          <input
            ref={fileInputRef}
            aria-label="Expense receipt"
            type="file"
            accept={RECEIPT_ACCEPT}
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
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, width: '100%',
              borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px dashed rgba(255,255,255,.25)',
              color: tokens.textPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Add PDF or image (max 20 MB)
          </button>
          {existingReceiptCount > 0 && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: tokens.textMuted }}>
              {existingReceiptCount} receipt{existingReceiptCount === 1 ? '' : 's'} already attached.
            </div>
          )}
          {receipts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {receipts.map((entry) => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: `1px solid ${entry.status === 'invalid' || entry.status === 'error' ? 'rgba(239,68,68,.35)' : 'rgba(255,255,255,.1)'}` }}>
                  <span style={{ minWidth: 0, flex: 1, fontSize: 13, color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.file.name}</span>
                  <span style={{ flex: 'none', fontSize: 11.5, color: entry.status === 'invalid' || entry.status === 'error' ? tokens.danger : tokens.textMuted }}>
                    {entry.status === 'uploading' ? 'Uploading…' : entry.status === 'done' ? 'Uploaded' : entry.status === 'queued' ? 'Ready' : entry.errorMessage ?? 'Unsupported'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeReceipt(entry.id)}
                    aria-label={`Remove ${entry.file.name}`}
                    style={{ flex: 'none', width: 32, height: 32, borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,.15)', color: tokens.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>
      </main>
    </div>
  )
}
