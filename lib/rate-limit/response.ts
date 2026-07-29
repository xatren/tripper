import { NextResponse } from 'next/server'

/**
 * Stable 429 error shape shared across rate-limited endpoints. Mirrors the
 * { error: { code, message, retryable } } contract Google Places routes
 * already use (lib/google-places/errors.ts), plus the Retry-After header no
 * route previously set.
 */
export function rateLimitedResponse(
  retryAfterSeconds: number,
  message = 'Too many requests. Please try again later.',
): NextResponse {
  return NextResponse.json(
    { error: { code: 'rate_limited', message, retryable: true } },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
