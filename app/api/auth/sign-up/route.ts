import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { USERNAME_PATTERN, usernameToEmail } from '@/lib/auth/username'
import { getTrustedClientIp } from '@/lib/request-ip'
import { rateLimitedResponse } from '@/lib/rate-limit/response'

export async function POST(request: Request) {
  const clientIp = getTrustedClientIp(request.headers)

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Account registration is not configured' }, { status: 503 })
  }

  const { data: rateLimit, error: rateLimitError } = await admin.rpc('check_rate_limit', {
    p_scope: 'signup_ip',
    p_identity_key: clientIp ?? 'unknown',
    p_client_ip: clientIp,
    p_user_id: null,
  })
  // Fail open on RPC errors: an abuse-prevention outage must not block signup.
  if (rateLimitError) console.error('sign-up rate limit check failed, failing open', rateLimitError)
  if (!rateLimitError && !rateLimit?.allowed) {
    return rateLimitedResponse(Number(rateLimit?.retry_after_seconds) || 3600, 'Too many signup attempts. Please try again later.')
  }

  let body: { username?: unknown; password?: unknown }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3–30 characters and use only letters, numbers, or underscores' },
      { status: 400 },
    )
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  try {
    const { error } = await admin.auth.admin.createUser({
      email: usernameToEmail(username),
      password,
      email_confirm: true,
      user_metadata: {
        username: username.toLowerCase(),
        display_name: username,
      },
    })

    if (error) {
      const duplicate = /already|registered|exists/i.test(error.message)
      return NextResponse.json(
        { error: duplicate ? 'This username is already taken' : 'Could not create account' },
        { status: duplicate ? 409 : 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Account registration is not configured' }, { status: 503 })
  }
}
