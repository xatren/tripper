/**
 * Search stays on the Search Pro tier. Rating, hours, phone, website, and
 * reviews are intentionally deferred until a user opens one result.
 */
export const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.location',
  'places.photos',
].join(',')

export const AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text',
  'suggestions.placePrediction.structuredFormat',
  'suggestions.placePrediction.types',
].join(',')

const DETAIL_BASE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'primaryType',
  'primaryTypeDisplayName',
  'location',
  'businessStatus',
  'rating',
  'userRatingCount',
  'currentOpeningHours',
  'regularOpeningHours',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'priceLevel',
  'photos',
]

export function detailFieldMask(reviewsEnabled: boolean): string {
  return [...DETAIL_BASE_FIELDS, ...(reviewsEnabled ? ['reviews'] : [])].join(',')
}

export function fieldMasksAreProductionSafe(): boolean {
  return ![SEARCH_FIELD_MASK, AUTOCOMPLETE_FIELD_MASK, detailFieldMask(false), detailFieldMask(true)]
    .some((mask) => mask.split(',').includes('*'))
}

