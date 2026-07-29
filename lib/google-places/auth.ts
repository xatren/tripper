import { createClient } from '@/lib/supabase/server'
import { getTrustedClientIp } from '@/lib/request-ip'
import { GooglePlacesError } from './errors'

export async function requirePlacesUser(
  request: Request,
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string; clientIp: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new GooglePlacesError('unauthorized', 401, false)
  return { supabase, userId: user.id, clientIp: getTrustedClientIp(request.headers) }
}

