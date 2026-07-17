import { isGooglePlaceCategory, type GooglePlaceCategoryId } from './category-map.ts'
import { GooglePlacesError } from './errors.ts'
import { isValidCoordinate, normalizeQuery } from './pure.ts'

// Google documents no formal Place ID maximum; a bounded 2 KiB ceiling keeps
// route parsing safe while accepting unusually long valid IDs.
const PLACE_ID_PATTERN = /^[A-Za-z0-9_\-:.]{1,2048}$/
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_\-]{8,128}$/
const PHOTO_REFERENCE_PATTERN = /^places\/[A-Za-z0-9_\-:.]{1,2048}\/photos\/[A-Za-z0-9_\-:.]{1,2048}$/

function integer(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new GooglePlacesError('invalid_request', 400, false)
  return parsed
}

function coordinate(value: string | null): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new GooglePlacesError('invalid_request', 400, false)
  return parsed
}

export interface ValidatedSearchInput {
  query: string
  category: GooglePlaceCategoryId
  location: { lat: number; lng: number } | null
  radiusMeters: number
  limit: number
}

export function validateSearchParams(params: URLSearchParams): ValidatedSearchInput {
  if (params.has('fieldMask') || params.has('fields')) throw new GooglePlacesError('invalid_request', 400, false)
  const query = normalizeQuery(params.get('q') ?? '')
  if (query.length > 120 || (query.length > 0 && query.length < 2)) throw new GooglePlacesError('invalid_request', 400, false)
  const categoryValue = params.get('category') ?? 'all'
  if (!isGooglePlaceCategory(categoryValue)) throw new GooglePlacesError('invalid_request', 400, false)
  const lat = coordinate(params.get('lat'))
  const lng = coordinate(params.get('lng'))
  if ((lat == null) !== (lng == null)) throw new GooglePlacesError('invalid_request', 400, false)
  const location = lat == null || lng == null ? null : { lat, lng }
  if (location && !isValidCoordinate(location)) throw new GooglePlacesError('invalid_request', 400, false)
  if (!query && (categoryValue === 'all' || !location)) throw new GooglePlacesError('invalid_request', 400, false)
  return {
    query,
    category: categoryValue,
    location,
    radiusMeters: integer(params.get('radius'), 50_000, 100, 50_000),
    limit: integer(params.get('limit'), 10, 1, 12),
  }
}

export function validatePlaceId(value: string): string {
  let decoded: string
  try { decoded = decodeURIComponent(value).trim() } catch { throw new GooglePlacesError('invalid_request', 400, false) }
  if (!PLACE_ID_PATTERN.test(decoded)) throw new GooglePlacesError('invalid_request', 400, false)
  return decoded
}

export function validateSessionToken(value: string | null, required = false): string | undefined {
  if (!value) {
    if (required) throw new GooglePlacesError('invalid_request', 400, false)
    return undefined
  }
  if (!SESSION_TOKEN_PATTERN.test(value)) throw new GooglePlacesError('invalid_request', 400, false)
  return value
}

export function validatePhotoParams(params: URLSearchParams): { reference: string; maxWidth: number } {
  const reference = params.get('ref') ?? ''
  if (!PHOTO_REFERENCE_PATTERN.test(reference)) throw new GooglePlacesError('invalid_request', 400, false)
  return { reference, maxWidth: integer(params.get('maxWidth'), 800, 64, 1600) }
}
