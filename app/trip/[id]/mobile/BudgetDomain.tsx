'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { showToast } from '@/components/ui/toast'
import type { Expense, ExpenseCategory, Trip, TripMember } from '@/types'
import { CURRENCY_SYMBOLS, EXPENSE_CATEGORIES } from '@/types'
import { ACCENT, ACCENT_DARK, ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL, RetryCard } from './domain-ui'
import { calculateEqualSplitSettlement, MISSING_PAYER_ID } from './budget-settlement'

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
}

// Session-lifetime cache preserves the original instant tab re-entry behavior.
const expenseCache = new Map<string, Expense[]>()

export function BudgetDomain({ trip, members, currentUserId, canEdit }: BudgetDomainProps) {
  const [expenses, setExpenses] = useState<Expense[]>(() => expenseCache.get(trip.id) ?? [])
  const [loading, setLoading] = useState(() => !expenseCache.has(trip.id))
  const [error, setError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const updateExpenses = useCallback((update: (previous: Expense[]) => Expense[]) => {
    setExpenses((previous) => {
      const next = update(previous)
      expenseCache.set(trip.id, next)
      return next
    })
  }, [trip.id])

  const refreshExpenses = useCallback(async (surfaceError = false) => {
    const { data, error: loadError } = await createClient()
      .from('expenses')
      .select('*')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false })
    if (data) updateExpenses(() => data as Expense[])
    else if (loadError && surfaceError) {
      setError(true)
      showToast("Couldn't load expenses.", 'error', { label: 'Retry', onClick: () => setReloadToken((token) => token + 1) })
    }
    return { data, loadError }
  }, [trip.id, updateExpenses])

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

  useTripRealtimeTable<Expense & Record<string, unknown>>(
    'expenses',
    useCallback((change) => {
      const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<Expense>
      if (!row.id) return
      updateExpenses((previous) => {
        if (change.eventType === 'DELETE') return previous.filter((expense) => expense.id !== row.id)
        const existing = previous.find((expense) => expense.id === row.id)
        const next = existing
          ? previous.map((expense) => expense.id === row.id ? { ...expense, ...row } as Expense : expense)
          : [row as Expense, ...previous]
        return next.sort((a, b) => b.created_at.localeCompare(a.created_at))
      })
    }, [updateExpenses]),
    useCallback(() => { void refreshExpenses(false) }, [refreshExpenses]),
  )

  const handleAdd = useCallback(async (category: ExpenseCategory, description: string, amount: number, paidBy: string) => {
    if (!canEdit) return
    const { data, error: saveError } = await createClient()
      .from('expenses')
      .insert({ trip_id: trip.id, category, amount, description: description || null, paid_by: paidBy || currentUserId })
      .select()
      .single()
    if (!saveError && data) updateExpenses((previous) => {
      const row = data as Expense
      return previous.some((expense) => expense.id === row.id)
        ? previous.map((expense) => expense.id === row.id ? row : expense)
        : [row, ...previous]
    })
    else showToast("Couldn't save the expense.", 'error')
  }, [trip.id, currentUserId, canEdit, updateExpenses])

  const handleDelete = useCallback(async (id: string) => {
    if (!canEdit) return
    const { error: deleteError } = await createClient().from('expenses').delete().eq('id', id)
    if (!deleteError) updateExpenses((previous) => previous.filter((expense) => expense.id !== id))
    else showToast("Couldn't delete the expense.", 'error')
  }, [canEdit, updateExpenses])

  return (
    <BudgetView
      trip={trip}
      expenses={expenses}
      loading={loading}
      error={error}
      onRetry={() => setReloadToken((token) => token + 1)}
      members={members}
      currentUserId={currentUserId}
      onAdd={handleAdd}
      onDelete={handleDelete}
      canEdit={canEdit}
    />
  )
}

function BudgetView({
  trip, expenses, loading, error, onRetry, members, currentUserId, onAdd, onDelete, canEdit,
}: {
  trip: Trip
  expenses: Expense[]
  loading: boolean
  error: boolean
  onRetry: () => void
  members: TripMember[]
  currentUserId: string
  onAdd: (category: ExpenseCategory, description: string, amount: number, paidBy: string) => Promise<void>
  onDelete: (id: string) => void
  canEdit: boolean
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [draftDesc, setDraftDesc] = useState<Record<string, string>>({})
  const [draftAmount, setDraftAmount] = useState<Record<string, string>>({})
  const [draftPayer, setDraftPayer] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  // Detects which category a newly-added expense belongs to (by diffing ids,
  // not by hooking submitExpense) so the ring pulses no matter where the
  // expense came from. Cleared after the pulse has had time to play.
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
  const defaultPayerId = activeMemberById.has(currentUserId)
    ? currentUserId
    : (activeMembers[0]?.user_id ?? currentUserId)

  const sym = CURRENCY_SYMBOLS[trip.currency ?? 'USD'] ?? '$'
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const total = trip.total_budget || 0
  const remaining = total - spent
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
  const overBudget = total > 0 && remaining < 0

  const settlement = calculateEqualSplitSettlement(
    activeMembers.map((member) => ({ id: member.user_id })),
    expenses,
  )
  const balancesById = new Map(settlement.balances.map((balance) => [balance.memberId, balance]))
  const displayedBalances = [
    ...activeMembers.map((member) => balancesById.get(member.user_id)).filter((balance) => balance !== undefined),
    ...settlement.balances.filter((balance) => !balance.isActiveMember),
  ]
  const isSettled = settlement.balances.every((balance) => balance.netMinor === 0)

  const submitExpense = async (cat: ExpenseCategory) => {
    const amountRaw = parseFloat(draftAmount[cat] ?? '')
    if (!amountRaw || amountRaw <= 0) return
    setSubmitting(cat)
    await onAdd(cat, (draftDesc[cat] ?? '').trim(), amountRaw, draftPayer[cat] ?? defaultPayerId)
    setDraftDesc((d) => ({ ...d, [cat]: '' }))
    setDraftAmount((d) => ({ ...d, [cat]: '' }))
    setSubmitting(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14 }}>
      <div style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em' }}>Trip Budget</div>
            <div style={{ fontSize: 12, color: 'rgba(215,215,255,.6)', marginTop: 2, fontWeight: 500 }}>
              {sym}{formatMoney(spent)} of {sym}{formatMoney(total)} spent
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT_LIGHT }}>
            {total > 0 ? `${pct}%` : '—'}
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: `linear-gradient(90deg, ${ACCENT_DARK}, ${ACCENT_LIGHT})`, transition: 'width .3s ease' }} />
        </div>
        {total > 0 && overBudget ? (
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
          <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'rgba(215,215,255,.6)' }}>
            {total <= 0 ? 'No budget set for this trip' : `${sym}${formatMoney(remaining)} remaining`}
          </div>
        )}
      </div>

      {error && !loading && (
        <RetryCard
          title="Couldn't load expenses"
          hint="Your budget summary is shown, but the expense list didn't come through."
          onRetry={onRetry}
        />
      )}

      {activeMembers.length > 0 && !loading && !error && (
        <div style={{ background: GLASS_FILL, border: `1px solid ${isSettled ? GLASS_BORDER : 'rgba(245,166,35,.3)'}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(215,215,255,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Equal split · {activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
            {displayedBalances.map((balance) => (
              <div key={balance.memberId} style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '3px 8px', fontSize: 12 }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: balance.isActiveMember ? 'rgba(255,255,255,.92)' : 'rgba(215,215,255,.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {payerName(balance.memberId)}
                </span>
                <span style={{ minWidth: 58, textAlign: 'right', fontWeight: 800, color: balance.netMinor === 0 ? '#4ade80' : balance.netMinor > 0 ? '#86efac' : ACCENT_LIGHT }}>
                  {balance.netMinor > 0 ? '+' : balance.netMinor < 0 ? '−' : ''}{sym}{formatMoney(Math.abs(balance.netMinor) / 100)}
                </span>
                <span style={{ width: '100%', color: 'rgba(215,215,255,.55)' }}>
                  paid {sym}{formatMoney(balance.paidMinor / 100)} · share {sym}{formatMoney(balance.shareMinor / 100)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 12.5, fontWeight: 700, color: isSettled ? '#4ade80' : ACCENT_LIGHT }}>
            {settlement.transfers.length === 0
              ? 'All settled up'
              : settlement.transfers.map((transfer) => (
                <div key={`${transfer.fromMemberId}-${transfer.toMemberId}`} style={{ marginTop: 3 }}>
                  {payerName(transfer.fromMemberId)} pays {payerName(transfer.toMemberId)} {sym}{formatMoney(transfer.amountMinor / 100)}
                </div>
              ))}
          </div>
        </div>
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
                <div style={{ fontSize: 11.5, color: 'rgba(215,215,255,.55)', fontWeight: 500, marginTop: 1 }}>
                  {list.length} {list.length === 1 ? 'expense' : 'expenses'}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.9)', flex: 'none' }}>{sym}{formatMoney(catSpent)}</div>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,.035)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.description || label}
                    </span>
                    {(() => {
                      const itemPayerId = item.paid_by || MISSING_PAYER_ID
                      const itemPayerName = payerName(itemPayerId)
                      const payerMember = activeMemberById.get(itemPayerId)
                      return (
                        <span
                          title={`Paid by ${itemPayerName === 'You' ? 'you' : itemPayerName}`}
                          style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 800, color: '#fff', background: itemPayerId === currentUserId ? 'linear-gradient(135deg,#f5a623,#e8821a)' : payerMember ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(148,163,184,.55)' }}
                        >
                          {itemPayerId === currentUserId ? 'ME' : payerMember ? memberName(payerMember, currentUserId)[0]?.toUpperCase() : '?'}
                        </span>
                      )
                    })()}
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT_LIGHT, flex: 'none' }}>{sym}{formatMoney(Number(item.amount))}</span>
                    {canEdit && <button
                      onClick={() => onDelete(item.id)}
                      aria-label={`Delete ${item.description}`}
                      style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(215,215,255,.35)' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>}
                  </div>
                ))}
                {canEdit && activeMembers.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 11.5, color: 'rgba(215,215,255,.55)', fontWeight: 600 }}>Paid by</span>
                    {activeMembers.map((member) => {
                      const active = (draftPayer[cat] ?? defaultPayerId) === member.user_id
                      return (
                        <button
                          key={member.user_id}
                          onClick={() => setDraftPayer((d) => ({ ...d, [cat]: member.user_id }))}
                          aria-pressed={active}
                          style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: active ? 'rgba(245,166,35,.18)' : 'rgba(255,255,255,.05)', border: `1px solid ${active ? 'rgba(245,166,35,.45)' : 'rgba(255,255,255,.1)'}`, color: active ? ACCENT_LIGHT : 'rgba(215,215,255,.7)' }}
                        >
                          {member.user_id === currentUserId ? 'Me' : memberName(member, currentUserId)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {canEdit && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    aria-label={`${label} expense description`}
                    value={draftDesc[cat] ?? ''}
                    onChange={(e) => setDraftDesc((d) => ({ ...d, [cat]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitExpense(cat) }}
                    placeholder="Description"
                    style={{ flex: 1.4, minWidth: 0, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <input
                    aria-label={`${label} expense amount in ${trip.currency ?? 'USD'}`}
                    value={draftAmount[cat] ?? ''}
                    onChange={(e) => setDraftAmount((d) => ({ ...d, [cat]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitExpense(cat) }}
                    placeholder={`${sym}0`}
                    inputMode="decimal"
                    style={{ width: 70, flex: 'none', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 10px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    aria-label={`Add ${label} expense`}
                    onClick={() => submitExpense(cat)}
                    disabled={submitting === cat}
                    style={{ width: 44, height: 44, borderRadius: 10, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: submitting === cat ? 'default' : 'pointer', opacity: submitting === cat ? 0.5 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>}
                {!canEdit && list.length === 0 && (
                  <div style={{ padding: '4px 2px', fontSize: 12.5, color: 'rgba(215,215,255,.5)' }}>No expenses in this category yet.</div>
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

// ─── Journal ────────────────────────────────────────────────────────────────
