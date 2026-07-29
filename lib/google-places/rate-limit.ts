import type { createClient } from '@/lib/supabase/server'
import { GooglePlacesError } from './errors'

export type PlacesRateLimitScope =
  | 'places_search_user'
  | 'places_autocomplete_user'
  | 'places_details_user'
  | 'places_photo_user'

/**
 * Shared, multi-instance-safe rate limit backed by the Postgres
 * check_rate_limit RPC (see supabase/migrations/20260728020000_shared_rate_limiting.sql).
 * Replaces the previous in-memory Map, which only protected a single
 * serverless instance and reset on every cold start.
 *
 * Keyed by userId only ("user-first quota"), not user+IP: a user's quota no
 * longer depends on who else shares their IP (NAT), and rotating IPs can't
 * be used to evade the limit. client_ip is still recorded on the event row
 * for later abuse analysis, just not part of the counting key.
 */
export async function checkPlacesRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: PlacesRateLimitScope,
  userId: string,
  clientIp: string | null,
): Promise<void> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_scope: scope,
    p_identity_key: userId,
    p_client_ip: clientIp,
    p_user_id: userId,
  })

  if (error) {
    // Fail open: an abuse-prevention outage must not take down the feature.
    console.error('checkPlacesRateLimit: RPC error, failing open', error)
    return
  }

  if (!data?.allowed) {
    throw new GooglePlacesError('rate_limited', 429, true, Number(data?.retry_after_seconds) || 60)
  }
}

