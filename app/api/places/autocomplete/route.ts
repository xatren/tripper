import { requirePlacesUser } from '@/lib/google-places/auth'
import { autocompleteGooglePlaces } from '@/lib/google-places/client'
import { errorResponse, GooglePlacesError } from '@/lib/google-places/errors'
import { enforcePlacesRateLimit } from '@/lib/google-places/rate-limit'
import { validateSearchParams, validateSessionToken } from '@/lib/google-places/validation'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const { rateKey } = await requirePlacesUser(request)
    enforcePlacesRateLimit(`autocomplete:${rateKey}`, 60)
    const params = new URL(request.url).searchParams
    const input = validateSearchParams(params)
    if (!input.query) throw new GooglePlacesError('invalid_request', 400, false)
    const sessionToken = validateSessionToken(params.get('sessionToken'), true)!
    const predictions = await autocompleteGooglePlaces({ query: input.query, sessionToken, category: input.category, location: input.location, signal: request.signal })
    return Response.json({ predictions }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof GooglePlacesError) return errorResponse(error)
    return errorResponse(new GooglePlacesError('provider_unavailable', 503, true))
  }
}

