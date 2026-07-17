import { GooglePlacesError } from './errors'

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** Best-effort per-instance protection. Production multi-instance deployments should use a shared limiter. */
export function enforcePlacesRateLimit(key: string, limit: number, windowMs = 60_000): void {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  if (current.count >= limit) throw new GooglePlacesError('rate_limited', 429, true)
  current.count += 1
  if (buckets.size > 2_000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey)
  }
}

