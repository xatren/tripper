import { AUTOCOMPLETE_FIELD_MASK, SEARCH_FIELD_MASK, detailFieldMask } from './field-masks'
import { mapUpstreamStatus, GooglePlacesError } from './errors'
import { normalizeAutocompleteResponse, normalizeDetailResponse, normalizeSearchResponse } from './schemas'
import type { GoogleAutocompletePrediction, GooglePlaceDetail, GooglePlaceSearchResult } from './types'
import type { GooglePlaceCategoryId } from './category-map'
import { googleCategory } from './category-map'

const GOOGLE_PLACES_ORIGIN = 'https://places.googleapis.com/v1'
const TIMEOUT_MS = 8_000

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new GooglePlacesError('configuration', 503, false)
  return key
}

async function googleFetch(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(`${GOOGLE_PLACES_ORIGIN}${path}`, {
      ...init,
      cache: 'no-store',
      signal: combined,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey(), ...(init.headers ?? {}) },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new GooglePlacesError('network', 503, true)
  }
  if (!response.ok) throw mapUpstreamStatus(response.status)
  return response
}

export interface SearchPlacesInput {
  query: string
  category: GooglePlaceCategoryId
  location: { lat: number; lng: number } | null
  radiusMeters: number
  limit: number
  signal?: AbortSignal
}

export async function searchGooglePlaces(input: SearchPlacesInput): Promise<GooglePlaceSearchResult[]> {
  const category = googleCategory(input.category)
  const nearOnly = !input.query && input.location
  const path = nearOnly ? '/places:searchNearby' : '/places:searchText'
  const body: Record<string, unknown> = nearOnly
    ? {
        includedTypes: category.nearbyTypes,
        maxResultCount: input.limit,
        rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center: { latitude: input.location!.lat, longitude: input.location!.lng }, radius: input.radiusMeters } },
      }
    : {
        textQuery: input.query,
        maxResultCount: input.limit,
        ...(category.textType ? { includedType: category.textType, strictTypeFiltering: false } : {}),
        ...(input.location ? { locationBias: { circle: { center: { latitude: input.location.lat, longitude: input.location.lng }, radius: input.radiusMeters } } } : {}),
      }
  const response = await googleFetch(path, { method: 'POST', body: JSON.stringify(body), headers: { 'X-Goog-FieldMask': SEARCH_FIELD_MASK } }, input.signal)
  return normalizeSearchResponse(await response.json())
}

export async function autocompleteGooglePlaces(input: { query: string; sessionToken: string; category: GooglePlaceCategoryId; location: { lat: number; lng: number } | null; signal?: AbortSignal }): Promise<GoogleAutocompletePrediction[]> {
  const category = googleCategory(input.category)
  const body = {
    input: input.query,
    sessionToken: input.sessionToken,
    includeQueryPredictions: false,
    ...(category.nearbyTypes.length ? { includedPrimaryTypes: category.nearbyTypes.slice(0, 5) } : {}),
    ...(input.location ? { locationBias: { circle: { center: { latitude: input.location.lat, longitude: input.location.lng }, radius: 50_000 } } } : {}),
  }
  const response = await googleFetch('/places:autocomplete', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK } }, input.signal)
  return normalizeAutocompleteResponse(await response.json())
}

export async function getGooglePlaceDetails(placeId: string, reviewsEnabled: boolean, sessionToken?: string, signal?: AbortSignal): Promise<GooglePlaceDetail> {
  const params = new URLSearchParams()
  if (sessionToken) params.set('sessionToken', sessionToken)
  const response = await googleFetch(`/places/${encodeURIComponent(placeId)}${params.size ? `?${params}` : ''}`, { method: 'GET', headers: { 'X-Goog-FieldMask': detailFieldMask(reviewsEnabled) } }, signal)
  const normalized = normalizeDetailResponse(await response.json())
  if (!normalized) throw new GooglePlacesError('provider_unavailable', 502, true)
  return normalized
}

export async function getGooglePlacePhoto(reference: string, maxWidth: number, signal?: AbortSignal): Promise<Response> {
  const params = new URLSearchParams({ maxWidthPx: String(maxWidth), skipHttpRedirect: 'true' })
  const metadata = await googleFetch(`/${reference}/media?${params}`, { method: 'GET', headers: {} }, signal)
  const body = await metadata.json() as { photoUri?: unknown }
  if (typeof body.photoUri !== 'string') throw new GooglePlacesError('provider_unavailable', 502, true)
  let photoUrl: URL
  try { photoUrl = new URL(body.photoUri) } catch { throw new GooglePlacesError('provider_unavailable', 502, true) }
  if (photoUrl.protocol !== 'https:' || !photoUrl.hostname.endsWith('.googleusercontent.com')) throw new GooglePlacesError('provider_unavailable', 502, true)
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    return await fetch(photoUrl, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  } catch { throw new GooglePlacesError('network', 503, true) }
}

export function reviewsFeatureEnabled(): boolean {
  return process.env.GOOGLE_PLACES_REVIEWS_ENABLED === 'true'
}
