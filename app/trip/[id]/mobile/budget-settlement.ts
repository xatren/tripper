export const MISSING_PAYER_ID = '__missing_payer__'

export interface SettlementMember {
  id: string
}

export interface SettlementExpense {
  amount: number | string
  paid_by: string | null
}

export interface SettlementBalance {
  memberId: string
  isActiveMember: boolean
  paidMinor: number
  shareMinor: number
  netMinor: number
}

export interface SettlementTransfer {
  fromMemberId: string
  toMemberId: string
  amountMinor: number
}

export interface EqualSplitSettlement {
  totalMinor: number
  balances: SettlementBalance[]
  transfers: SettlementTransfer[]
}

/** Converts the database's two-decimal currency amount to integer minor units. */
export function toMinorUnits(amount: number | string): number {
  const parsed = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(parsed)) return 0
  return Math.round((parsed + Math.sign(parsed) * Number.EPSILON) * 100)
}

/**
 * Splits every expense equally across active members. Remainder cents go to
 * members in stable id order, making the result independent of query order.
 * A former or missing payer keeps their credit but receives no active share.
 */
export function calculateEqualSplitSettlement(
  members: SettlementMember[],
  expenses: SettlementExpense[],
): EqualSplitSettlement {
  const memberIds = [...new Set(members.map((member) => member.id))].sort()
  const paidById = new Map<string, number>()
  let totalMinor = 0

  for (const expense of expenses) {
    const amountMinor = toMinorUnits(expense.amount)
    totalMinor += amountMinor
    const payerId = expense.paid_by || MISSING_PAYER_ID
    paidById.set(payerId, (paidById.get(payerId) ?? 0) + amountMinor)
  }

  const baseShare = memberIds.length > 0 ? Math.trunc(totalMinor / memberIds.length) : 0
  const remainder = memberIds.length > 0 ? totalMinor - baseShare * memberIds.length : 0
  const balances: SettlementBalance[] = memberIds.map((memberId, index) => {
    const shareMinor = baseShare + (index < Math.abs(remainder) ? Math.sign(remainder) : 0)
    const paidMinor = paidById.get(memberId) ?? 0
    paidById.delete(memberId)
    return { memberId, isActiveMember: true, paidMinor, shareMinor, netMinor: paidMinor - shareMinor }
  })

  for (const [memberId, paidMinor] of [...paidById].sort(([a], [b]) => a.localeCompare(b))) {
    balances.push({ memberId, isActiveMember: false, paidMinor, shareMinor: 0, netMinor: paidMinor })
  }

  const debtors = balances
    .filter((balance) => balance.netMinor < 0)
    .map((balance) => ({ memberId: balance.memberId, remaining: -balance.netMinor }))
  const creditors = balances
    .filter((balance) => balance.netMinor > 0)
    .map((balance) => ({ memberId: balance.memberId, remaining: balance.netMinor }))
  const transfers: SettlementTransfer[] = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const amountMinor = Math.min(debtor.remaining, creditor.remaining)
    if (amountMinor > 0) {
      transfers.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amountMinor })
      debtor.remaining -= amountMinor
      creditor.remaining -= amountMinor
    }
    if (debtor.remaining === 0) debtorIndex += 1
    if (creditor.remaining === 0) creditorIndex += 1
  }

  return { totalMinor, balances, transfers }
}

// ─── Custom splits & persisted settlements (additive — the function above and
// every type it uses stay unchanged so existing callers/tests are unaffected) ───

export interface ShareResult {
  memberId: string
  shareMinor: number
}

/**
 * Same base-share + deterministic sorted-id-order remainder-cent algorithm as
 * calculateEqualSplitSettlement, extracted standalone for the split editor UI
 * and calculateSettlementWithSplits. A cross-check test asserts equivalence.
 */
export function resolveEqualShares(memberIds: string[], totalMinor: number): ShareResult[] {
  const sorted = [...new Set(memberIds)].sort()
  const n = sorted.length
  if (n === 0) return []
  const baseShare = Math.trunc(totalMinor / n)
  const remainder = totalMinor - baseShare * n
  return sorted.map((memberId, index) => ({
    memberId,
    shareMinor: baseShare + (index < Math.abs(remainder) ? Math.sign(remainder) : 0),
  }))
}

/** No implicit redistribution — the caller must fix amounts until they reconcile. */
export function resolveExactShares(
  participants: { memberId: string; amountMinor: number }[],
  totalMinor: number,
): { ok: true; shares: ShareResult[] } | { ok: false; remainderMinor: number } {
  const sum = participants.reduce((total, p) => total + p.amountMinor, 0)
  if (sum !== totalMinor) return { ok: false, remainderMinor: totalMinor - sum }
  return { ok: true, shares: participants.map((p) => ({ memberId: p.memberId, shareMinor: p.amountMinor })) }
}

/**
 * Requires percentages to sum to exactly 100 (no implicit redistribution),
 * then converts to minor units with the same deterministic remainder-cent
 * rule as resolveEqualShares.
 */
export function resolvePercentageShares(
  participants: { memberId: string; percent: number }[],
  totalMinor: number,
): { ok: true; shares: ShareResult[] } | { ok: false; remainderPercent: number } {
  const PERCENT_EPSILON = 1e-9
  const percentSum = participants.reduce((total, p) => total + p.percent, 0)
  if (Math.abs(percentSum - 100) > PERCENT_EPSILON) {
    return { ok: false, remainderPercent: 100 - percentSum }
  }

  const truncById = new Map(participants.map((p) => [p.memberId, Math.trunc(totalMinor * p.percent / 100)]))
  const truncSum = [...truncById.values()].reduce((total, value) => total + value, 0)
  const remainder = totalMinor - truncSum
  const sortedIds = [...new Set(participants.map((p) => p.memberId))].sort()

  return {
    ok: true,
    shares: sortedIds.map((memberId, index) => ({
      memberId,
      shareMinor: (truncById.get(memberId) ?? 0) + (index < Math.abs(remainder) ? Math.sign(remainder) : 0),
    })),
  }
}

export interface SettlementExpenseSplit {
  member_id: string | null
  share_amount_minor: number
}

export interface SettlementExpenseWithSplits extends SettlementExpense {
  id: string
  expense_splits?: SettlementExpenseSplit[] | null
}

export interface SettlementPayment {
  from_member: string | null
  to_member: string | null
  amount_minor: number
  status: 'settled' | 'reopened'
}

/**
 * Extends calculateEqualSplitSettlement with persisted custom splits.
 * Expenses with no expense_splits rows resolve exactly like the equal-split
 * function above (live equal share across currently active members) — old
 * data behaves identically. Expenses with persisted splits use each
 * participant's stored share_amount_minor directly, even for members who are
 * no longer active, so a departed participant's assigned share remains their
 * personal debt (mirrors how a departed payer is already shown as owed money
 * today, just the debit side). Settled payments net against balances before
 * transfers are derived, so a marked-paid transfer stops showing as owed.
 */
export function calculateSettlementWithSplits(
  members: SettlementMember[],
  expenses: SettlementExpenseWithSplits[],
  payments: SettlementPayment[] = [],
): EqualSplitSettlement {
  const memberIds = [...new Set(members.map((member) => member.id))].sort()
  const paidById = new Map<string, number>()
  const customShareById = new Map<string, number>()
  let noSplitTotalMinor = 0
  let totalMinor = 0

  for (const expense of expenses) {
    const amountMinor = toMinorUnits(expense.amount)
    totalMinor += amountMinor
    const payerId = expense.paid_by || MISSING_PAYER_ID
    paidById.set(payerId, (paidById.get(payerId) ?? 0) + amountMinor)

    const splits = expense.expense_splits ?? []
    if (splits.length > 0) {
      for (const split of splits) {
        const shareId = split.member_id || MISSING_PAYER_ID
        customShareById.set(shareId, (customShareById.get(shareId) ?? 0) + split.share_amount_minor)
      }
    } else {
      noSplitTotalMinor += amountMinor
    }
  }

  const equalShareById = new Map(
    resolveEqualShares(memberIds, noSplitTotalMinor).map((share) => [share.memberId, share.shareMinor]),
  )

  const balances: SettlementBalance[] = memberIds.map((memberId) => {
    const paidMinor = paidById.get(memberId) ?? 0
    paidById.delete(memberId)
    const shareMinor = (equalShareById.get(memberId) ?? 0) + (customShareById.get(memberId) ?? 0)
    customShareById.delete(memberId)
    return { memberId, isActiveMember: true, paidMinor, shareMinor, netMinor: paidMinor - shareMinor }
  })

  const departedIds = new Set([...paidById.keys(), ...customShareById.keys()])
  for (const memberId of [...departedIds].sort()) {
    const paidMinor = paidById.get(memberId) ?? 0
    const shareMinor = customShareById.get(memberId) ?? 0
    balances.push({ memberId, isActiveMember: false, paidMinor, shareMinor, netMinor: paidMinor - shareMinor })
  }

  for (const payment of payments) {
    if (payment.status !== 'settled') continue
    const from = balances.find((balance) => balance.memberId === payment.from_member)
    const to = balances.find((balance) => balance.memberId === payment.to_member)
    if (from) from.netMinor += payment.amount_minor
    if (to) to.netMinor -= payment.amount_minor
  }

  const debtors = balances
    .filter((balance) => balance.netMinor < 0)
    .map((balance) => ({ memberId: balance.memberId, remaining: -balance.netMinor }))
  const creditors = balances
    .filter((balance) => balance.netMinor > 0)
    .map((balance) => ({ memberId: balance.memberId, remaining: balance.netMinor }))
  const transfers: SettlementTransfer[] = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const amountMinor = Math.min(debtor.remaining, creditor.remaining)
    if (amountMinor > 0) {
      transfers.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amountMinor })
      debtor.remaining -= amountMinor
      creditor.remaining -= amountMinor
    }
    if (debtor.remaining === 0) debtorIndex += 1
    if (creditor.remaining === 0) creditorIndex += 1
  }

  return { totalMinor, balances, transfers }
}
