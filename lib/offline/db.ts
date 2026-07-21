'use client'

import {
  OFFLINE_MAX_RETRIES,
  OFFLINE_MEDIA_BUDGET_BYTES,
  OFFLINE_SNAPSHOT_SCHEMA_VERSION,
  offlineSnapshotKey,
  migrateSnapshot,
  sanitizeOfflinePayload,
  snapshotChecksum,
  type OfflineAction,
  type OfflineEntity,
  type OfflineQueueItem,
  type OfflineQueueStatus,
  type OfflineMediaQueueItem,
  type TripOfflineSnapshot,
} from './types'

const DB_NAME = 'tripper-private-v1'
const DB_VERSION = 2
const SNAPSHOTS = 'snapshots'
const QUEUE = 'mutation_queue'
const META = 'meta'
const MEDIA = 'media_queue'
const ACTIVE_USER_KEY = 'active_user'
const CHANGE_EVENT = 'tripper-offline-change'

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Offline storage is not supported by this browser.'))
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(QUEUE)) {
        const queue = db.createObjectStore(QUEUE, { keyPath: 'id' })
        queue.createIndex('user_trip', ['user_id', 'trip_id'])
        queue.createIndex('status', 'status')
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      if (!db.objectStoreNames.contains(MEDIA)) {
        const media = db.createObjectStore(MEDIA, { keyPath: 'id' })
        media.createIndex('user_trip', ['user_id', 'trip_id'])
        media.createIndex('status', 'status')
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error ?? new Error('Could not open offline storage.'))
    open.onblocked = () => reject(new Error('Close other Tripper tabs and try again.'))
  })
}

function announceChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeOfflineChanges(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

export async function bindActiveOfflineUser(userId: string): Promise<void> {
  const db = await openOfflineDb()
  const readTx = db.transaction(META, 'readonly')
  const previous = await request(readTx.objectStore(META).get(ACTIVE_USER_KEY)) as string | undefined
  await transactionDone(readTx)
  db.close()
  if (previous && previous !== userId) await clearPrivateOfflineData()
  const nextDb = await openOfflineDb()
  const writeTx = nextDb.transaction(META, 'readwrite')
  writeTx.objectStore(META).put(userId, ACTIVE_USER_KEY)
  await transactionDone(writeTx)
  nextDb.close()
}

export async function clearPrivateOfflineData(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(DB_NAME)
    deletion.onsuccess = () => resolve()
    deletion.onerror = () => reject(deletion.error ?? new Error('Could not clear offline data.'))
    deletion.onblocked = () => reject(new Error('Close other Tripper tabs to finish clearing offline data.'))
  })
  announceChange()
}

export async function saveSnapshot(input: Omit<TripOfflineSnapshot, 'key' | 'schema_version' | 'checksum' | 'size_bytes'>): Promise<TripOfflineSnapshot> {
  const unsigned = {
    ...input,
    key: offlineSnapshotKey(input.user_id, input.trip_id),
    schema_version: OFFLINE_SNAPSHOT_SCHEMA_VERSION,
  }
  const checksum = snapshotChecksum(unsigned)
  const snapshot = { ...unsigned, checksum, size_bytes: new Blob([JSON.stringify(unsigned)]).size }
  const db = await openOfflineDb()
  const tx = db.transaction(SNAPSHOTS, 'readwrite')
  tx.objectStore(SNAPSHOTS).put(snapshot)
  try {
    await transactionDone(tx)
  } finally {
    db.close()
  }
  announceChange()
  return snapshot
}

export async function getSnapshot(userId: string, tripId: string): Promise<TripOfflineSnapshot | null> {
  const db = await openOfflineDb()
  const tx = db.transaction(SNAPSHOTS, 'readonly')
  const snapshot = await request(tx.objectStore(SNAPSHOTS).get(offlineSnapshotKey(userId, tripId))) as TripOfflineSnapshot | undefined
  await transactionDone(tx)
  db.close()
  if (!snapshot) return null
  const migrated = migrateSnapshot(snapshot, userId, tripId)
  if (migrated) return migrated
  await removeSnapshot(userId, tripId)
  return null
}

export async function removeSnapshot(userId: string, tripId: string): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction([SNAPSHOTS, QUEUE, MEDIA], 'readwrite')
  tx.objectStore(SNAPSHOTS).delete(offlineSnapshotKey(userId, tripId))
  const rows = await request(tx.objectStore(QUEUE).index('user_trip').getAll(IDBKeyRange.only([userId, tripId]))) as OfflineQueueItem[]
  for (const row of rows) tx.objectStore(QUEUE).delete(row.id)
  const mediaRows = await request(tx.objectStore(MEDIA).index('user_trip').getAll(IDBKeyRange.only([userId, tripId]))) as OfflineMediaQueueItem[]
  for (const row of mediaRows) tx.objectStore(MEDIA).delete(row.id)
  await transactionDone(tx)
  db.close()
  announceChange()
}

export async function enqueueMediaUpload(input: Omit<OfflineMediaQueueItem, 'id' | 'created_at' | 'retry_count' | 'status' | 'next_retry_at' | 'last_error'>): Promise<OfflineMediaQueueItem> {
  const db = await openOfflineDb()
  const readTx = db.transaction(MEDIA, 'readonly')
  const existing = await request(readTx.objectStore(MEDIA).index('user_trip').getAll(IDBKeyRange.only([input.user_id, input.trip_id]))) as OfflineMediaQueueItem[]
  await transactionDone(readTx)
  const queuedBytes = existing.reduce((sum, item) => sum + item.size_bytes, 0)
  if (queuedBytes + input.size_bytes > OFFLINE_MEDIA_BUDGET_BYTES) {
    db.close()
    throw new Error('Offline photo queue is full (25 MB). Connect to sync or remove a queued photo.')
  }
  const item: OfflineMediaQueueItem = {
    ...input, id: crypto.randomUUID(), created_at: new Date().toISOString(), retry_count: 0,
    status: 'pending', next_retry_at: null, last_error: null,
  }
  const tx = db.transaction(MEDIA, 'readwrite')
  tx.objectStore(MEDIA).add(item)
  await transactionDone(tx)
  db.close()
  announceChange()
  return item
}

export async function listMediaQueue(userId: string, tripId?: string): Promise<OfflineMediaQueueItem[]> {
  const db = await openOfflineDb()
  const tx = db.transaction(MEDIA, 'readonly')
  const rows = tripId
    ? await request(tx.objectStore(MEDIA).index('user_trip').getAll(IDBKeyRange.only([userId, tripId]))) as OfflineMediaQueueItem[]
    : await request(tx.objectStore(MEDIA).getAll()) as OfflineMediaQueueItem[]
  await transactionDone(tx)
  db.close()
  return rows.filter((row) => row.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function setMediaQueueState(id: string, status: OfflineQueueStatus, error: string | null, retryCount?: number): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(MEDIA, 'readwrite')
  const store = tx.objectStore(MEDIA)
  const item = await request(store.get(id)) as OfflineMediaQueueItem | undefined
  if (item) {
    const count = retryCount ?? item.retry_count
    const delay = Math.min(60_000, 1_000 * (2 ** Math.max(0, count - 1)))
    store.put({ ...item, status, retry_count: count, last_error: error, next_retry_at: status === 'retrying' ? new Date(Date.now() + delay).toISOString() : null })
  }
  await transactionDone(tx)
  db.close()
  announceChange()
}

export async function discardMediaQueueItem(id: string): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(MEDIA, 'readwrite')
  tx.objectStore(MEDIA).delete(id)
  await transactionDone(tx)
  db.close()
  announceChange()
}

export async function acknowledgeMediaUpload(id: string): Promise<void> {
  return discardMediaQueueItem(id)
}

export async function enqueueMutation(input: {
  user_id: string
  trip_id: string
  entity: OfflineEntity
  action: OfflineAction
  entity_id: string
  payload: Record<string, unknown>
  base_version?: string | null
  depends_on?: string | null
}): Promise<OfflineQueueItem> {
  const id = crypto.randomUUID()
  const item: OfflineQueueItem = {
    id,
    idempotency_key: id,
    user_id: input.user_id,
    trip_id: input.trip_id,
    entity: input.entity,
    action: input.action,
    entity_id: input.entity_id,
    payload: sanitizeOfflinePayload(input.entity, input.action, input.payload),
    base_version: input.base_version ?? null,
    created_at: new Date().toISOString(),
    retry_count: 0,
    status: 'pending',
    next_retry_at: null,
    depends_on: input.depends_on ?? null,
    last_error: null,
  }
  const db = await openOfflineDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).add(item)
  await transactionDone(tx)
  db.close()
  announceChange()
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null)
    const syncRegistration = registration as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | null
    await syncRegistration?.sync?.register('tripper-mutation-sync').catch(() => undefined)
  }
  return item
}

export async function listQueue(userId: string, tripId?: string): Promise<OfflineQueueItem[]> {
  const db = await openOfflineDb()
  const tx = db.transaction(QUEUE, 'readonly')
  const rows = tripId
    ? await request(tx.objectStore(QUEUE).index('user_trip').getAll(IDBKeyRange.only([userId, tripId]))) as OfflineQueueItem[]
    : await request(tx.objectStore(QUEUE).getAll()) as OfflineQueueItem[]
  await transactionDone(tx)
  db.close()
  return rows.filter((row) => row.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function setQueueState(id: string, status: OfflineQueueStatus, error: string | null, retryCount?: number): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  const store = tx.objectStore(QUEUE)
  const item = await request(store.get(id)) as OfflineQueueItem | undefined
  if (item) {
    const count = retryCount ?? item.retry_count
    const delay = Math.min(60_000, 1_000 * (2 ** Math.max(0, count - 1)))
    store.put({
      ...item,
      status: count >= OFFLINE_MAX_RETRIES && status === 'retrying' ? 'failed' : status,
      retry_count: count,
      last_error: error,
      next_retry_at: status === 'retrying' ? new Date(Date.now() + delay).toISOString() : null,
    })
  }
  await transactionDone(tx)
  db.close()
  announceChange()
}

export async function retryQueueItem(id: string) {
  return setQueueState(id, 'pending', null)
}

export async function discardQueueItem(id: string): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).delete(id)
  await transactionDone(tx)
  db.close()
  announceChange()
}

export async function acknowledgeMutation(item: OfflineQueueItem, serverRow?: Record<string, unknown>): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction([QUEUE, SNAPSHOTS], 'readwrite')
  tx.objectStore(QUEUE).delete(item.id)
  const snapshotStore = tx.objectStore(SNAPSHOTS)
  const key = offlineSnapshotKey(item.user_id, item.trip_id)
  const snapshot = await request(snapshotStore.get(key)) as TripOfflineSnapshot | undefined
  if (snapshot) {
    const collection = item.entity === 'packing_item' ? 'packing'
      : item.entity === 'trip_task' ? 'tasks'
      : item.entity === 'journal_entry' ? 'journal'
      : item.entity === 'itinerary_item' ? 'itinerary'
      : item.entity === 'trip_event' ? 'events'
      : 'expenses'
    const rows = snapshot[collection] as Record<string, unknown>[]
    const patch = serverRow ?? { id: item.entity_id, ...item.payload }
    const exists = rows.some((row) => row.id === item.entity_id)
    const nextRows = exists
      ? rows.map((row) => row.id === item.entity_id ? { ...row, ...patch } : row)
      : [...rows, patch]
    const unsigned = { ...snapshot, [collection]: nextRows, updated_at: new Date().toISOString() }
    const checksumInput = { ...unsigned } as Partial<TripOfflineSnapshot>
    delete checksumInput.checksum
    delete checksumInput.size_bytes
    snapshotStore.put({ ...unsigned, checksum: snapshotChecksum(checksumInput), size_bytes: new Blob([JSON.stringify(checksumInput)]).size })
  }
  await transactionDone(tx)
  db.close()
  announceChange()
}
