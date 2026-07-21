export const PRESENCE_STALE_MS = 45_000

export function isPresenceFresh(lastSeenAt: string, nowMs: number, staleMs = PRESENCE_STALE_MS) {
  const seenAt = Date.parse(lastSeenAt)
  return Number.isFinite(seenAt) && nowMs - seenAt <= staleMs
}
