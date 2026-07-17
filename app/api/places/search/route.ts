import { errorResponse, GooglePlacesError } from '@/lib/google-places/errors'
import { requirePlacesUser } from '@/lib/google-places/auth'
import { enforcePlacesRateLimit } from '@/lib/google-places/rate-limit'
import { searchGooglePlaces } from '@/lib/google-places/client'
import { validateSearchParams } from '@/lib/google-places/validation'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const { rateKey } = await requirePlacesUser(request)
    enforcePlacesRateLimit(`search:${rateKey}`, 45)
    const input = validateSearchParams(new URL(request.url).searchParams)
    const results = await searchGooglePlaces({ ...input, signal: request.signal })
    return Response.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof GooglePlacesError) return errorResponse(error)
    return errorResponse(new GooglePlacesError('provider_unavailable', 503, true))
  }
}

