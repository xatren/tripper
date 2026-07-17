export interface Coordinate { lat: number; lng: number }

export function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function isValidCoordinate(value: Coordinate): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && value.lat >= -90 && value.lat <= 90 && value.lng >= -180 && value.lng <= 180
}

export function normalizeTitle(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const radius = 6_371_000
  const radians = (degrees: number) => degrees * Math.PI / 180
  const lat = radians(b.lat - a.lat)
  const lng = radians(b.lng - a.lng)
  const x = Math.sin(lat / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(x))
}

export interface DuplicateCandidate extends Coordinate {
  provider: 'google' | 'mapbox' | null
  externalId: string | null
  title: string
}

export interface DuplicateSource {
  id: string
  kind: 'stop' | 'item'
  provider: string | null
  externalId: string | null
  title: string
  localDate: string | null
  lat: number | null
  lng: number | null
}

export interface DuplicateMatch {
  id: string
  kind: 'stop' | 'item'
  title: string
  localDate: string | null
  reason: 'provider_id' | 'name_and_distance'
}

export function findPlaceDuplicate(candidate: DuplicateCandidate, sources: DuplicateSource[]): DuplicateMatch | null {
  const normalized = normalizeTitle(candidate.title)
  for (const source of sources) {
    const providerMatch = !!candidate.provider && !!candidate.externalId
      && source.provider === candidate.provider && source.externalId === candidate.externalId
    const fallbackMatch = normalized.length > 0 && normalizeTitle(source.title) === normalized
      && source.lat != null && source.lng != null
      && distanceMeters(candidate, { lat: source.lat, lng: source.lng }) < 75
    if (providerMatch || fallbackMatch) {
      return { id: source.id, kind: source.kind, title: source.title, localDate: source.localDate, reason: providerMatch ? 'provider_id' : 'name_and_distance' }
    }
  }
  return null
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value.startsWith('//') ? `https:${value}` : value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch { return null }
}

export function safeHttpsUrl(value: string | null | undefined): string | null {
  const url = safeHttpUrl(value)
  return url?.startsWith('https:') ? url : null
}

export function safeTelUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/[^+\d()\-.\s]/g, '').trim()
  return normalized ? `tel:${normalized.replace(/[()\-.\s]/g, '')}` : null
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return 'Flexible'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export function tripDayOptions(startDate: string | null, endDate: string | null): Array<{ value: string; label: string }> {
  if (!startDate || !endDate) return []
  const start = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${endDate}T12:00:00Z`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return []
  const output: Array<{ value: string; label: string }> = []
  for (let cursor = new Date(start), day = 1; cursor <= end && day <= 366; cursor.setUTCDate(cursor.getUTCDate() + 1), day += 1) {
    const value = cursor.toISOString().slice(0, 10)
    output.push({ value, label: `Day ${day} · ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(cursor)}` })
  }
  return output
}

