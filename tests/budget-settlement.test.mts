import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateEqualSplitSettlement,
  MISSING_PAYER_ID,
  toMinorUnits,
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
