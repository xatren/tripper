// Open-Meteo daily forecast (free, no API key). Forecasts reach ~16 days out;
// beyond that we return null and the UI hides the weather chip instead of lying.

export type WeatherKind = 'sunny' | 'partly' | 'cloudy' | 'rainy' | 'snowy'

export interface DayWeather {
  kind: WeatherKind
  high: number
  low: number
}

/** WMO weather interpretation codes → the app's icon set. */
function kindFromWmoCode(code: number): WeatherKind {
  if (code === 0) return 'sunny'
  if (code <= 2) return 'partly'
  if (code === 3 || code === 45 || code === 48) return 'cloudy'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowy'
  return 'rainy' // drizzle, rain, showers, thunderstorms
}

const MAX_FORECAST_DAYS = 15

function daysFromToday(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(iso + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

/**
 * Forecast for one location on one date. Returns null when the date is in the
 * past, beyond the forecast horizon, or the request fails.
 */
export async function fetchDayWeather(lat: number, lng: number, date: string): Promise<DayWeather | null> {
  const offset = daysFromToday(date)
  if (offset < 0 || offset > MAX_FORECAST_DAYS) return null
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const code = data?.daily?.weather_code?.[0]
    const high = data?.daily?.temperature_2m_max?.[0]
    const low = data?.daily?.temperature_2m_min?.[0]
    if (typeof code !== 'number' || typeof high !== 'number' || typeof low !== 'number') return null
    return { kind: kindFromWmoCode(code), high: Math.round(high), low: Math.round(low) }
  } catch {
    return null
  }
}

/** Batch helper: one fetch per stop, resolved into a map keyed by the given ids. */
export async function fetchWeatherForStops(
  stops: { id: string; lat: number; lng: number; date: string | null }[]
): Promise<Record<string, DayWeather | null>> {
  const entries = await Promise.all(
    stops.map(async (s) => [s.id, s.date ? await fetchDayWeather(s.lat, s.lng, s.date) : null] as const)
  )
  return Object.fromEntries(entries)
}
