export const OFFLINE_SNAPSHOT_SCHEMA_VERSION = 2
export const OFFLINE_MAX_RETRIES = 5
export const OFFLINE_MEDIA_MAX_FILE_BYTES = 10 * 1024 * 1024
export const OFFLINE_MEDIA_BUDGET_BYTES = 25 * 1024 * 1024

export type OfflineEntity = 'packing_item' | 'trip_task' | 'journal_entry' | 'expense' | 'itinerary_item' | 'trip_event'
export type OfflineAction = 'create' | 'toggle' | 'update_note' | 'update_status'
export type OfflineQueueStatus = 'pending' | 'retrying' | 'failed' | 'conflict' | 'blocked'

export interface OfflineMediaManifestEntry {
  id: string
  kind: 'journal-photo' | 'cover-thumbnail'
  cache_key: string
  size_bytes: number
  opened_at: string
}

export interface TripOfflineSnapshot {
  schema_version: number
  key: string
  user_id: string
  trip_id: string
  downloaded_at: string
  updated_at: string
  size_bytes: number
  checksum: string
  trip: Record<string, unknown>
  members: Record<string, unknown>[]
  stops: Record<string, unknown>[]
  itinerary: Record<string, unknown>[]
  reservations: Record<string, unknown>[]
  packing: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  expenses: Record<string, unknown>[]
  journal: Record<string, unknown>[]
  events: Record<string, unknown>[]
  route_geometry: { lat: number; lng: number }[]
  media_manifest: OfflineMediaManifestEntry[]
}

export interface OfflineMediaQueueItem {
  id: string
  user_id: string
  trip_id: string
  entry_id: string
  storage_path: string
  file_name: string
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
  size_bytes: number
  blob: Blob
  created_at: string
  retry_count: number
  status: OfflineQueueStatus
  next_retry_at: string | null
  last_error: string | null
}

export interface OfflineQueueItem {
  id: string
  idempotency_key: string
  user_id: string
  trip_id: string
  entity: OfflineEntity
  action: OfflineAction
  entity_id: string
  payload: Record<string, unknown>
  base_version: string | null
  created_at: string
  retry_count: number
  status: OfflineQueueStatus
  next_retry_at: string | null
  depends_on: string | null
  last_error: string | null
}

const ALLOWLIST: Record<OfflineEntity, Partial<Record<OfflineAction, readonly string[]>>> = {
  packing_item: {
    create: ['id', 'trip_id', 'category', 'label', 'created_by', 'order_index'],
    toggle: ['checked', 'completed_by', 'completed_at'],
  },
  trip_task: {
    create: ['id', 'trip_id', 'category', 'title', 'created_by', 'order_index'],
    toggle: ['done', 'completed_by', 'completed_at'],
  },
  journal_entry: {
    create: ['id', 'trip_id', 'entry_date', 'note', 'created_by', 'created_at', 'occurred_at', 'itinerary_item_id', 'visibility', 'is_hidden', 'location_lat', 'location_lng'],
    update_note: ['note', 'visibility', 'is_hidden'],
  },
  expense: {
    create: ['id', 'trip_id', 'category', 'description', 'amount', 'paid_by', 'expense_date', 'itinerary_item_id', 'split_type'],
  },
  itinerary_item: {
    create: ['id', 'trip_id', 'item_type', 'title', 'address', 'lat', 'lng', 'local_date', 'start_at', 'all_day', 'order_index', 'status', 'created_by'],
    update_note: ['notes'],
    update_status: ['status'],
  },
  trip_event: {
    create: ['id', 'trip_id', 'itinerary_item_id', 'event_type', 'occurred_at', 'created_by', 'visibility', 'metadata', 'is_hidden', 'idempotency_key'],
    update_note: ['visibility', 'is_hidden', 'occurred_at', 'metadata'],
  },
}

export function sanitizeOfflinePayload(entity: OfflineEntity, action: OfflineAction, payload: Record<string, unknown>): Record<string, unknown> {
  const keys = ALLOWLIST[entity]?.[action]
  if (!keys) throw new Error(`Offline action is not allowed: ${entity}.${action}`)
  const clean: Record<string, unknown> = {}
  for (const key of keys) {
    const value = payload[key]
    if (value !== undefined && typeof value !== 'function') clean[key] = value
  }
  return clean
}

export function offlineSnapshotKey(userId: string, tripId: string) {
  return `${userId}:${tripId}`
}

export function snapshotChecksum(snapshot: object): string {
  const text = JSON.stringify(snapshot)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function validateSnapshot(snapshot: TripOfflineSnapshot, userId: string, tripId: string): boolean {
  if (!snapshot || snapshot.schema_version !== OFFLINE_SNAPSHOT_SCHEMA_VERSION) return false
  if (snapshot.user_id !== userId || snapshot.trip_id !== tripId || snapshot.key !== offlineSnapshotKey(userId, tripId)) return false
  const checksum = snapshot.checksum
  const unsigned = { ...snapshot } as Partial<TripOfflineSnapshot>
  delete unsigned.checksum
  delete unsigned.size_bytes
  return checksum === snapshotChecksum(unsigned)
}

/**
 * Snapshot migration boundary. Add one explicit case per historical schema;
 * unknown/newer or malformed versions are deliberately discarded so private
 * data is never guessed into a shape the current client does not understand.
 */
export function migrateSnapshot(raw: unknown, userId: string, tripId: string): TripOfflineSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const version = (raw as { schema_version?: unknown }).schema_version
  switch (version) {
    case OFFLINE_SNAPSHOT_SCHEMA_VERSION: {
      const snapshot = raw as TripOfflineSnapshot
      return validateSnapshot(snapshot, userId, tripId) ? snapshot : null
    }
    case 1: {
      const old = raw as Omit<TripOfflineSnapshot, 'events' | 'schema_version'> & { schema_version: 1 }
      if (old.user_id !== userId || old.trip_id !== tripId || old.key !== offlineSnapshotKey(userId, tripId)) return null
      const unsigned = { ...old } as Record<string, unknown>
      const checksum = unsigned.checksum
      delete unsigned.checksum
      delete unsigned.size_bytes
      if (checksum !== snapshotChecksum(unsigned)) return null
      const migratedUnsigned = { ...unsigned, schema_version: OFFLINE_SNAPSHOT_SCHEMA_VERSION, events: [] }
      return {
        ...migratedUnsigned,
        checksum: snapshotChecksum(migratedUnsigned),
        size_bytes: new Blob([JSON.stringify(migratedUnsigned)]).size,
      } as unknown as TripOfflineSnapshot
    }
    default:
      return null
  }
}
