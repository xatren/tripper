import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterExpenses,
  groupExpensesByDate,
  sortExpenses,
} from '../app/trip/[id]/mobile/budget/budget-logic.ts'

const expense = (id: string, overrides: Partial<{ category: string; amount: number; expense_date: string; created_at: string; paid_by: string | null; description: string | null }> = {}) => ({
  id,
  trip_id: 'trip-1',
  stop_id: null,
  category: overrides.category ?? 'other',
  amount: overrides.amount ?? 10,
  description: overrides.description ?? null,
  paid_by: overrides.paid_by ?? null,
  created_at: overrides.created_at ?? '2026-07-01T10:00:00.000Z',
  split_type: 'equal' as const,
  expense_date: overrides.expense_date ?? '2026-07-01',
  itinerary_item_id: null,
})

test('groupExpensesByDate groups by expense_date, most recent day first', () => {
  const groups = groupExpensesByDate([
    expense('a', { expense_date: '2026-07-01' }),
    expense('b', { expense_date: '2026-07-03' }),
    expense('c', { expense_date: '2026-07-01' }),
  ])

  assert.deepEqual(groups.map((g) => g.date), ['2026-07-03', '2026-07-01'])
  assert.deepEqual(groups.find((g) => g.date === '2026-07-01')?.expenses.map((e) => e.id), ['a', 'c'])
})

test('groupExpensesByDate falls back to created_at date for pre-migration rows with no expense_date', () => {
  const row = expense('a', { expense_date: '' as unknown as string, created_at: '2026-06-15T08:00:00.000Z' })
  const groups = groupExpensesByDate([row])
  assert.equal(groups[0].date, '2026-06-15')
})

test('sortExpenses orders by amount descending', () => {
  const sorted = sortExpenses([
    expense('a', { amount: 5 }),
    expense('b', { amount: 50 }),
    expense('c', { amount: 20 }),
  ], 'amount-desc')
  assert.deepEqual(sorted.map((e) => e.id), ['b', 'c', 'a'])
})

test('sortExpenses orders by date ascending', () => {
  const sorted = sortExpenses([
    expense('a', { expense_date: '2026-07-03' }),
    expense('b', { expense_date: '2026-07-01' }),
  ], 'date-asc')
  assert.deepEqual(sorted.map((e) => e.id), ['b', 'a'])
})

test('filterExpenses applies category, payer, and search filters together', () => {
  const expenses = [
    expense('a', { category: 'food', paid_by: 'u1', description: 'Dinner at the harbor' }),
    expense('b', { category: 'food', paid_by: 'u2', description: 'Lunch' }),
    expense('c', { category: 'fuel', paid_by: 'u1', description: 'Gas' }),
  ]

  assert.deepEqual(filterExpenses(expenses, { category: 'food' }).map((e) => e.id), ['a', 'b'])
  assert.deepEqual(filterExpenses(expenses, { category: 'food', payerId: 'u1' }).map((e) => e.id), ['a'])
  assert.deepEqual(filterExpenses(expenses, { search: 'harbor' }).map((e) => e.id), ['a'])
  assert.deepEqual(filterExpenses(expenses, {}).map((e) => e.id), ['a', 'b', 'c'])
})
