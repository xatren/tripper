/*
 * Data contract for the trip Overview screen. The server page batches these
 * queries; the client keeps the same selects so per-section retries fetch
 * identical shapes. Sections are independent: one failing query degrades that
 * section to `status: 'error'` (never silently to an empty list) while the
 * rest of the screen renders.
 */

export type OverviewSectionStatus = 'ready' | 'error'

export interface OverviewSection<T> {
  status: OverviewSectionStatus
  rows: T[]
}

/** Minimal expense projection: totals + equal-split settlement input. */
export interface OverviewExpense {
  id: string
  amount: number | string
  paid_by: string | null
}

export interface OverviewPackingItem {
  id: string
  category: string
  checked: boolean
}

export interface OverviewJournalEntry {
  id: string
  journal_photos: { id: string }[] | null
}

export interface TripOverviewData {
  expenses: OverviewSection<OverviewExpense>
  packing: OverviewSection<OverviewPackingItem>
  journal: OverviewSection<OverviewJournalEntry>
}

export const OVERVIEW_EXPENSE_SELECT = 'id, amount, paid_by'
export const OVERVIEW_PACKING_SELECT = 'id, category, checked'
export const OVERVIEW_JOURNAL_SELECT = 'id, journal_photos(id)'
