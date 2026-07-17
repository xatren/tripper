/**
 * Pure decision logic for expense receipts — file validation and storage path
 * generation. Mirrors ../bookings/bookings-logic.ts's attachment helpers
 * exactly (same MIME/size contract, same trip-documents bucket) so
 * tests/expense-receipts-logic.test.mts can exercise every branch under
 * `node --test` without Supabase or React imports.
 */

export const RECEIPTS_BUCKET = 'trip-documents'

/** Server contract twins: bucket allowlist + size limit in the migration. */
export const RECEIPT_MAX_BYTES = 20 * 1024 * 1024
export const RECEIPT_MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const RECEIPT_ACCEPT = Object.keys(RECEIPT_MIME_TO_EXT).join(',')

export interface ReceiptValidationError {
  code: 'unsupported-type' | 'too-large' | 'empty'
  message: string
}

/**
 * Client-side pre-upload validation. The bucket enforces the same limits
 * server-side; this exists so failures surface before bytes leave the device.
 */
export function validateReceiptFile(file: { type: string; size: number; name: string }): ReceiptValidationError | null {
  if (!RECEIPT_MIME_TO_EXT[file.type]) {
    return { code: 'unsupported-type', message: 'Only PDF, JPEG, PNG, and WebP files are supported.' }
  }
  if (file.size <= 0) {
    return { code: 'empty', message: 'This file is empty.' }
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return { code: 'too-large', message: 'Files can be at most 20 MB.' }
  }
  return null
}

/**
 * Object path inside `trip-documents`. Built exclusively from ids and a fresh
 * uuid — the user's filename never becomes a path segment. The 'expenses'
 * path segment (distinct from bookings' 'reservations' segment) is what the
 * storage RLS policies gate the editor-upload check on.
 */
export function buildReceiptPath(tripId: string, expenseId: string, uuid: string, mimeType: string): string {
  const ext = RECEIPT_MIME_TO_EXT[mimeType]
  if (!ext) throw new Error(`Unsupported receipt MIME type: ${mimeType}`)
  return `${tripId}/expenses/${expenseId}/${uuid}.${ext}`
}

export function formatReceiptSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
