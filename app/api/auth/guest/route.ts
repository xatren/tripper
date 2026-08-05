import { randomBytes, randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { usernameToEmail } from '@/lib/auth/username'
import { getTrustedClientIp } from '@/lib/request-ip'
import { rateLimitedResponse } from '@/lib/rate-limit/response'
import { GUEST_LOGIN_ENABLED } from '@/lib/auth/guest'

/**
 * Test-only endpoint: mints a throwaway account with full user privileges so a
 * tester can exercise the app without registering. Disabled unless
 * NEXT_PUBLIC_ENABLE_GUEST_LOGIN=true, so production never exposes it.
 */
export async function POST(request: Request) {
  if (!GUEST_LOGIN_ENABLED) {
    return NextResponse.json({ error: 'Guest access is disabled' }, { status: 404 })
  }

  const clientIp = getTrustedClientIp(request.headers)

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Guest access is not configured' }, { status: 503 })
  }

  // Reuse the signup bucket: a guest session is a real account creation.
  const { data: rateLimit, error: rateLimitError } = await admin.rpc('check_rate_limit', {
    p_scope: 'signup_ip',
    p_identity_key: clientIp ?? 'unknown',
    p_client_ip: clientIp,
    p_user_id: null,
  })
  // Fail open on RPC errors, matching the sign-up route.
  if (rateLimitError) console.error('guest rate limit check failed, failing open', rateLimitError)
  if (!rateLimitError && !rateLimit?.allowed) {
    return rateLimitedResponse(
      Number(rateLimit?.retry_after_seconds) || 3600,
      'Too many guest sessions from this device. Please try again later.',
    )
  }

  const suffix = randomBytes(6).toString('hex')
  const username = `guest_${suffix}`
  const password = randomUUID()

  try {
    const { error } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password,
      email_confirm: true,
      user_metadata: {
        username,
        display_name: `Guest ${suffix.slice(0, 4)}`,
        is_guest: true,
      },
    })

    if (error) {
      console.error('guest account creation failed', error)
      return NextResponse.json({ error: 'Could not start a guest session' }, { status: 400 })
    }

    return NextResponse.json({ username, password })
  } catch {
    return NextResponse.json({ error: 'Guest access is not configured' }, { status: 503 })
  }
}
