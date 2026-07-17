export type GooglePlaceErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'configuration'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'provider_unavailable'
  | 'network'

export interface GooglePlaceAuthorAttribution {
  displayName: string | null
  uri: string | null
  photoUri: string | null
}

export interface GooglePlacePhoto {
  reference: string
  width: number | null
  height: number | null
  authorAttributions: GooglePlaceAuthorAttribution[]
  googleMapsUri: string | null
}

export interface GooglePlaceSearchResult {
  provider: 'google'
  placeId: string
  name: string
  formattedAddress: string | null
  primaryType: string | null
  primaryTypeLabel: string | null
  lat: number
  lng: number
  rating: number | null
  userRatingCount: number | null
  businessStatus: string | null
  openNow: boolean | null
  photoRef: string | null
  photoWidth: number | null
  photoHeight: number | null
}

export interface GooglePlaceReview {
  rating: number
  text: string | null
  relativePublishTimeDescription: string | null
  publishTime: string | null
  authorDisplayName: string | null
  authorUri: string | null
  authorPhotoUri: string | null
  googleMapsUri: string | null
}

export interface GooglePlaceDetail extends GooglePlaceSearchResult {
  regularOpeningHours: { weekdayDescriptions: string[] } | null
  currentOpeningHours: { openNow: boolean | null; weekdayDescriptions: string[] } | null
  nationalPhoneNumber: string | null
  internationalPhoneNumber: string | null
  websiteUri: string | null
  googleMapsUri: string | null
  priceLevel: string | null
  photos: GooglePlacePhoto[]
  reviews: GooglePlaceReview[]
}

export interface GoogleAutocompletePrediction {
  placeId: string
  text: string
  mainText: string | null
  secondaryText: string | null
  types: string[]
}

export interface PlacesErrorResponse {
  error: { code: GooglePlaceErrorCode; message: string; retryable: boolean }
}

export interface PlacesSearchResponse {
  results: GooglePlaceSearchResult[]
}

export interface PlacesDetailsResponse {
  place: GooglePlaceDetail
  reviewsEnabled: boolean
}

