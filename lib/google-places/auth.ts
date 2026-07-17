import { createClient } from '@/lib/supabase/server'
import { GooglePlacesError } from './errors'

export async function requirePlacesUser(request: Request): Promise<{ userId: string; rateKey: string }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new GooglePlacesError('unauthorized', 401, false)
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return { userId: user.id, rateKey: `${user.id}:${forwarded ?? 'unknown'}` }
}

