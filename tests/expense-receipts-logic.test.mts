import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReceiptPath,
  formatReceiptSize,
  RECEIPT_MAX_BYTES,
  validateReceiptFile,
} from '../app/trip/[id]/mobile/budget/expense-receipts-logic.ts'

test('validateReceiptFile accepts a supported PDF within the size limit', () => {
  assert.equal(validateReceiptFile({ type: 'application/pdf', size: 1024, name: 'receipt.pdf' }), null)
})

test('validateReceiptFile rejects an unsupported MIME type', () => {
  const result = validateReceiptFile({ type: 'text/plain', size: 100, name: 'notes.txt' })
  assert.equal(result?.code, 'unsupported-type')
})

test('validateReceiptFile rejects an empty file', () => {
  const result = validateReceiptFile({ type: 'image/png', size: 0, name: 'empty.png' })
  assert.equal(result?.code, 'empty')
})

test('validateReceiptFile rejects a file over the 20 MB limit', () => {
  const result = validateReceiptFile({ type: 'image/jpeg', size: RECEIPT_MAX_BYTES + 1, name: 'huge.jpg' })
  assert.equal(result?.code, 'too-large')
})

test('buildReceiptPath places the file under {trip}/expenses/{expense}/{uuid}.{ext}', () => {
  const path = buildReceiptPath('trip-1', 'expense-1', 'uuid-1', 'image/jpeg')
  assert.equal(path, 'trip-1/expenses/expense-1/uuid-1.jpg')
})

test('buildReceiptPath throws for an unsupported MIME type', () => {
  assert.throws(() => buildReceiptPath('trip-1', 'expense-1', 'uuid-1', 'video/mp4'))
})

test('formatReceiptSize renders bytes, kilobytes, and megabytes appropriately', () => {
  assert.equal(formatReceiptSize(500), '500 B')
  assert.equal(formatReceiptSize(2048), '2 KB')
  assert.equal(formatReceiptSize(5 * 1024 * 1024), '5.0 MB')
})
