import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateEqualSplitSettlement,
  calculateSettlementWithSplits,
  MISSING_PAYER_ID,
  resolveEqualShares,
  resolveExactShares,
  resolvePercentageShares,
  toMinorUnits,
  type SettlementExpenseWithSplits,
  type SettlementPayment,
} from '../app/trip/[id]/mobile/budget-settlement.ts'

const expense = (amount: number | string, paidBy: string | null) => ({ amount, paid_by: paidBy })
const members = (...ids: string[]) => ids.map((id) => ({ id }))

test('one member pays and owes the full equal share exactly', () => {
  const result = calculateEqualSplitSettlement(members('a'), [expense(12.34, 'a')])

  assert.equal(result.totalMinor, 1234)
  assert.deepEqual(result.balances, [
    { memberId: 'a', isActiveMember: true, paidMinor: 1234, shareMinor: 1234, netMinor: 0 },
  ])
  assert.deepEqual(result.transfers, [])
})

test('two-member result matches the intended 50/50 calculation', () => {
  const result = calculateEqualSplitSettlement(members('a', 'b'), [
    expense(70, 'a'),
    expense(30, 'b'),
  ])

  assert.deepEqual(result.balances.map(({ memberId, paidMinor, shareMinor, netMinor }) => (
    { memberId, paidMinor, shareMinor, netMinor }
  )), [
    { memberId: 'a', paidMinor: 7000, shareMinor: 5000, netMinor: 2000 },
    { memberId: 'b', paidMinor: 3000, shareMinor: 5000, netMinor: -2000 },
  ])
  assert.deepEqual(result.transfers, [
    { fromMemberId: 'b', toMemberId: 'a', amountMinor: 2000 },
  ])
})

test('three members receive equal shares and deterministic settlement', () => {
  const result = calculateEqualSplitSettlement(members('c', 'a', 'b'), [
    expense(60, 'a'),
    expense(30, 'b'),
  ])

  assert.deepEqual(result.balances.map(({ memberId, netMinor }) => ({ memberId, netMinor })), [
    { memberId: 'a', netMinor: 3000 },
    { memberId: 'b', netMinor: 0 },
    { memberId: 'c', netMinor: -3000 },
  ])
  assert.deepEqual(result.transfers, [
    { fromMemberId: 'c', toMemberId: 'a', amountMinor: 3000 },
  ])
})

test('four members settle multiple creditors and debtors exactly', () => {
  const result = calculateEqualSplitSettlement(members('d', 'b', 'a', 'c'), [
    expense(40, 'a'),
    expense(20, 'b'),
  ])

  assert.deepEqual(result.balances.map(({ memberId, netMinor }) => ({ memberId, netMinor })), [
    { memberId: 'a', netMinor: 2500 },
    { memberId: 'b', netMinor: 500 },
    { memberId: 'c', netMinor: -1500 },
    { memberId: 'd', netMinor: -1500 },
  ])
  assert.deepEqual(result.transfers, [
    { fromMemberId: 'c', toMemberId: 'a', amountMinor: 1500 },
    { fromMemberId: 'd', toMemberId: 'a', amountMinor: 1000 },
    { fromMemberId: 'd', toMemberId: 'b', amountMinor: 500 },
  ])
})

test('remainder cents are stable and net balances reconcile to zero', () => {
  const result = calculateEqualSplitSettlement(members('c', 'b', 'a'), [expense(10, 'c')])

  assert.deepEqual(result.balances.map(({ memberId, shareMinor }) => ({ memberId, shareMinor })), [
    { memberId: 'a', shareMinor: 334 },
    { memberId: 'b', shareMinor: 333 },
    { memberId: 'c', shareMinor: 333 },
  ])
  assert.equal(result.balances.reduce((sum, balance) => sum + balance.netMinor, 0), 0)
  assert.equal(toMinorUnits('10.005'), 1001)
})

test('missing and departed payers remain separate credited participants', () => {
  const result = calculateEqualSplitSettlement(members('a', 'b'), [
    expense(6, 'former-user'),
    expense(4, null),
  ])

  assert.deepEqual(result.balances.map(({ memberId, shareMinor, netMinor }) => (
    { memberId, shareMinor, netMinor }
  )), [
    { memberId: 'a', shareMinor: 500, netMinor: -500 },
    { memberId: 'b', shareMinor: 500, netMinor: -500 },
    { memberId: MISSING_PAYER_ID, shareMinor: 0, netMinor: 400 },
    { memberId: 'former-user', shareMinor: 0, netMinor: 600 },
  ])
  assert.equal(result.balances.reduce((sum, balance) => sum + balance.netMinor, 0), 0)
})

// ─── resolveEqualShares ─────────────────────────────────────────────────────

test('resolveEqualShares matches calculateEqualSplitSettlement for the same inputs', () => {
  const ids = ['c', 'a', 'b']
  const totalMinor = 1000
  const shares = resolveEqualShares(ids, totalMinor)
  const legacy = calculateEqualSplitSettlement(members(...ids), [expense(totalMinor / 100, 'a')])

  assert.deepEqual(shares, legacy.balances.map(({ memberId, shareMinor }) => ({ memberId, shareMinor })))
})

test('resolveEqualShares returns nothing for an empty member list', () => {
  assert.deepEqual(resolveEqualShares([], 500), [])
})

// ─── resolveExactShares ─────────────────────────────────────────────────────

test('resolveExactShares accepts amounts that reconcile exactly', () => {
  const result = resolveExactShares([
    { memberId: 'a', amountMinor: 600 },
    { memberId: 'b', amountMinor: 400 },
  ], 1000)

  assert.deepEqual(result, {
    ok: true,
    shares: [{ memberId: 'a', shareMinor: 600 }, { memberId: 'b', shareMinor: 400 }],
  })
})

test('resolveExactShares rejects amounts under the total with the remaining cents', () => {
  const result = resolveExactShares([{ memberId: 'a', amountMinor: 600 }], 1000)
  assert.deepEqual(result, { ok: false, remainderMinor: 400 })
})

test('resolveExactShares rejects amounts over the total with the excess as a negative remainder', () => {
  const result = resolveExactShares([{ memberId: 'a', amountMinor: 1200 }], 1000)
  assert.deepEqual(result, { ok: false, remainderMinor: -200 })
})

// ─── resolvePercentageShares ────────────────────────────────────────────────

test('resolvePercentageShares distributes remainder cents deterministically for a 3-way even split', () => {
  const result = resolvePercentageShares([
    { memberId: 'c', percent: 100 / 3 },
    { memberId: 'b', percent: 100 / 3 },
    { memberId: 'a', percent: 100 / 3 },
  ], 1000)

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.shares, [
    { memberId: 'a', shareMinor: 334 },
    { memberId: 'b', shareMinor: 333 },
    { memberId: 'c', shareMinor: 333 },
  ])
  assert.equal(result.shares.reduce((sum, s) => sum + s.shareMinor, 0), 1000)
})

test('resolvePercentageShares rejects percentages that do not sum to 100', () => {
  const result = resolvePercentageShares([{ memberId: 'a', percent: 60 }, { memberId: 'b', percent: 30 }], 1000)
  assert.deepEqual(result, { ok: false, remainderPercent: 10 })
})

// ─── calculateSettlementWithSplits ──────────────────────────────────────────

const expenseWithSplits = (
  id: string, amount: number, paidBy: string | null, splits: { member_id: string | null; share_amount_minor: number }[] = [],
): SettlementExpenseWithSplits => ({ id, amount, paid_by: paidBy, expense_splits: splits })

test('calculateSettlementWithSplits matches calculateEqualSplitSettlement when no expense has explicit splits', () => {
  const ids = ['d', 'b', 'a', 'c']
  const expenses = [expenseWithSplits('e1', 40, 'a'), expenseWithSplits('e2', 20, 'b')]
  const legacy = calculateEqualSplitSettlement(members(...ids), expenses.map((e) => ({ amount: e.amount, paid_by: e.paid_by })))
  const withSplits = calculateSettlementWithSplits(members(...ids), expenses)

  assert.deepEqual(withSplits, legacy)
})

test('calculateSettlementWithSplits reconciles a custom exact split across active members', () => {
  const result = calculateSettlementWithSplits(members('a', 'b'), [
    expenseWithSplits('e1', 10, 'a', [
      { member_id: 'a', share_amount_minor: 700 },
      { member_id: 'b', share_amount_minor: 300 },
    ]),
  ])

  assert.deepEqual(result.balances.map(({ memberId, paidMinor, shareMinor, netMinor }) => ({ memberId, paidMinor, shareMinor, netMinor })), [
    { memberId: 'a', paidMinor: 1000, shareMinor: 700, netMinor: 300 },
    { memberId: 'b', paidMinor: 0, shareMinor: 300, netMinor: -300 },
  ])
  assert.deepEqual(result.transfers, [{ fromMemberId: 'b', toMemberId: 'a', amountMinor: 300 }])
})

test('a departed participant with an assigned custom-split share carries a genuine debt', () => {
  // 'b' had a fixed share on this expense and has since left the trip.
  const result = calculateSettlementWithSplits(members('a'), [
    expenseWithSplits('e1', 10, 'a', [
      { member_id: 'a', share_amount_minor: 500 },
      { member_id: 'b', share_amount_minor: 500 },
    ]),
  ])

  const departed = result.balances.find((b) => b.memberId === 'b')
  assert.deepEqual(departed, { memberId: 'b', isActiveMember: false, paidMinor: 0, shareMinor: 500, netMinor: -500 })
  assert.deepEqual(result.transfers, [{ fromMemberId: 'b', toMemberId: 'a', amountMinor: 500 }])
})

test('a settled payment nets against the outstanding transfer so it stops showing as owed', () => {
  const expenses = [expenseWithSplits('e1', 20, 'a')]
  const payments: SettlementPayment[] = [{ from_member: 'b', to_member: 'a', amount_minor: 1000, status: 'settled' }]
  const result = calculateSettlementWithSplits(members('a', 'b'), expenses, payments)

  assert.deepEqual(result.transfers, [])
  assert.equal(result.balances.every((b) => b.netMinor === 0), true)
})

test('a reopened payment does not net — the transfer remains outstanding', () => {
  const expenses = [expenseWithSplits('e1', 20, 'a')]
  const payments: SettlementPayment[] = [{ from_member: 'b', to_member: 'a', amount_minor: 1000, status: 'reopened' }]
  const result = calculateSettlementWithSplits(members('a', 'b'), expenses, payments)

  assert.deepEqual(result.transfers, [{ fromMemberId: 'b', toMemberId: 'a', amountMinor: 1000 }])
})
