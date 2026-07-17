import type { GoogleAutocompletePrediction, GooglePlaceAuthorAttribution, GooglePlaceDetail, GooglePlacePhoto, GooglePlaceReview, GooglePlaceSearchResult } from './types.ts'
import { safeHttpUrl, safeHttpsUrl } from './pure.ts'

type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject | null => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : null
const string = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const boolean = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null
const objects = (value: unknown): JsonObject[] => Array.isArray(value) ? value.map(object).filter((entry): entry is JsonObject => !!entry) : []

function localizedText(value: unknown): string | null { return string(object(value)?.text) }

function attribution(value: JsonObject): GooglePlaceAuthorAttribution {
  return { displayName: string(value.displayName), uri: safeHttpUrl(string(value.uri)), photoUri: safeHttpsUrl(string(value.photoUri)) }
}

function photo(value: JsonObject): GooglePlacePhoto | null {
  const reference = string(value.name)
  if (!reference || !/^places\/[^/]+\/photos\/[^/]+$/.test(reference)) return null
  return {
    reference,
    width: number(value.widthPx),
    height: number(value.heightPx),
    authorAttributions: objects(value.authorAttributions).map(attribution),
    googleMapsUri: safeHttpsUrl(string(value.googleMapsUri)),
  }
}

function basePlace(value: JsonObject): GooglePlaceSearchResult | null {
  const placeId = string(value.id)
  const name = localizedText(value.displayName)
  const location = object(value.location)
  const lat = number(location?.latitude)
  const lng = number(location?.longitude)
  if (!placeId || !name || lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const firstPhoto = objects(value.photos).map(photo).find((entry): entry is GooglePlacePhoto => !!entry) ?? null
  const currentHours = object(value.currentOpeningHours)
  return {
    provider: 'google', placeId, name,
    formattedAddress: string(value.formattedAddress),
    primaryType: string(value.primaryType),
    primaryTypeLabel: localizedText(value.primaryTypeDisplayName),
    lat, lng,
    rating: number(value.rating),
    userRatingCount: number(value.userRatingCount),
    businessStatus: string(value.businessStatus),
    openNow: boolean(currentHours?.openNow),
    photoRef: firstPhoto?.reference ?? null,
    photoWidth: firstPhoto?.width ?? null,
    photoHeight: firstPhoto?.height ?? null,
  }
}

function hours(value: unknown): { openNow: boolean | null; weekdayDescriptions: string[] } | null {
  const data = object(value)
  if (!data) return null
  return { openNow: boolean(data.openNow), weekdayDescriptions: Array.isArray(data.weekdayDescriptions) ? data.weekdayDescriptions.filter((item): item is string => typeof item === 'string') : [] }
}

function review(value: JsonObject): GooglePlaceReview | null {
  const rating = number(value.rating)
  if (rating == null) return null
  const author = object(value.authorAttribution)
  return {
    rating,
    text: localizedText(value.text),
    relativePublishTimeDescription: string(value.relativePublishTimeDescription),
    publishTime: string(value.publishTime),
    authorDisplayName: string(author?.displayName),
    authorUri: safeHttpUrl(string(author?.uri)),
    authorPhotoUri: safeHttpsUrl(string(author?.photoUri)),
    googleMapsUri: safeHttpsUrl(string(value.googleMapsUri)),
  }
}

export function normalizeSearchResponse(value: unknown): GooglePlaceSearchResult[] {
  return objects(object(value)?.places).map(basePlace).filter((entry): entry is GooglePlaceSearchResult => !!entry).slice(0, 12)
}

export function normalizeDetailResponse(value: unknown): GooglePlaceDetail | null {
  const data = object(value)
  if (!data) return null
  const base = basePlace(data)
  if (!base) return null
  const regular = hours(data.regularOpeningHours)
  const current = hours(data.currentOpeningHours)
  return {
    ...base,
    regularOpeningHours: regular ? { weekdayDescriptions: regular.weekdayDescriptions } : null,
    currentOpeningHours: current,
    nationalPhoneNumber: string(data.nationalPhoneNumber),
    internationalPhoneNumber: string(data.internationalPhoneNumber),
    websiteUri: safeHttpUrl(string(data.websiteUri)),
    googleMapsUri: safeHttpsUrl(string(data.googleMapsUri)),
    priceLevel: string(data.priceLevel),
    photos: objects(data.photos).map(photo).filter((entry): entry is GooglePlacePhoto => !!entry).slice(0, 10),
    reviews: objects(data.reviews).map(review).filter((entry): entry is GooglePlaceReview => !!entry).slice(0, 5),
  }
}

export function normalizeAutocompleteResponse(value: unknown): GoogleAutocompletePrediction[] {
  const suggestions = objects(object(value)?.suggestions)
  return suggestions.flatMap((suggestion) => {
    const prediction = object(suggestion.placePrediction)
    if (!prediction) return []
    const placeId = string(prediction.placeId)
    const text = localizedText(prediction.text)
    if (!placeId || !text) return []
    const structured = object(prediction.structuredFormat)
    return [{
      placeId, text,
      mainText: localizedText(structured?.mainText),
      secondaryText: localizedText(structured?.secondaryText),
      types: Array.isArray(prediction.types) ? prediction.types.filter((item): item is string => typeof item === 'string') : [],
    }]
  }).slice(0, 10)
}
