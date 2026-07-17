/**
 * Pure helpers for the Trip Readiness center (Prep tab).
 *
 * Everything here is UI-free and side-effect-free so readiness math, template
 * idempotency, filtering, ordering, and realtime reconciliation are unit
 * testable (see tests/prep-logic.test.mts).
 */

import type { TripMember } from '@/types'

export type PackingCategoryKey = 'clothing' | 'electronics' | 'documents' | 'toiletries' | 'other'
export type PrepPriority = 'low' | 'normal' | 'high'
export type PackingScope = 'everyone' | 'personal' | 'shared'
export type TripTaskCategory = 'packing' | 'reservation' | 'document' | 'payment' | 'vehicle' | 'custom'
export type PackingFilter = 'all' | 'mine' | 'unassigned' | 'remaining'

export interface PackingItemRow {
  id: string
  trip_id: string
  category: PackingCategoryKey
  label: string
  checked: boolean
  created_by?: string | null
  created_at: string
  /** Columns below exist after migration 20260717040000_trip_readiness. */
  assigned_to?: string | null
  quantity?: number
  priority?: PrepPriority
  due_date?: string | null
  scope?: PackingScope
  completed_by?: string | null
  completed_at?: string | null
  notes?: string | null
  order_index?: number | null
  updated_at?: string
}

export interface TripTaskRow {
  id: string
  trip_id: string
  category: TripTaskCategory
  title: string
  notes: string | null
  done: boolean
  assigned_to: string | null
  priority: PrepPriority
  due_date: string | null
  completed_by: string | null
  completed_at: string | null
  order_index: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Ordering ─────────────────────────────────────────────────────────────────

/**
 * Sort key inside a category. Legacy rows (order_index null) fall back to
 * their creation time in ms, so pre-migration lists keep their order and new
 * explicit indexes interleave predictably with them.
 */
export function packingSortKey(row: Pick<PackingItemRow, 'order_index' | 'created_at'>): number {
  if (typeof row.order_index === 'number' && Number.isFinite(row.order_index)) return row.order_index
  const created = Date.parse(row.created_at)
  return Number.isFinite(created) ? created : 0
}

export function comparePackingRows(
  a: Pick<PackingItemRow, 'order_index' | 'created_at' | 'id'>,
  b: Pick<PackingItemRow, 'order_index' | 'created_at' | 'id'>,
): number {
  const diff = packingSortKey(a) - packingSortKey(b)
  if (diff !== 0) return diff
  const createdDiff = a.created_at.localeCompare(b.created_at)
  if (createdDiff !== 0) return createdDiff
  return a.id.localeCompare(b.id)
}

/** order_index for a row appended to the end of a (sorted or unsorted) list. */
export function nextOrderIndex(rows: Pick<PackingItemRow, 'order_index' | 'created_at'>[], now = Date.now()): number {
  if (rows.length === 0) return now
  return Math.max(now, ...rows.map(packingSortKey)) + 1024
}

const MIN_ORDER_GAP = 1e-6

/**
 * Persistable order_index updates for moving `sorted[fromIndex]` to
 * `toIndex`. Normally a single midpoint write; when neighbor keys are too
 * close to bisect, the whole category is re-spaced.
 */
export function reorderUpdates(
  sorted: Pick<PackingItemRow, 'id' | 'order_index' | 'created_at'>[],
  fromIndex: number,
  toIndex: number,
): { id: string; order_index: number }[] {
  if (
    fromIndex === toIndex
    || fromIndex < 0 || toIndex < 0
    || fromIndex >= sorted.length || toIndex >= sorted.length
  ) return []

  const next = [...sorted]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)

  const before = toIndex > 0 ? packingSortKey(next[toIndex - 1]) : null
  const after = toIndex < next.length - 1 ? packingSortKey(next[toIndex + 1]) : null

  let candidate: number | null = null
  if (before === null && after === null) candidate = packingSortKey(moved)
  else if (before === null) candidate = (after as number) - 1024
  else if (after === null) candidate = before + 1024
  else if (after - before > MIN_ORDER_GAP) candidate = before + (after - before) / 2

  if (candidate !== null) return [{ id: moved.id, order_index: candidate }]

  // Neighbors are too dense — re-space the whole category with wide gaps.
  const base = packingSortKey(next[0])
  return next.map((row, index) => ({ id: row.id, order_index: base + index * 1024 }))
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface TemplateRow {
  category: PackingCategoryKey
  label: string
}

export interface PartitionedTemplate {
  /** Not present in the current list — safe to import. */
  fresh: TemplateRow[]
  /** Already in the list after normalization; import only on explicit opt-in. */
  duplicates: TemplateRow[]
}

/** Case/whitespace-insensitive identity used for duplicate detection. */
export function normalizeItemKey(category: string, label: string): string {
  return `${category}|${label.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

/**
 * Splits a template into rows that are new to the trip and rows that already
 * exist. Import stays idempotent by default (fresh preselected) while still
 * letting a user consciously re-add a duplicate.
 */
export function partitionTemplate(
  template: TemplateRow[],
  existing: Pick<PackingItemRow, 'category' | 'label'>[],
): PartitionedTemplate {
  const existingKeys = new Set(existing.map((item) => normalizeItemKey(item.category, item.label)))
  const seen = new Set<string>()
  const fresh: TemplateRow[] = []
  const duplicates: TemplateRow[] = []
  for (const row of template) {
    const key = normalizeItemKey(row.category, row.label)
    if (existingKeys.has(key) || seen.has(key)) duplicates.push(row)
    else {
      seen.add(key)
      fresh.push(row)
    }
  }
  return { fresh, duplicates }
}

// ── Readiness ────────────────────────────────────────────────────────────────

export type ReadinessSectionKey = 'packing' | 'reservation' | 'document' | 'payment' | 'vehicle' | 'custom'

export interface ReadinessSection {
  key: ReadinessSectionKey
  total: number
  done: number
}

export interface ReadinessSummary {
  /** 0 when there is nothing tracked yet — an empty trip is never "100% ready". */
  percent: number
  totalItems: number
  doneItems: number
  /** Sections that actually contain items; empty sections must not render as complete. */
  activeSections: ReadinessSection[]
}

export function buildReadinessSections(
  packingItems: Pick<PackingItemRow, 'checked'>[],
  tasks: Pick<TripTaskRow, 'category' | 'done'>[],
): ReadinessSection[] {
  const sections = new Map<ReadinessSectionKey, ReadinessSection>(
    (['packing', 'reservation', 'document', 'payment', 'vehicle', 'custom'] as ReadinessSectionKey[])
      .map((key) => [key, { key, total: 0, done: 0 }]),
  )
  const packing = sections.get('packing')!
  for (const item of packingItems) {
    packing.total += 1
    if (item.checked) packing.done += 1
  }
  for (const task of tasks) {
    // 'packing'-category tasks are reserved for future consolidation; count
    // them with the packing section rather than inventing a seventh section.
    const section = sections.get(task.category === 'packing' ? 'packing' : task.category)!
    section.total += 1
    if (task.done) section.done += 1
  }
  return [...sections.values()]
}

export function computeReadiness(sections: ReadinessSection[]): ReadinessSummary {
  let totalItems = 0
  let doneItems = 0
  const activeSections: ReadinessSection[] = []
  for (const section of sections) {
    if (section.total <= 0) continue
    totalItems += section.total
    doneItems += Math.min(section.done, section.total)
    activeSections.push(section)
  }
  return {
    percent: totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100),
    totalItems,
    doneItems,
    activeSections,
  }
}

// ── Filtering ────────────────────────────────────────────────────────────────

export function matchesPackingFilter(
  item: Pick<PackingItemRow, 'assigned_to' | 'checked'>,
  filter: PackingFilter,
  currentUserId: string,
): boolean {
  switch (filter) {
    case 'all': return true
    case 'mine': return item.assigned_to === currentUserId
    case 'unassigned': return !item.assigned_to
    case 'remaining': return !item.checked
  }
}

export function filterPackingItems<T extends Pick<PackingItemRow, 'assigned_to' | 'checked'>>(
  items: T[],
  filter: PackingFilter,
  currentUserId: string,
): T[] {
  if (filter === 'all') return items
  return items.filter((item) => matchesPackingFilter(item, filter, currentUserId))
}

/** `due_date` (YYYY-MM-DD) is overdue strictly before local `today`. */
export function isOverdue(dueDate: string | null | undefined, today: string): boolean {
  if (!dueDate) return false
  return dueDate < today
}

// ── Members / assignment ─────────────────────────────────────────────────────

export interface AssigneeInfo {
  name: string
  /** True when the user is no longer a member of the trip. */
  departed: boolean
}

export function memberDisplayName(member: TripMember, currentUserId: string): string {
  if (member.user_id === currentUserId) return 'You'
  return member.profile?.display_name?.trim()
    || member.profile?.email?.split('@')[0]
    || 'Trip member'
}

/**
 * Resolves an `assigned_to` id against the current member list. Users who
 * left the trip keep their assignment visibly attributed as a former member
 * so the item can be consciously reassigned rather than silently orphaned.
 */
export function assigneeInfo(
  userId: string | null | undefined,
  members: TripMember[],
  currentUserId: string,
): AssigneeInfo | null {
  if (!userId) return null
  const member = members.find((candidate) => candidate.user_id === userId)
  if (!member) return { name: 'Former member', departed: true }
  return { name: memberDisplayName(member, currentUserId), departed: false }
}

export interface BringSummaryEntry {
  /** null bucket = unassigned items. */
  userId: string | null
  name: string
  departed: boolean
  total: number
  packed: number
}

/** "Who brings what": per-assignee totals, assigned buckets first, unassigned last. */
export function whoBringsWhat(
  items: Pick<PackingItemRow, 'assigned_to' | 'checked'>[],
  members: TripMember[],
  currentUserId: string,
): BringSummaryEntry[] {
  const buckets = new Map<string | null, BringSummaryEntry>()
  for (const item of items) {
    const userId = item.assigned_to ?? null
    let bucket = buckets.get(userId)
    if (!bucket) {
      const info = assigneeInfo(userId, members, currentUserId)
      bucket = {
        userId,
        name: info?.name ?? 'Unassigned',
        departed: info?.departed ?? false,
        total: 0,
        packed: 0,
      }
      buckets.set(userId, bucket)
    }
    bucket.total += 1
    if (item.checked) bucket.packed += 1
  }
  return [...buckets.values()].sort((a, b) => {
    if ((a.userId === null) !== (b.userId === null)) return a.userId === null ? 1 : -1
    if (b.total !== a.total) return b.total - a.total
    return a.name.localeCompare(b.name)
  })
}

// ── Realtime reconciliation ──────────────────────────────────────────────────

export interface RealtimeChangeLike<Row> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Partial<Row>
  old: Partial<Row>
}

/**
 * Applies a Postgres-changes event to a local row list. UPDATE merges the
 * partial payload into the existing row (Supabase omits unchanged TOAST
 * columns); INSERT for an already-known id is treated as an update so an
 * optimistic insert followed by its own echo never duplicates.
 */
export function applyRealtimeChange<Row extends { id: string }>(
  rows: Row[],
  change: RealtimeChangeLike<Row>,
): Row[] {
  const payload = change.eventType === 'DELETE' ? change.old : change.new
  const id = payload.id
  if (!id) return rows
  if (change.eventType === 'DELETE') return rows.filter((row) => row.id !== id)
  const existing = rows.find((row) => row.id === id)
  if (existing) return rows.map((row) => (row.id === id ? { ...row, ...payload } : row))
  return [...rows, payload as Row]
}
