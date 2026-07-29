import { requirePlacesUser } from '@/lib/google-places/auth'
import { getGooglePlacePhoto } from '@/lib/google-places/client'
import { errorResponse, GooglePlacesError } from '@/lib/google-places/errors'
import { checkPlacesRateLimit } from '@/lib/google-places/rate-limit'
import { validatePhotoParams } from '@/lib/google-places/validation'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const { supabase, userId, clientIp } = await requirePlacesUser(request)
    await checkPlacesRateLimit(supabase, 'places_photo_user', userId, clientIp)
    const { reference, maxWidth } = validatePhotoParams(new URL(request.url).searchParams)
    const upstream = await getGooglePlacePhoto(reference, maxWidth, request.signal)
    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/') || !upstream.body) throw new GooglePlacesError('provider_unavailable', 502, true)
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof GooglePlacesError) return errorResponse(error)
    return errorResponse(new GooglePlacesError('provider_unavailable', 503, true))
  }
}
