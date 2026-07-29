/**
 * Trusted client-IP resolution for rate limiting.
 *
 * Takes a Headers object (works for both a Web `Request.headers` and
 * Next.js's `await headers()`, which implement the same interface) rather
 * than raw header strings, so callers can't be tempted to hand it an
 * unvalidated value.
 *
 * Only trusts headers Vercel itself sets at the edge and overwrites on
 * every request (`x-vercel-forwarded-for`, falling back to `x-real-ip`) —
 * these cannot be spoofed by the client. Everywhere else (local dev, any
 * non-Vercel host) this repo has no configured trusted proxy, so
 * `x-forwarded-for` and friends are attacker-controlled and must not be
 * trusted; this returns null instead, which callers collapse into a shared
 * 'unknown' rate-limit bucket.
 */
export function getTrustedClientIp(headers: Headers): string | null {
  if (!process.env.VERCEL) return null

  const forwarded = headers.get('x-vercel-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first

  const realIp = headers.get('x-real-ip')?.trim()
  return realIp || null
}
