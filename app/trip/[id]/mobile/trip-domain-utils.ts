import type { Stop, Trip } from '@/types'

export interface StopSchedule {
  arrival: string | null
  departure: string | null
  /** 1-based trip day the stay starts / ends on. */
  dayStart: number
  dayEnd: number
}

export const BOOKING_PARTNERS = ['Booking.com', 'Expedia', 'Airbnb', 'Hostelworld', 'Agoda'] as const
export type BookingPartner = (typeof BOOKING_PARTNERS)[number]

export function formatHeaderDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return ''
  if (start && end) return `${formatHeaderDate(start)} – ${formatHeaderDate(end)}`
  return formatHeaderDate((start || end) as string)
}

export function tripTitle(trip: Trip, stops: Stop[]) {
  if (stops.length >= 2) return `${stops[0].name} → ${stops[stops.length - 1].name}`
  if (stops.length === 1) return stops[0].name
  return trip.title
}

export function formatDayChip(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function computeStopSchedule(
  startDate: string | null | undefined,
  stops: Stop[],
  nights: Record<string, number>,
): StopSchedule[] {
  let cursor = startDate ?? null
  let day = 1
  return stops.map((stop) => {
    const stopNights = Math.max(1, nights[stop.id] ?? 1)
    const arrival = cursor
    const departure = cursor ? addDays(cursor, stopNights) : null
    const entry = { arrival, departure, dayStart: day, dayEnd: day + stopNights - 1 }
    cursor = departure
    day += stopNights
    return entry
  })
}

export function formatMoney(amount: number) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function bookingUrl(partner: BookingPartner, stop: Stop, arrival?: string | null, departure?: string | null) {
  const city = encodeURIComponent(stop.name)
  const checkin = arrival ?? stop.arrival_date ?? ''
  const checkout = departure ?? stop.departure_date ?? ''
  switch (partner) {
    case 'Booking.com':
      return `https://www.booking.com/searchresults.html?ss=${city}${checkin ? `&checkin=${checkin}` : ''}${checkout ? `&checkout=${checkout}` : ''}`
    case 'Expedia':
      return `https://www.expedia.com/Hotel-Search?destination=${city}`
    case 'Airbnb':
      return `https://www.airbnb.com/s/${city}/homes${checkin && checkout ? `?checkin=${checkin}&checkout=${checkout}` : ''}`
    case 'Hostelworld':
      return `https://www.hostelworld.com/search?search_keywords=${city}`
    case 'Agoda':
      return `https://www.agoda.com/search?city=${city}${checkin ? `&checkIn=${checkin}` : ''}${checkout ? `&checkOut=${checkout}` : ''}`
  }
}

export function totalNights(trip: Trip) {
  if (!trip.start_date || !trip.end_date) return 0
  const milliseconds = new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()
  return Math.max(0, Math.round(milliseconds / 86_400_000))
}
