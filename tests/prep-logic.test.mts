import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyRealtimeChange,
  assigneeInfo,
  buildReadinessSections,
  comparePackingRows,
  computeReadiness,
  filterPackingItems,
  isOverdue,
  nextOrderIndex,
  normalizeItemKey,
  partitionTemplate,
  reorderUpdates,
  whoBringsWhat,
  type PackingItemRow,
} from '../app/trip/[id]/mobile/prep/prep-logic.ts'

const item = (id: string, overrides: Partial<PackingItemRow> = {}): PackingItemRow => ({
  id,
  trip_id: 'trip-1',
  category: 'clothing',
  label: `Item ${id}`,
  checked: false,
  created_at: '2026-07-01T10:00:00.000Z',
  ...overrides,
})

const member = (userId: string, name?: string) => ({
  trip_id: 'trip-1',
  user_id: userId,
  role: 'editor' as const,
  joined_at: '2026-07-01T00:00:00.000Z',
  profile: name ? { id: userId, email: `${userId}@example.com`, display_name: name } : { id: userId, email: `${userId}@example.com` },
})

// ── Template idempotency ─────────────────────────────────────────────────────

test('normalizeItemKey ignores case and whitespace differences', () => {
  assert.equal(normalizeItemKey('clothing', '  Phone   Charger '), normalizeItemKey('clothing', 'phone charger'))
  assert.notEqual(normalizeItemKey('clothing', 'Socks'), normalizeItemKey('other', 'Socks'))
})

test('partitionTemplate flags rows already on the list as duplicates', () => {
  const template = [
    { category: 'clothing' as const, label: 'T-shirt' },
    { category: 'clothing' as const, label: 'Socks' },
    { category: 'other' as const, label: 'Water bottle' },
  ]
  const existing = [item('a', { category: 'clothing', label: '  t-SHIRT ' })]
  const { fresh, duplicates } = partitionTemplate(template, existing)
  assert.deepEqual(fresh.map((row) => row.label), ['Socks', 'Water bottle'])
  assert.deepEqual(duplicates.map((row) => row.label), ['T-shirt'])
})

test('partitionTemplate is idempotent: importing fresh rows twice yields no fresh rows', () => {
  const template = [
    { category: 'electronics' as const, label: 'Power bank' },
    { category: 'electronics' as const, label: 'Adapter' },
  ]
  const first = partitionTemplate(template, [])
  assert.equal(first.fresh.length, 2)
  const afterImport = first.fresh.map((row, index) => item(`imported-${index}`, { category: row.category, label: row.label }))
  const second = partitionTemplate(template, afterImport)
  assert.equal(second.fresh.length, 0)
  assert.equal(second.duplicates.length, 2)
})

test('partitionTemplate deduplicates repeats inside the template itself', () => {
  const template = [
    { category: 'other' as const, label: 'Snacks' },
    { category: 'other' as const, label: 'snacks' },
  ]
  const { fresh, duplicates } = partitionTemplate(template, [])
  assert.equal(fresh.length, 1)
  assert.equal(duplicates.length, 1)
})

// ── Readiness ────────────────────────────────────────────────────────────────

test('computeReadiness returns 0% (never 100%) for zero items', () => {
  const summary = computeReadiness(buildReadinessSections([], []))
  assert.equal(summary.percent, 0)
  assert.equal(summary.totalItems, 0)
  assert.equal(summary.activeSections.length, 0)
})

test('computeReadiness reflects partial progress across packing and tasks', () => {
  const packing = [item('a', { checked: true }), item('b')]
  const tasks = [
    { category: 'document' as const, done: true },
    { category: 'vehicle' as const, done: false },
  ]
  const summary = computeReadiness(buildReadinessSections(packing, tasks))
  assert.equal(summary.totalItems, 4)
  assert.equal(summary.doneItems, 2)
  assert.equal(summary.percent, 50)
  assert.deepEqual(summary.activeSections.map((section) => section.key).sort(), ['document', 'packing', 'vehicle'])
})

test('computeReadiness reaches 100% only when every tracked item is done', () => {
  const packing = [item('a', { checked: true })]
  const tasks = [{ category: 'payment' as const, done: true }]
  assert.equal(computeReadiness(buildReadinessSections(packing, tasks)).percent, 100)
})

test('empty sections are excluded so they can never render as complete', () => {
  const summary = computeReadiness(buildReadinessSections([item('a', { checked: true })], []))
  assert.equal(summary.activeSections.length, 1)
  assert.equal(summary.activeSections[0].key, 'packing')
})

test('packing-category tasks count toward the packing section', () => {
  const sections = buildReadinessSections([], [{ category: 'packing' as const, done: true }])
  const packing = sections.find((section) => section.key === 'packing')!
  assert.equal(packing.total, 1)
  assert.equal(packing.done, 1)
})

// ── Filters ──────────────────────────────────────────────────────────────────

test('filterPackingItems supports mine / unassigned / remaining', () => {
  const rows = [
    item('mine', { assigned_to: 'me' }),
    item('other', { assigned_to: 'them' }),
    item('nobody', { assigned_to: null }),
    item('done', { assigned_to: 'me', checked: true }),
  ]
  assert.deepEqual(filterPackingItems(rows, 'mine', 'me').map((row) => row.id), ['mine', 'done'])
  assert.deepEqual(filterPackingItems(rows, 'unassigned', 'me').map((row) => row.id), ['nobody'])
  assert.deepEqual(filterPackingItems(rows, 'remaining', 'me').map((row) => row.id), ['mine', 'other', 'nobody'])
  assert.equal(filterPackingItems(rows, 'all', 'me').length, 4)
})

test('isOverdue is strict-before local today and null-safe', () => {
  assert.equal(isOverdue('2026-07-16', '2026-07-17'), true)
  assert.equal(isOverdue('2026-07-17', '2026-07-17'), false)
  assert.equal(isOverdue(null, '2026-07-17'), false)
  assert.equal(isOverdue(undefined, '2026-07-17'), false)
})

// ── Ordering / reorder ───────────────────────────────────────────────────────

test('comparePackingRows: legacy rows keep created_at order, explicit indexes interleave', () => {
  const legacyEarly = item('legacy-early', { created_at: '2026-07-01T10:00:00.000Z' })
  const legacyLate = item('legacy-late', { created_at: '2026-07-02T10:00:00.000Z' })
  const pinnedFirst = item('pinned', { order_index: Date.parse('2026-07-01T00:00:00.000Z') })
  const sorted = [legacyLate, pinnedFirst, legacyEarly].sort(comparePackingRows)
  assert.deepEqual(sorted.map((row) => row.id), ['pinned', 'legacy-early', 'legacy-late'])
})

test('nextOrderIndex appends after the max existing key', () => {
  const now = Date.parse('2026-07-17T00:00:00.000Z')
  assert.equal(nextOrderIndex([], now), now)
  const rows = [item('a', { order_index: now + 5000 }), item('b', { created_at: '2026-07-01T00:00:00.000Z' })]
  assert.equal(nextOrderIndex(rows, now), now + 5000 + 1024)
})

test('reorderUpdates writes a single midpoint for a normal move', () => {
  const rows = [
    item('a', { order_index: 1000 }),
    item('b', { order_index: 2000 }),
    item('c', { order_index: 3000 }),
  ]
  const updates = reorderUpdates(rows, 2, 1)
  assert.deepEqual(updates, [{ id: 'c', order_index: 1500 }])
})

test('reorderUpdates moves to list edges beyond the neighbor keys', () => {
  const rows = [
    item('a', { order_index: 1000 }),
    item('b', { order_index: 2000 }),
  ]
  assert.deepEqual(reorderUpdates(rows, 1, 0), [{ id: 'b', order_index: 1000 - 1024 }])
  assert.deepEqual(reorderUpdates(rows, 0, 1), [{ id: 'a', order_index: 2000 + 1024 }])
})

test('reorderUpdates re-spaces the whole list when neighbors are too dense', () => {
  const rows = [
    item('a', { order_index: 1000 }),
    item('b', { order_index: 1000 + 1e-9 }),
    item('c', { order_index: 1000 + 2e-9 }),
  ]
  const updates = reorderUpdates(rows, 2, 1)
  assert.equal(updates.length, 3)
  const byId = new Map(updates.map((update) => [update.id, update.order_index]))
  assert.ok(byId.get('a')! < byId.get('c')!)
  assert.ok(byId.get('c')! < byId.get('b')!)
})

test('reorderUpdates rejects no-op or out-of-range moves', () => {
  const rows = [item('a', { order_index: 1 }), item('b', { order_index: 2 })]
  assert.deepEqual(reorderUpdates(rows, 1, 1), [])
  assert.deepEqual(reorderUpdates(rows, -1, 0), [])
  assert.deepEqual(reorderUpdates(rows, 0, 5), [])
})

// ── Assignment / departed members ────────────────────────────────────────────

test('assigneeInfo resolves current members, self, and departed users', () => {
  const members = [member('me', 'Me Myself'), member('friend', 'Ada')]
  assert.deepEqual(assigneeInfo('friend', members, 'me'), { name: 'Ada', departed: false })
  assert.deepEqual(assigneeInfo('me', members, 'me'), { name: 'You', departed: false })
  assert.deepEqual(assigneeInfo('ghost', members, 'me'), { name: 'Former member', departed: true })
  assert.equal(assigneeInfo(null, members, 'me'), null)
})

test('whoBringsWhat buckets by assignee with unassigned last', () => {
  const members = [member('me', 'Me'), member('friend', 'Ada')]
  const rows = [
    item('a', { assigned_to: 'friend', checked: true }),
    item('b', { assigned_to: 'friend' }),
    item('c', { assigned_to: 'ghost' }),
    item('d', { assigned_to: null }),
  ]
  const summary = whoBringsWhat(rows, members, 'me')
  assert.equal(summary[summary.length - 1].userId, null)
  const ada = summary.find((entry) => entry.userId === 'friend')!
  assert.equal(ada.total, 2)
  assert.equal(ada.packed, 1)
  const ghost = summary.find((entry) => entry.userId === 'ghost')!
  assert.equal(ghost.departed, true)
  assert.equal(ghost.name, 'Former member')
})

// ── Realtime reconciliation ──────────────────────────────────────────────────

test('applyRealtimeChange inserts, merges updates, and removes deletes', () => {
  let rows: PackingItemRow[] = [item('a')]
  rows = applyRealtimeChange(rows, { eventType: 'INSERT', new: item('b'), old: {} })
  assert.equal(rows.length, 2)

  rows = applyRealtimeChange(rows, { eventType: 'UPDATE', new: { id: 'a', checked: true }, old: {} })
  assert.equal(rows.find((row) => row.id === 'a')?.checked, true)
  assert.equal(rows.find((row) => row.id === 'a')?.label, 'Item a')

  rows = applyRealtimeChange(rows, { eventType: 'DELETE', new: {}, old: { id: 'b' } })
  assert.deepEqual(rows.map((row) => row.id), ['a'])
})

test('applyRealtimeChange treats an INSERT echo of an optimistic row as an update (no duplicates)', () => {
  const optimistic = item('a', { checked: true })
  const echoed = item('a', { checked: true, label: 'Item a' })
  const rows = applyRealtimeChange([optimistic], { eventType: 'INSERT', new: echoed, old: {} })
  assert.equal(rows.length, 1)
})

test('applyRealtimeChange ignores payloads without an id', () => {
  const rows = [item('a')]
  assert.equal(applyRealtimeChange(rows, { eventType: 'UPDATE', new: {}, old: {} }), rows)
})
