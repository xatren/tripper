import type { SupabaseClient } from '@supabase/supabase-js'

const JOURNAL_BUCKET = 'trip-photos'
const DOCUMENTS_BUCKET = 'trip-documents'
const STORAGE_DELETE_BATCH_SIZE = 1000

/** Tables can be absent on pre-migration databases; that is not a failure. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

/**
 * Removes every Storage object owned by a trip (journal photos and reservation
 * documents) ahead of deleting the trip row. Database rows cascade with the
 * trip; Storage objects do not, so callers MUST run this first and abort the
 * trip deletion when it fails — otherwise private files would be orphaned in
 * the buckets with their metadata gone.
 */
export async function removeTripStorageObjects(
  supabase: SupabaseClient,
  tripId: string,
): Promise<{ ok: boolean }> {
  const [journalResult, reservationResult, expenseResult] = await Promise.all([
    supabase.from('journal_entries').select('journal_photos(storage_path)').eq('trip_id', tripId),
    supabase.from('reservations').select('reservation_attachments(storage_path)').eq('trip_id', tripId),
    supabase.from('expenses').select('expense_receipts(storage_path)').eq('trip_id', tripId),
  ])

  if (journalResult.error && !isMissingTable(journalResult.error)) return { ok: false }
  if (reservationResult.error && !isMissingTable(reservationResult.error)) return { ok: false }
  if (expenseResult.error && !isMissingTable(expenseResult.error)) return { ok: false }

  const journalPaths = new Set<string>()
  for (const entry of journalResult.data ?? []) {
    for (const photo of entry.journal_photos ?? []) {
      if (photo.storage_path) journalPaths.add(photo.storage_path)
    }
  }
  const documentPaths = new Set<string>()
  for (const reservation of reservationResult.data ?? []) {
    for (const attachment of reservation.reservation_attachments ?? []) {
      if (attachment.storage_path) documentPaths.add(attachment.storage_path)
    }
  }
  for (const expense of expenseResult.data ?? []) {
    for (const receipt of expense.expense_receipts ?? []) {
      if (receipt.storage_path) documentPaths.add(receipt.storage_path)
    }
  }

  for (const [bucket, paths] of [
    [JOURNAL_BUCKET, [...journalPaths]],
    [DOCUMENTS_BUCKET, [...documentPaths]],
  ] as const) {
    for (const pathBatch of batches(paths, STORAGE_DELETE_BATCH_SIZE)) {
      const { error } = await supabase.storage.from(bucket).remove(pathBatch)
      if (error) return { ok: false }
    }
  }

  return { ok: true }
}
