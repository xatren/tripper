export type OtherDayVisibility = 'hidden' | 'dimmed'

export interface MapTimelineEntry {
  key: string
  id: string
  source: 'item' | 'stop'
  itemType: string
  title: string
  address: string | null
  lat: number | null
  lng: number | null
}

export interface MapTimelineDay {
  date: string | null
  dayNumber: number | null
  entries: MapTimelineEntry[]
}

export interface TimelineMapPoint {
  id: string
  lat: number
  lng: number
  title: string
  subtitle?: string
  itemType: string
  dayId: string
  emphasis: 'strong' | 'dimmed'
  order: number
}

export function timelineDayId(day: Pick<MapTimelineDay, 'date' | 'dayNumber'>): string {
  return day.date ?? `n${day.dayNumber ?? 0}`
}

/** Builds the small, day-scoped marker set used by the plan map. */
export function buildTimelineMapPoints(
  days: MapTimelineDay[],
  selectedDayId: string | null,
  otherDays: OtherDayVisibility,
): TimelineMapPoint[] {
  const result: TimelineMapPoint[] = []
  for (const day of days) {
    const dayId = timelineDayId(day)
    const selected = selectedDayId === null || dayId === selectedDayId
    if (!selected && otherDays === 'hidden') continue
    let order = 0
    for (const entry of day.entries) {
      if (entry.lat == null || entry.lng == null) continue
      order += 1
      result.push({
        id: entry.key,
        lat: entry.lat,
        lng: entry.lng,
        title: entry.title,
        subtitle: entry.address ?? undefined,
        itemType: entry.itemType,
        dayId,
        emphasis: selected ? 'strong' : 'dimmed',
        order,
      })
    }
  }
  return result
}

/** Selection is preserved across view changes and cleared only when its row disappears. */
export function cleanSelectedItemId(selectedItemId: string | null, validIds: Iterable<string>): string | null {
  if (!selectedItemId) return null
  return new Set(validIds).has(selectedItemId) ? selectedItemId : null
}

/** Mapbox also emits camera events for flyTo; only original DOM events are user gestures. */
export function isUserCameraEvent(event: { originalEvent?: unknown } | null | undefined): boolean {
  return Boolean(event?.originalEvent)
}

export type MapAvailability = 'ready' | 'no-token' | 'offline' | 'error'

export function getMapAvailability(input: { hasToken: boolean; online: boolean; failed: boolean }): MapAvailability {
  if (!input.hasToken) return 'no-token'
  if (!input.online) return 'offline'
  if (input.failed) return 'error'
  return 'ready'
}
