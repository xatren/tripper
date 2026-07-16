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
