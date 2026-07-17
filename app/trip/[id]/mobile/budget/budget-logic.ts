import type { Expense, ExpenseCategory } from '@/types'

/**
 * Pure, non-arithmetic helpers for the Budget tab's expense list — grouping,
 * filtering, sorting. Money math (splits, settlement) lives in
 * ../budget-settlement.ts; this file has no dependency on it so the two stay
 * independently testable.
 */

export type ExpenseSortOrder = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

export interface ExpenseDateGroup {
  date: string
  expenses: Expense[]
}

/** Groups by expense_date (falls back to created_at's date for pre-migration rows), most recent day first. */
export function groupExpensesByDate(expenses: Expense[]): ExpenseDateGroup[] {
  const groups = new Map<string, Expense[]>()
  for (const expense of expenses) {
    const date = expense.expense_date || expense.created_at.slice(0, 10)
    const bucket = groups.get(date)
    if (bucket) bucket.push(expense)
    else groups.set(date, [expense])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, expenses: list }))
}

export function sortExpenses(expenses: Expense[], order: ExpenseSortOrder): Expense[] {
  const sorted = [...expenses]
  switch (order) {
    case 'date-desc':
      return sorted.sort((a, b) => (b.expense_date || b.created_at).localeCompare(a.expense_date || a.created_at))
    case 'date-asc':
      return sorted.sort((a, b) => (a.expense_date || a.created_at).localeCompare(b.expense_date || b.created_at))
    case 'amount-desc':
      return sorted.sort((a, b) => Number(b.amount) - Number(a.amount))
    case 'amount-asc':
      return sorted.sort((a, b) => Number(a.amount) - Number(b.amount))
  }
}

export interface ExpenseFilter {
  category?: ExpenseCategory | 'all'
  payerId?: string | 'all'
  search?: string
}

/** Category chip + payer filter + free-text search over description. */
export function filterExpenses(expenses: Expense[], filter: ExpenseFilter): Expense[] {
  const query = filter.search?.trim().toLowerCase() ?? ''
  return expenses.filter((expense) => {
    if (filter.category && filter.category !== 'all' && expense.category !== filter.category) return false
    if (filter.payerId && filter.payerId !== 'all' && (expense.paid_by ?? '') !== filter.payerId) return false
    if (query && !(expense.description ?? '').toLowerCase().includes(query)) return false
    return true
  })
}
