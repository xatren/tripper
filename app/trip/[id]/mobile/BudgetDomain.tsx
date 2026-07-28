'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { showToast } from '@/components/ui/toast'
import type { Expense, ExpenseCategory, ItineraryItem, Settlement, Trip, TripMember } from '@/types'
import { CURRENCY_SYMBOLS, EXPENSE_CATEGORIES } from '@/types'
import { ACCENT, ACCENT_DARK, ACCENT_GRADIENT, ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL, RetryCard } from './domain-ui'
import { DUSK } from '@/components/design/tokens'
import { calculateSettlementWithSplits, MISSING_PAYER_ID } from './budget-settlement'
import { AddExpenseSheet, draftFromExpense, emptyExpenseDraft, type ExpenseDraft } from './budget/AddExpenseSheet'
import { SettlementScreen } from './budget/SettlementScreen'
import { ExpenseDetailSheet } from './budget/ExpenseDetailSheet'
import { RECEIPTS_BUCKET } from './budget/expense-receipts-logic'

const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, (color: string) => ReactNode> = {
  fuel: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M4 11h8" />
      <path d="M14 8.5l3 2v6.5a1.5 1.5 0 0 0 3 0V11l-2.5-2.5" />
    </svg>
  ),
  food: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2.5v8a2 2 0 0 0 4 0v-8M9 2.5v19M17 2.5c-1.7 0-3 2-3 5s1.3 5 3 5v9" />
    </svg>
  ),
  lodging: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 19V6M3 15h18v4M8 15v-3a2 2 0 0 1 2-2h8a4 4 0 0 1 4 4v1" />
      <circle cx="7.5" cy="10" r="1.5" />
    </svg>
  ),
  activities: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5l2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 16.9l-5.7 3.2 1.2-6.4-4.7-4.5 6.4-.8z" />
    </svg>
  ),
  transport: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
      <path d="M3 16h18v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18h-11v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <circle cx="7.5" cy="16" r="1.3" />
      <circle cx="16.5" cy="16" r="1.3" />
    </svg>
  ),
  other: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2.4" />
      <path d="M16 12h2.5" />
      <path d="M3 9.5h18" />
    </svg>
  ),
}

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function memberName(member: TripMember, currentUserId: string) {
  if (member.user_id === currentUserId) return 'You'
  const profile = member.profile
  return profile?.display_name?.trim()
    || profile?.email?.split('@')[0]
    || 'Trip member'
}

function formerPayerName(payerId: string) {
  if (payerId === MISSING_PAYER_ID) return 'Unknown payer'
  return `Former member · ${payerId.slice(0, 4)}`
}

export interface BudgetDomainProps {
  trip: Trip
  members: TripMember[]
  currentUserId: string
  canEdit: boolean
  itineraryItems?: ItineraryItem[]
  itineraryEnabled?: boolean
}

// Session-lifetime caches preserve the original instant tab re-entry behavior.
const expenseCache = new Map<string, Expense[]>()
const settlementCache = new Map<string, Settlement[]>()

export function BudgetDomain({ trip, members, currentUserId, canEdit, itineraryItems = [], itineraryEnabled = false }: BudgetDomainProps) {
  const [expenses, setExpenses] = useState<Expense[]>(() => expenseCache.get(trip.id) ?? [])
  const [settlements, setSettlements] = useState<Settlement[]>(() => settlementCache.get(trip.id) ?? [])
  const [loading, setLoading] = useState(() => !expenseCache.has(trip.id))
  const [error, setError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null)
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null)
  const [settlementOpen, setSettlementOpen] = useState(false)

  const updateExpenses = useCallback((update: (previous: Expense[]) => Expense[]) => {
    setExpenses((previous) => {
      const next = update(previous)
      expenseCache.set(trip.id, next)
      return next
    })
  }, [trip.id])

  const updateSettlements = useCallback((update: (previous: Settlement[]) => Settlement[]) => {
    setSettlements((previous) => {
      const next = update(previous)
      settlementCache.set(trip.id, next)
      return next
    })
  }, [trip.id])

  const refreshExpenses = useCallback(async (surfaceError = false) => {
    const { data, error: loadError } = await createClient()
      .from('expenses')
      .select('*, expense_splits(*)')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false })
    if (data) updateExpenses(() => data as Expense[])
    else if (loadError && surfaceError) {
      setError(true)
      showToast("Couldn't load expenses.", 'error', { label: 'Retry', onClick: () => setReloadToken((token) => token + 1) })
    }
    return { data, loadError }
  }, [trip.id, updateExpenses])

  const refreshSettlements = useCallback(async () => {
    const { data } = await createClient().from('settlements').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false })
    if (data) updateSettlements(() => data as Settlement[])
  }, [trip.id, updateSettlements])

  useEffect(() => {
    if (reloadToken === 0 && expenseCache.has(trip.id)) return
    let cancelled = false
    setLoading(true)
    setError(false)
    refreshExpenses(true).then(({ data, loadError }) => {
        if (cancelled) return
        if (data) setError(false)
        else if (loadError) {
          setError(true)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshExpenses, trip.id, reloadToken])

  useEffect(() => { void refreshSettlements() }, [refreshSettlements])

  useTripRealtimeTable<Expense & Record<string, unknown>>(
    'expenses',
    useCallback((change) => {
      const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<Expense>
      if (!row.id) return
      updateExpenses((previous) => {
        if (change.eventType === 'DELETE') return previous.filter((expense) => expense.id !== row.id)
        const existing = previous.find((expense) => expense.id === row.id)
        // Postgres-changes payloads never carry nested embeds — keep whatever
        // expense_splits are already loaded instead of dropping them.
        const merged = { ...(existing ?? {}), ...row, expense_splits: existing?.expense_splits ?? [] } as Expense
        const next = existing
          ? previous.map((expense) => expense.id === row.id ? merged : expense)
          : [merged, ...previous]
        return next.sort((a, b) => b.created_at.localeCompare(a.created_at))
      })
    }, [updateExpenses]),
    useCallback(() => { void refreshExpenses(false) }, [refreshExpenses]),
  )

  // expense_splits changes never arrive as nested embeds in the payload, so
  // any change to this table just triggers a full refetch of the parent list.
  useTripRealtimeTable<Record<string, unknown>>(
    'expense_splits',
    useCallback(() => { void refreshExpenses(false) }, [refreshExpenses]),
    useCallback(() => { void refreshExpenses(false) }, [refreshExpenses]),
  )
  useTripRealtimeTable<Settlement & Record<string, unknown>>(
    'settlements',
    useCallback(() => { void refreshSettlements() }, [refreshSettlements]),
    useCallback(() => { void refreshSettlements() }, [refreshSettlements]),
  )

  const handleDelete = useCallback(async (expense: Expense) => {
    if (!canEdit) return
    const supabase = createClient()
    const { data: receiptRows } = await supabase.from('expense_receipts').select('storage_path').eq('expense_id', expense.id)
    const paths = (receiptRows ?? []).map((row) => row.storage_path)
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(RECEIPTS_BUCKET).remove(paths)
      if (storageError) {
        showToast("Couldn't remove the expense's receipts, so it was kept. Retry is safe.", 'error')
        return
      }
    }
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (!deleteError) {
      updateExpenses((previous) => previous.filter((item) => item.id !== expense.id))
      setDetailExpense(null)
    } else {
      showToast("Couldn't delete the expense.", 'error')
    }
  }, [canEdit, updateExpenses])

  const openAdd = useCallback((category?: ExpenseCategory) => {
    const draft = emptyExpenseDraft(currentUserId, members.map((member) => member.user_id))
    setExpenseDraft(category ? { ...draft, category } : draft)
  }, [currentUserId, members])

  const openEdit = useCallback((expense: Expense) => {
    setDetailExpense(null)
    setExpenseDraft(draftFromExpense(expense, members.map((member) => member.user_id)))
  }, [members])

  return (
    <>
      <BudgetView
        trip={trip}
        expenses={expenses}
        settlements={settlements}
        loading={loading}
        error={error}
        onRetry={() => setReloadToken((token) => token + 1)}
        members={members}
        currentUserId={currentUserId}
        canEdit={canEdit}
        onAddExpense={openAdd}
        onOpenExpense={setDetailExpense}
        onOpenSettlement={() => setSettlementOpen(true)}
      />
      {expenseDraft && (
        <AddExpenseSheet
          trip={trip}
          members={members}
          currentUserId={currentUserId}
          draft={expenseDraft}
          itineraryItems={itineraryEnabled ? itineraryItems : []}
          onClose={() => setExpenseDraft(null)}
          onSaved={() => { void refreshExpenses(false) }}
        />
      )}
      <ExpenseDetailSheet
        expense={detailExpense}
        members={members}
        currentUserId={currentUserId}
        currency={trip.currency ?? 'USD'}
        canEdit={canEdit}
        onClose={() => setDetailExpense(null)}
        onEdit={openEdit}
        onDelete={(expense) => { void handleDelete(expense) }}
      />
      {settlementOpen && (
        <SettlementScreen
          trip={trip}
          members={members}
          expenses={expenses}
          currentUserId={currentUserId}
          canEdit={canEdit}
          onClose={() => setSettlementOpen(false)}
        />
      )}
    </>
  )
}

function BudgetView({
  trip, expenses, settlements, loading, error, onRetry, members, currentUserId, canEdit,
  onAddExpense, onOpenExpense, onOpenSettlement,
}: {
  trip: Trip
  expenses: Expense[]
  settlements: Settlement[]
  loading: boolean
  error: boolean
  onRetry: () => void
  members: TripMember[]
  currentUserId: string
  canEdit: boolean
  onAddExpense: (category?: ExpenseCategory) => void
  onOpenExpense: (expense: Expense) => void
  onOpenSettlement: () => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Detects which category a newly-added expense belongs to (by diffing ids)
  // so the ring pulses no matter where the expense came from (AddExpenseSheet
  // or another collaborator via realtime). Cleared after the pulse plays.
  const [justUpdatedCat, setJustUpdatedCat] = useState<string | null>(null)
  const prevExpenseIdsRef = useRef<Set<string>>(new Set(expenses.map((e) => e.id)))
  useEffect(() => {
    const prevIds = prevExpenseIdsRef.current
    const added = expenses.find((e) => !prevIds.has(e.id))
    prevExpenseIdsRef.current = new Set(expenses.map((e) => e.id))
    if (added) {
      setJustUpdatedCat(added.category)
      const t = setTimeout(() => setJustUpdatedCat(null), 900)
      return () => clearTimeout(t)
    }
  }, [expenses])

  const activeMembers = [...members].sort((a, b) => {
    if (a.user_id === currentUserId) return -1
    if (b.user_id === currentUserId) return 1
    return memberName(a, currentUserId).localeCompare(memberName(b, currentUserId))
      || a.user_id.localeCompare(b.user_id)
  })
  const activeMemberById = new Map(activeMembers.map((member) => [member.user_id, member]))
  const payerName = (payerId: string) => {
    const member = activeMemberById.get(payerId)
    return member ? memberName(member, currentUserId) : formerPayerName(payerId)
  }

  const sym = CURRENCY_SYMBOLS[trip.currency ?? 'USD'] ?? '$'
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const total = trip.total_budget || 0
  const remaining = total - spent
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
  const overBudget = total > 0 && remaining < 0
  // The expense list failed to load, so `spent`/`remaining` are derived from an
  // empty array and would misrepresent the trip as having no spend at all.
  const dataUnavailable = error && !loading

  const settledPayments = settlements.filter((s) => s.status === 'settled')
  const settlement = calculateSettlementWithSplits(
    activeMembers.map((member) => ({ id: member.user_id })),
    expenses,
    settledPayments.map((s) => ({ from_member: s.from_member, to_member: s.to_member, amount_minor: s.amount_minor, status: s.status })),
  )
  const balancesById = new Map(settlement.balances.map((balance) => [balance.memberId, balance]))
  const displayedBalances = [
    ...activeMembers.map((member) => balancesById.get(member.user_id)).filter((balance) => balance !== undefined),
    ...settlement.balances.filter((balance) => !balance.isActiveMember),
  ]
  const isSettled = settlement.balances.every((balance) => balance.netMinor === 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14 }}>
      <div style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em' }}>Trip Budget</div>
            <div style={{ fontSize: 12, color: DUSK.textMuted, marginTop: 2, fontWeight: 500 }}>
              {dataUnavailable ? 'Spend data unavailable' : `${sym}${formatMoney(spent)} of ${sym}${formatMoney(total)} spent`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT_LIGHT }}>
              {dataUnavailable ? '—' : total > 0 ? `${pct}%` : '—'}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => onAddExpense()}
                aria-label="Add expense"
                style={{ width: 36, height: 36, borderRadius: 12, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            )}
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: dataUnavailable ? '0%' : `${pct}%`, borderRadius: 999, background: `linear-gradient(90deg, ${ACCENT_DARK}, ${ACCENT_LIGHT})`, transition: 'width .3s ease' }} />
        </div>
        {dataUnavailable ? null : total > 0 && overBudget ? (
          <button
            type="button"
            onClick={() => setExpanded(Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, true])))}
            style={{
              marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 12, background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.4)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT_LIGHT }}>
              Budget needs attention · {sym}{formatMoney(Math.abs(remaining))} over
            </span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
              <path d="M6 4L10 8L6 12" stroke={ACCENT_LIGHT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: DUSK.textMuted }}>
            {total <= 0 ? 'No budget set for this trip' : `${sym}${formatMoney(remaining)} remaining`}
          </div>
        )}
      </div>

      {error && !loading && (
        <RetryCard
          title="Couldn't load expenses"
          hint="Your budget summary and expense list didn't come through."
          onRetry={onRetry}
        />
      )}

      {activeMembers.length > 0 && !loading && !error && (
        <button
          type="button"
          onClick={onOpenSettlement}
          style={{
            textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
            background: GLASS_FILL, border: `1px solid ${isSettled ? GLASS_BORDER : 'rgba(245,166,35,.3)'}`, borderRadius: 20, padding: 16,
            backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: DUSK.textMuted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Settlement · {activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT_LIGHT }}>Settle up →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
            {displayedBalances.map((balance) => (
              <div key={balance.memberId} style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '3px 8px', fontSize: 12 }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: balance.isActiveMember ? DUSK.textPrimary : DUSK.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {payerName(balance.memberId)}
                </span>
                <span style={{ minWidth: 58, textAlign: 'right', fontWeight: 800, color: balance.netMinor === 0 ? '#4ade80' : balance.netMinor > 0 ? '#86efac' : ACCENT_LIGHT }}>
                  {balance.netMinor > 0 ? '+' : balance.netMinor < 0 ? '−' : ''}{sym}{formatMoney(Math.abs(balance.netMinor) / 100)}
                </span>
                <span style={{ width: '100%', color: DUSK.textMuted }}>
                  paid {sym}{formatMoney(balance.paidMinor / 100)} · share {sym}{formatMoney(balance.shareMinor / 100)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 12.5, fontWeight: 700, color: isSettled ? '#4ade80' : ACCENT_LIGHT }}>
            {settlement.transfers.length === 0
              ? 'All settled up'
              : settlement.transfers.slice(0, 3).map((transfer) => (
                <div key={`${transfer.fromMemberId}-${transfer.toMemberId}`} style={{ marginTop: 3 }}>
                  {payerName(transfer.fromMemberId)} pays {payerName(transfer.toMemberId)} {sym}{formatMoney(transfer.amountMinor / 100)}
                </div>
              ))}
          </div>
        </button>
      )}

      {loading &&
        [0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ height: 66, borderRadius: 20, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, animation: 'pulseglow 1.6s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}
          />
        ))}

      {!loading && !error && EXPENSE_CATEGORIES.map(({ value: cat, label }) => {
        const list = expenses.filter((e) => e.category === cat)
        const catSpent = list.reduce((sum, e) => sum + Number(e.amount), 0)
        const isOpen = !!expanded[cat]
        // Ring shows this category's share of the trip's total budget; pulses
        // briefly whenever a new expense in this category lands.
        const catPct = total > 0 ? Math.min(100, (catSpent / total) * 100) : 0
        const CAT_RING_R = 14
        const catRingCircumference = 2 * Math.PI * CAT_RING_R
        const justUpdated = cat === justUpdatedCat
        return (
          <div key={cat} style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setExpanded((e) => ({ ...e, [cat]: !e[cat] }))}
              aria-expanded={isOpen}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 16, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 12, position: 'relative', flex: 'none' }}>
                <svg width="34" height="34" viewBox="0 0 34 34" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
                  <circle cx="17" cy="17" r={CAT_RING_R} fill="none" stroke={`${ACCENT}1a`} strokeWidth="3" />
                  {total > 0 && (
                    <circle
                      cx="17" cy="17" r={CAT_RING_R} fill="none"
                      stroke={ACCENT_LIGHT} strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={catRingCircumference}
                      strokeDashoffset={catRingCircumference * (1 - catPct / 100)}
                      style={{
                        transformOrigin: '17px 17px',
                        transform: justUpdated ? 'scale(1.18)' : 'scale(1)',
                        transition: 'stroke-dashoffset .6s cubic-bezier(.22,.9,.32,1.2), transform .45s cubic-bezier(.34,1.56,.64,1)',
                      }}
                    />
                  )}
                </svg>
                <span style={{ position: 'absolute', inset: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40` }}>
                  {EXPENSE_CATEGORY_ICONS[cat](ACCENT_LIGHT)}
                </span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11.5, color: DUSK.textMuted, fontWeight: 500, marginTop: 1 }}>
                  {list.length} {list.length === 1 ? 'expense' : 'expenses'}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: DUSK.textPrimary, flex: 'none' }}>{sym}{formatMoney(catSpent)}</div>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M4 6L8 10L12 6" stroke={DUSK.textMuted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((item) => {
                  const itemPayerId = item.paid_by || MISSING_PAYER_ID
                  const itemPayerName = payerName(itemPayerId)
                  const payerMember = activeMemberById.get(itemPayerId)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenExpense(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,.035)', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: DUSK.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.description || label}
                      </span>
                      <span
                        title={`Paid by ${itemPayerName === 'You' ? 'you' : itemPayerName}`}
                        style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 800, color: DUSK.textPrimary, background: itemPayerId === currentUserId ? ACCENT_GRADIENT : payerMember ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(148,163,184,.55)' }}
                      >
                        {itemPayerId === currentUserId ? 'ME' : payerMember ? memberName(payerMember, currentUserId)[0]?.toUpperCase() : '?'}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT_LIGHT, flex: 'none' }}>{sym}{formatMoney(Number(item.amount))}</span>
                    </button>
                  )
                })}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onAddExpense(cat)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 2,
                      borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.2)',
                      color: DUSK.textSecondary, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add expense
                  </button>
                )}
                {!canEdit && list.length === 0 && (
                  <div style={{ padding: '4px 2px', fontSize: 12.5, color: DUSK.textMuted }}>No expenses in this category yet.</div>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div style={{ height: 20 }} />
    </div>
  )
}
