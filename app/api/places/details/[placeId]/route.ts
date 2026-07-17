import { requirePlacesUser } from '@/lib/google-places/auth'
import { getGooglePlaceDetails, reviewsFeatureEnabled } from '@/lib/google-places/client'
import { errorResponse, GooglePlacesError } from '@/lib/google-places/errors'
import { enforcePlacesRateLimit } from '@/lib/google-places/rate-limit'
import { validatePlaceId, validateSessionToken } from '@/lib/google-places/validation'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ placeId: string }> }): Promise<Response> {
  try {
    const { rateKey } = await requirePlacesUser(request)
    enforcePlacesRateLimit(`details:${rateKey}`, 60)
    const { placeId: rawPlaceId } = await context.params
    const placeId = validatePlaceId(rawPlaceId)
    const sessionToken = validateSessionToken(new URL(request.url).searchParams.get('sessionToken'))
    const reviewsEnabled = reviewsFeatureEnabled()
    const place = await getGooglePlaceDetails(placeId, reviewsEnabled, sessionToken, request.signal)
    return Response.json({ place, reviewsEnabled }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof GooglePlacesError) return errorResponse(error)
    return errorResponse(new GooglePlacesError('provider_unavailable', 503, true))
  }
}

