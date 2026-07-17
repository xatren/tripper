'use client'

import { useEffect, useState } from 'react'
import { MobileBottomSheet, StatusChip, tokens } from '@/components/mobile'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/toast'
import type { Expense, ExpenseReceipt, TripMember } from '@/types'
import { CURRENCY_SYMBOLS, EXPENSE_CATEGORIES } from '@/types'
import { MISSING_PAYER_ID } from '../budget-settlement'
import { RECEIPTS_BUCKET } from './expense-receipts-logic'

const SIGNED_URL_TTL_SECONDS = 5 * 60

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      <span style={{ fontSize: 13.5, color: tokens.textPrimary, lineHeight: 1.5 }}>{children}</span>
    </div>
  )
}

export interface ExpenseDetailSheetProps {
  expense: Expense | null
  members: TripMember[]
  currentUserId: string
  currency: 'USD' | 'EUR' | 'GBP' | 'TRY'
  canEdit: boolean
  onClose: () => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

/**
 * Read view of one expense: its resolved split breakdown and receipts
 * (fetched lazily on open, not synced live — receipts are viewed one at a
 * time here rather than in a running list), plus edit/delete.
 */
export function ExpenseDetailSheet({ expense, members, currentUserId, currency, canEdit, onClose, onEdit, onDelete }: ExpenseDetailSheetProps) {
  const [receipts, setReceipts] = useState<ExpenseReceipt[]>([])
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    setReceipts([])
    setOpeningId(null)
    if (!expense) return
    setLoadingReceipts(true)
    void createClient().from('expense_receipts').select('*').eq('expense_id', expense.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        setReceipts((data as ExpenseReceipt[]) ?? [])
        setLoadingReceipts(false)
      })
  }, [expense])

  if (!expense) return <MobileBottomSheet open={false} onClose={onClose} title="Expense">{null}</MobileBottomSheet>

  const sym = CURRENCY_SYMBOLS[currency] ?? '$'
  const memberById = new Map(members.map((member) => [member.user_id, member]))
  const nameFor = (id: string | null) => {
    if (!id) return 'Unknown payer'
    const member = memberById.get(id)
    if (member) return member.user_id === currentUserId ? 'You' : (member.profile?.display_name?.trim() || member.profile?.email?.split('@')[0] || 'Trip member')
    return `Former member · ${id.slice(0, 4)}`
  }
  const categoryLabel = EXPENSE_CATEGORIES.find((c) => c.value === expense.category)?.label ?? expense.category
  const splits = expense.expense_splits ?? []

  const openReceipt = async (receipt: ExpenseReceipt) => {
    if (openingId) return
    setOpeningId(receipt.id)
    try {
      const { data, error } = await createClient().storage.from(RECEIPTS_BUCKET).createSignedUrl(receipt.storage_path, SIGNED_URL_TTL_SECONDS)
      if (error || !data?.signedUrl) {
        showToast("Couldn't authorize the receipt. Try again.", 'error')
        return
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <MobileBottomSheet open onClose={onClose} title={expense.description || categoryLabel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <StatusChip tone="accent">{categoryLabel}</StatusChip>
          <StatusChip tone="neutral">{expense.split_type === 'equal' ? 'Equal split' : expense.split_type === 'exact' ? 'Exact split' : 'Percentage split'}</StatusChip>
        </div>

        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', borderRadius: tokens.radius16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DetailRow label="Amount">{sym}{Number(expense.amount).toFixed(2)}</DetailRow>
          <DetailRow label="Date">{expense.expense_date}</DetailRow>
          <DetailRow label="Paid by">{nameFor(expense.paid_by)}</DetailRow>
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Split breakdown
          </div>
          {splits.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: tokens.textMuted, lineHeight: 1.5 }}>
              Split equally across current trip members — this expense has no fixed participant list, so it adjusts automatically as members join or leave.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {splits.map((split) => (
                <div key={split.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: tokens.textPrimary }}>
                    {nameFor(split.member_id ?? MISSING_PAYER_ID)}
                  </span>
                  <span style={{ flex: 'none', fontWeight: 700, color: tokens.textSecondary }}>
                    {sym}{(split.share_amount_minor / 100).toFixed(2)}
                    {expense.split_type === 'percentage' && split.share_value !== null ? ` (${split.share_value}%)` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Receipts
          </div>
          {loadingReceipts ? (
            <div style={{ fontSize: 12.5, color: tokens.textMuted }}>Loading…</div>
          ) : receipts.length === 0 ? (
            <div style={{ fontSize: 12.5, color: tokens.textMuted }}>No receipts attached.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {receipts.map((receipt) => (
                <button
                  key={receipt.id}
                  type="button"
                  onClick={() => { void openReceipt(receipt) }}
                  disabled={openingId === receipt.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '9px 12px', borderRadius: 12,
                    background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)', textAlign: 'left',
                    cursor: openingId === receipt.id ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {receipt.original_name}
                  </span>
                  <span style={{ flex: 'none', fontSize: 11.5, color: tokens.accentLight, fontWeight: 700 }}>
                    {openingId === receipt.id ? 'Opening…' : 'Open'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => onEdit(expense)}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: tokens.textPrimary, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(expense)}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: tokens.danger, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  )
}
