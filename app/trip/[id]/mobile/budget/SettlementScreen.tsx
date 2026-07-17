'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { tokens } from '@/components/mobile'
import { createClient } from '@/lib/supabase/client'
import { useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { showToast } from '@/components/ui/toast'
import { createRandomId } from '@/lib/random-id'
import type { Expense, Settlement, Trip, TripMember } from '@/types'
import { CURRENCY_SYMBOLS } from '@/types'
import { calculateSettlementWithSplits, MISSING_PAYER_ID, type SettlementTransfer } from '../budget-settlement'

function memberName(member: TripMember, currentUserId: string) {
  if (member.user_id === currentUserId) return 'You'
  const profile = member.profile
  return profile?.display_name?.trim() || profile?.email?.split('@')[0] || 'Trip member'
}

interface ConfirmState {
  fromMemberId: string
  toMemberId: string
  amountMinor: number
  idempotencyKey: string
}

export interface SettlementScreenProps {
  trip: Trip
  members: TripMember[]
  expenses: Expense[]
  currentUserId: string
  canEdit: boolean
  onClose: () => void
}

/**
 * Full transfer list + persisted mark-paid/undo history. Any editor/owner, or
 * either party to a specific transfer, may confirm or reopen it (the RPCs
 * re-enforce this server-side — this is presentation only). A fresh
 * idempotency key is minted once per confirm dialog and reused across
 * retries within that dialog, so a double-tap or network retry can't create
 * a duplicate payment (the unique(trip_id, idempotency_key) constraint on
 * settlements is the hard backstop).
 */
export function SettlementScreen({ trip, members, expenses, currentUserId, canEdit, onClose }: SettlementScreenProps) {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const { data } = await createClient().from('settlements').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false })
    if (data) setSettlements(data as Settlement[])
    setLoading(false)
  }, [trip.id])

  useEffect(() => { void refresh() }, [refresh])

  useTripRealtimeTable<Settlement & Record<string, unknown>>(
    'settlements',
    useCallback(() => { void refresh() }, [refresh]),
    useCallback(() => { void refresh() }, [refresh]),
  )

  const sym = CURRENCY_SYMBOLS[trip.currency ?? 'USD'] ?? '$'
  const activeMembers = [...members].sort((a, b) => {
    if (a.user_id === currentUserId) return -1
    if (b.user_id === currentUserId) return 1
    return memberName(a, currentUserId).localeCompare(memberName(b, currentUserId)) || a.user_id.localeCompare(b.user_id)
  })
  const activeMemberById = new Map(activeMembers.map((member) => [member.user_id, member]))
  const nameFor = (id: string) => {
    const member = activeMemberById.get(id)
    if (member) return memberName(member, currentUserId)
    if (id === MISSING_PAYER_ID) return 'Unknown'
    return `Former member · ${id.slice(0, 4)}`
  }
  const canActOn = (fromId: string, toId: string) => canEdit || currentUserId === fromId || currentUserId === toId

  const settledPayments = settlements.filter((s) => s.status === 'settled')
  const settlement = useMemo(() => calculateSettlementWithSplits(
    activeMembers.map((member) => ({ id: member.user_id })),
    expenses,
    settledPayments.map((s) => ({ from_member: s.from_member, to_member: s.to_member, amount_minor: s.amount_minor, status: s.status })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [activeMembers, expenses, settledPayments.length, settlements])

  const openConfirm = (transfer: SettlementTransfer) => {
    setConfirm({ fromMemberId: transfer.fromMemberId, toMemberId: transfer.toMemberId, amountMinor: transfer.amountMinor, idempotencyKey: createRandomId() })
  }

  const confirmPaid = async () => {
    if (!confirm || busy) return
    setBusy(true)
    const { error } = await createClient().rpc('record_settlement_payment', {
      p_trip_id: trip.id,
      p_from_member: confirm.fromMemberId,
      p_to_member: confirm.toMemberId,
      p_amount_minor: confirm.amountMinor,
      p_idempotency_key: confirm.idempotencyKey,
      p_note: null,
    })
    setBusy(false)
    if (error) {
      showToast("Couldn't record the payment. Try again — it's safe to retry.", 'error')
      return
    }
    setConfirm(null)
    showToast('Marked as paid', 'success')
    void refresh()
  }

  const reopen = async (settlementId: string) => {
    if (busy) return
    setBusy(true)
    const { error } = await createClient().rpc('reopen_settlement', { p_settlement_id: settlementId })
    setBusy(false)
    if (error) {
      showToast("Couldn't undo the payment.", 'error')
      return
    }
    showToast('Payment reopened', 'success')
    void refresh()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-title"
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
        <div id="settlement-title" style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.01em' }}>
          Settle up
        </div>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: '16px 16px max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Outstanding transfers
          </div>
          {loading ? (
            <div style={{ fontSize: 12.5, color: tokens.textMuted }}>Loading…</div>
          ) : settlement.transfers.length === 0 ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>All settled up</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {settlement.transfers.map((transfer) => (
                <div
                  key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)' }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
                    {nameFor(transfer.fromMemberId)} pays {nameFor(transfer.toMemberId)}
                  </span>
                  <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 800, color: tokens.accentLight }}>
                    {sym}{(transfer.amountMinor / 100).toFixed(2)}
                  </span>
                  {canActOn(transfer.fromMemberId, transfer.toMemberId) && (
                    <button
                      type="button"
                      onClick={() => openConfirm(transfer)}
                      style={{ flex: 'none', minHeight: 36, padding: '0 12px', borderRadius: 10, background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.35)', color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            History
          </div>
          {settlements.length === 0 ? (
            <div style={{ fontSize: 12.5, color: tokens.textMuted }}>No payments recorded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {settlements.map((entry) => (
                <div
                  key={entry.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', opacity: entry.status === 'reopened' ? 0.6 : 1 }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: tokens.textPrimary }}>
                    {nameFor(entry.from_member ?? MISSING_PAYER_ID)} → {nameFor(entry.to_member ?? MISSING_PAYER_ID)} · {sym}{(entry.amount_minor / 100).toFixed(2)}
                  </span>
                  <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: entry.status === 'settled' ? '#4ade80' : tokens.warning }}>
                    {entry.status === 'settled' ? 'Paid' : 'Reopened'}
                  </span>
                  {entry.status === 'settled' && canActOn(entry.from_member ?? '', entry.to_member ?? '') && (
                    <button
                      type="button"
                      onClick={() => { void reopen(entry.id) }}
                      style={{ flex: 'none', minHeight: 32, padding: '0 10px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,.16)', color: tokens.textSecondary, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Undo
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {confirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-paid-title"
          onClick={() => !busy && setConfirm(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="glass-elevated" style={{ width: '100%', maxWidth: 360, borderRadius: 20, padding: 20 }}>
            <div id="confirm-paid-title" style={{ fontSize: 15, fontWeight: 800, color: tokens.textPrimary, marginBottom: 8 }}>
              Confirm payment
            </div>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>
              {nameFor(confirm.fromMemberId)} pays {nameFor(confirm.toMemberId)} {sym}{(confirm.amountMinor / 100).toFixed(2)}. This can be undone afterward.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={busy}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: tokens.textPrimary, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void confirmPaid() }}
                disabled={busy}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, background: 'rgba(34,197,94,.18)', border: '1px solid rgba(34,197,94,.4)', color: '#4ade80', fontSize: 13.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Saving…' : 'Mark paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
