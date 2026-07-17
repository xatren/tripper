import type { GooglePlaceErrorCode, PlacesErrorResponse } from './types.ts'

export class GooglePlacesError extends Error {
  readonly code: GooglePlaceErrorCode
  readonly status: number
  readonly retryable: boolean

  constructor(code: GooglePlaceErrorCode, status: number, retryable: boolean) {
    super(code)
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

export function errorResponse(error: GooglePlacesError): Response {
  const messages: Record<GooglePlaceErrorCode, string> = {
    invalid_request: 'The search request is invalid.',
    unauthorized: 'Sign in to search places.',
    configuration: 'Google Places is not configured.',
    rate_limited: 'Too many searches. Wait a moment and try again.',
    quota_exceeded: 'The place search quota is temporarily unavailable.',
    provider_unavailable: 'Google Places is temporarily unavailable.',
    network: 'Could not reach Google Places.',
  }
  const body: PlacesErrorResponse = { error: { code: error.code, message: messages[error.code], retryable: error.retryable } }
  return Response.json(body, { status: error.status })
}

export function mapUpstreamStatus(status: number): GooglePlacesError {
  if (status === 400) return new GooglePlacesError('invalid_request', 400, false)
  if (status === 401 || status === 403) return new GooglePlacesError('configuration', 503, false)
  if (status === 429) return new GooglePlacesError('quota_exceeded', 503, true)
  if (status >= 500) return new GooglePlacesError('provider_unavailable', 503, true)
  return new GooglePlacesError('provider_unavailable', 502, true)
}
