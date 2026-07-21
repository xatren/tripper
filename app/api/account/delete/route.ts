import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const JOURNAL_BUCKET = 'trip-photos'
const DOCUMENTS_BUCKET = 'trip-documents'
const STORAGE_DELETE_BATCH_SIZE = 1000

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

/** Reservation tables can be absent until the Phase 7 migration runs. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

export async function POST(request: Request) {
  if (request.headers.get('x-tripper-confirm') !== 'delete-account') {
    return NextResponse.json({ error: 'Deletion confirmation is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const [{ data: userResult, error: userError }, { data: sessionResult, error: sessionError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])
  const user = userResult.user
  const accessToken = sessionResult.session?.access_token

  if (userError || sessionError || !user || !accessToken) {
    return NextResponse.json({ error: 'Your session has expired. Sign in and try again.' }, { status: 401 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Account deletion is not configured on this deployment.' }, { status: 503 })
  }

  // Supabase Auth refuses to delete users who still own Storage objects. Find
  // photos in trips they own plus photos they uploaded to shared trips, then
  // remove the underlying objects through the Storage API before deleting the
  // database records.
  const { data: ownedTrips, error: tripsError } = await admin
    .from('trips')
    .select('id')
    .eq('owner_id', user.id)
  if (tripsError) {
    return NextResponse.json({ error: 'Could not prepare your trips for deletion. Try again.' }, { status: 502 })
  }

  const ownedTripIds = (ownedTrips ?? []).map((trip) => trip.id)
  const [
    uploadedPhotosResult, ownedEntriesResult,
    uploadedDocumentsResult, ownedReservationsResult,
    uploadedReceiptsResult, ownedExpensesResult,
  ] = await Promise.all([
    admin.from('journal_photos').select('storage_path').eq('uploaded_by', user.id),
    ownedTripIds.length > 0
      ? admin.from('journal_entries').select('journal_photos(storage_path)').in('trip_id', ownedTripIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('reservation_attachments').select('storage_path').eq('uploaded_by', user.id),
    ownedTripIds.length > 0
      ? admin.from('reservations').select('reservation_attachments(storage_path)').in('trip_id', ownedTripIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('expense_receipts').select('storage_path').eq('uploaded_by', user.id),
    ownedTripIds.length > 0
      ? admin.from('expenses').select('expense_receipts(storage_path)').in('trip_id', ownedTripIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (uploadedPhotosResult.error || ownedEntriesResult.error) {
    return NextResponse.json({ error: 'Could not prepare your photos for deletion. Try again.' }, { status: 502 })
  }
  // A pre-migration database simply has no reservation documents / receipts to clean.
  const reservationsDeployed = !isMissingTable(uploadedDocumentsResult.error) && !isMissingTable(ownedReservationsResult.error)
  if (reservationsDeployed && (uploadedDocumentsResult.error || ownedReservationsResult.error)) {
    return NextResponse.json({ error: 'Could not prepare your booking documents for deletion. Try again.' }, { status: 502 })
  }
  const receiptsDeployed = !isMissingTable(uploadedReceiptsResult.error) && !isMissingTable(ownedExpensesResult.error)
  if (receiptsDeployed && (uploadedReceiptsResult.error || ownedExpensesResult.error)) {
    return NextResponse.json({ error: 'Could not prepare your expense receipts for deletion. Try again.' }, { status: 502 })
  }

  const storagePaths = new Set<string>()
  for (const photo of uploadedPhotosResult.data ?? []) {
    if (photo.storage_path) storagePaths.add(photo.storage_path)
  }
  for (const entry of ownedEntriesResult.data ?? []) {
    for (const photo of entry.journal_photos ?? []) {
      if (photo.storage_path) storagePaths.add(photo.storage_path)
    }
  }

  const documentPaths = new Set<string>()
  if (reservationsDeployed) {
    for (const attachment of uploadedDocumentsResult.data ?? []) {
      if (attachment.storage_path) documentPaths.add(attachment.storage_path)
    }
    for (const reservation of ownedReservationsResult.data ?? []) {
      for (const attachment of reservation.reservation_attachments ?? []) {
        if (attachment.storage_path) documentPaths.add(attachment.storage_path)
      }
    }
  }
  if (receiptsDeployed) {
    for (const receipt of uploadedReceiptsResult.data ?? []) {
      if (receipt.storage_path) documentPaths.add(receipt.storage_path)
    }
    for (const expense of ownedExpensesResult.data ?? []) {
      for (const receipt of expense.expense_receipts ?? []) {
        if (receipt.storage_path) documentPaths.add(receipt.storage_path)
      }
    }
  }

  for (const pathBatch of batches([...storagePaths], STORAGE_DELETE_BATCH_SIZE)) {
    const { error } = await admin.storage.from(JOURNAL_BUCKET).remove(pathBatch)
    if (error) {
      return NextResponse.json({ error: 'Could not delete all private photos. Your account was kept; try again.' }, { status: 502 })
    }
  }
  for (const pathBatch of batches([...documentPaths], STORAGE_DELETE_BATCH_SIZE)) {
    const { error } = await admin.storage.from(DOCUMENTS_BUCKET).remove(pathBatch)
    if (error) {
      return NextResponse.json({ error: 'Could not delete all booking documents. Your account was kept; try again.' }, { status: 502 })
    }
  }

  // Photos uploaded to a trip owned by somebody else are not removed by the
  // user's profile cascade. Remove those metadata rows as part of the same
  // privacy operation so shared journals do not retain broken photo records.
  const { error: photoRowsError } = await admin
    .from('journal_photos')
    .delete()
    .eq('uploaded_by', user.id)
  if (photoRowsError) {
    return NextResponse.json({
      error: 'Your photo files were removed, but their records could not be cleaned up. Your account was kept; contact support before retrying.',
    }, { status: 502 })
  }

  // Same contract for booking documents uploaded to shared trips.
  if (reservationsDeployed) {
    const { error: attachmentRowsError } = await admin
      .from('reservation_attachments')
      .delete()
      .eq('uploaded_by', user.id)
    if (attachmentRowsError) {
      return NextResponse.json({
        error: 'Your document files were removed, but their records could not be cleaned up. Your account was kept; contact support before retrying.',
      }, { status: 502 })
    }
  }

  // Same contract for expense receipts uploaded to shared trips.
  if (receiptsDeployed) {
    const { error: receiptRowsError } = await admin
      .from('expense_receipts')
      .delete()
      .eq('uploaded_by', user.id)
    if (receiptRowsError) {
      return NextResponse.json({
        error: 'Your receipt files were removed, but their records could not be cleaned up. Your account was kept; contact support before retrying.',
      }, { status: 502 })
    }
  }

  // Phase 13 private memories are creator-only. SET NULL would make them
  // permanently unreadable but still retained, so erase them before Auth
  // deletion. Trip-visible plan history keeps its attribution via SET NULL.
  const [privateEventsResult, privateEntriesResult] = await Promise.all([
    admin.from('trip_events').delete().eq('created_by', user.id).eq('visibility', 'private'),
    admin.from('journal_entries').delete().eq('created_by', user.id).eq('visibility', 'private'),
  ])
  if ((!isMissingTable(privateEventsResult.error) && privateEventsResult.error) || (!isMissingTable(privateEntriesResult.error) && privateEntriesResult.error)) {
    return NextResponse.json({ error: 'Could not remove all private travel memories. Your account was kept; try again.' }, { status: 502 })
  }

  // Global sign-out removes every refresh session. Existing access JWTs remain
  // valid until expiry, but deleting the profile removes all membership rows,
  // so active RLS policies no longer authorize those tokens.
  // Do not strand an account after irreversible photo cleanup if revocation is
  // temporarily unavailable: deleting the user is still the stronger outcome.
  await admin.auth.admin.signOut(accessToken, 'global')

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return NextResponse.json({
      error: 'Your private photos were removed, but your account could not be deleted. Contact support before retrying.',
    }, { status: 502 })
  }

  return NextResponse.json({ deleted: true })
}
