// Client-side iCalendar (.ics) export — one all-day event per stop, using the
// derived arrival/departure dates. Zero server involvement.

interface IcsStop {
  name: string
  address?: string | null
  arrival: string // YYYY-MM-DD
  departure: string // YYYY-MM-DD (checkout day; DTEND is exclusive so used as-is)
}

function icsDate(iso: string): string {
  return iso.replaceAll('-', '')
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildTripIcs(tripTitle: string, stops: IcsStop[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const events = stops
    .map((s, i) => {
      return [
        'BEGIN:VEVENT',
        `UID:tripper-${now}-${i}@tripper.app`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${icsDate(s.arrival)}`,
        `DTEND;VALUE=DATE:${icsDate(s.departure)}`,
        `SUMMARY:${escapeText(`${tripTitle}: ${s.name}`)}`,
        s.address ? `LOCATION:${escapeText(s.address)}` : null,
        'END:VEVENT',
      ]
        .filter(Boolean)
        .join('\r\n')
    })
    .join('\r\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tripper//Road Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Triggers a browser download of the generated calendar. */
export function downloadTripIcs(tripTitle: string, stops: IcsStop[]) {
  const ics = buildTripIcs(tripTitle, stops)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${tripTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'trip'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
