// Story-format (1080×1920) trip recap card rendered on a canvas, for sharing
// to Instagram stories & friends. Pure client-side: draw → PNG blob →
// navigator.share (with file support) or download fallback.

import type { DistanceUnit } from './settings'

export interface RecapData {
  title: string
  dateRange: string
  routePath: { lat: number; lng: number }[]
  stops: { lat: number; lng: number; name: string }[]
  distance?: number
  distanceUnit?: DistanceUnit
  durationHours?: number
  days?: number
  plannedCount?: number
  visitedCount?: number
  photoCount?: number
  journalCount?: number
  expenseCount?: number
  memoryText?: string
  photoUrl?: string
}

const W = 1080
const H = 1920
const ACCENT = '#f5a623'
const ACCENT_LIGHT = '#f8c04a'
const ROUTE_BOX = { x: 84, y: 460, w: W - 168, h: 860 }

// The canvas needs a font family it can actually resolve — next/font hashes
// "Inter" into a scoped CSS variable, so the literal string "Inter" never
// matches a loaded face and canvas silently falls back to the OS default
// (different weight/metrics per platform). We load real Inter faces under a
// private family name so the exported image looks the same everywhere.
const CANVAS_FONT_FAMILY = 'Tripper Recap Inter'
let fontLoadPromise: Promise<string> | null = null

async function ensureCanvasFont(): Promise<string> {
  const fallback = 'system-ui, sans-serif'
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return fallback
  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      try {
        const cssResponse = await fetch(
          'https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap',
        )
        const css = await cssResponse.text()
        const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\) format\('woff2'\)/g)]
        if (faces.length === 0) return fallback
        await Promise.all(
          faces.map(async ([, weight, url]) => {
            const face = new FontFace(CANVAS_FONT_FAMILY, `url(${url})`, { weight })
            document.fonts.add(await face.load())
          }),
        )
        await document.fonts.ready
        return `${CANVAS_FONT_FAMILY}, ${fallback}`
      } catch {
        return fallback
      }
    })()
  }
  return fontLoadPromise
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, W * 0.7, H)
  grad.addColorStop(0, '#0c0c26')
  grad.addColorStop(0.55, '#0a1220')
  grad.addColorStop(1, '#071018')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // ambient glows
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  glow(W * 0.5, 140, 420, 'rgba(245,140,0,.16)')
  glow(60, H * 0.55, 380, 'rgba(90,0,210,.14)')
  glow(W - 60, H * 0.72, 360, 'rgba(0,100,160,.12)')
}

/** Draws text with uniform tracking (canvas `letterSpacing` support is inconsistent across browsers). */
function fillTrackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cursor = x
  for (const char of text) {
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + tracking
  }
}

function downsample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points]
  const step = (points.length - 1) / (max - 1)
  const result: T[] = []
  for (let i = 0; i < max; i++) result.push(points[Math.round(i * step)])
  return result
}

function encodeNumber(input: number): string {
  let num = input
  let encoded = ''
  while (num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63)
    num >>= 5
  }
  return encoded + String.fromCharCode(num + 63)
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num << 1
  if (num < 0) sgnNum = ~sgnNum
  return encodeNumber(sgnNum)
}

/** Google polyline algorithm, precision 5 — the format Mapbox's Static Images API expects for path overlays. */
function encodePolyline(points: readonly { lat: number; lng: number }[]): string {
  let lastLat = 0
  let lastLng = 0
  let result = ''
  for (const { lat, lng } of points) {
    const lat5 = Math.round(lat * 1e5)
    const lng5 = Math.round(lng * 1e5)
    result += encodeSignedNumber(lat5 - lastLat) + encodeSignedNumber(lng5 - lastLng)
    lastLat = lat5
    lastLng = lng5
  }
  return result
}

/**
 * Renders the route on a real Mapbox basemap (dark style, matching the in-app map) with the
 * path and numbered stop pins baked in server-side — this keeps the route pixel-perfectly
 * aligned to the roads/coastline under it, which client-side lat/lng→pixel projection can't
 * guarantee. Falls back to `undefined` (caller draws the old abstract card) when offline or
 * unconfigured.
 */
async function fetchRouteBasemap(data: RecapData): Promise<ImageBitmap | undefined> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || typeof createImageBitmap !== 'function') return undefined
  const pathPoints = data.routePath.length >= 2 ? data.routePath : data.stops
  if (pathPoints.length < 2) return undefined

  const width = Math.min(1280, Math.round(ROUTE_BOX.w))
  const height = Math.min(1280, Math.round(ROUTE_BOX.h))
  const encodedPath = encodeURIComponent(encodePolyline(downsample(pathPoints, 200)))
  const pins = data.stops.slice(0, 50).map((stop, i) => {
    const color = i === 0 || i === data.stops.length - 1 ? ACCENT_LIGHT.slice(1) : 'ffffff'
    const label = Math.min(i + 1, 99)
    return `pin-s-${label}+${color}(${stop.lng.toFixed(5)},${stop.lat.toFixed(5)})`
  })
  const overlays = [`path-5+${ACCENT.slice(1)}-0.85(${encodedPath})`, ...pins].join(',')
  const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlays}/auto/${width}x${height}?padding=70&attribution=false&logo=false&access_token=${token}`

  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    return await createImageBitmap(await response.blob())
  } catch {
    return undefined
  }
}

function projectRoute(data: RecapData, box: { x: number; y: number; w: number; h: number }) {
  const pts = data.routePath.length >= 2 ? data.routePath : data.stops
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const spanLat = Math.max(maxLat - minLat, 0.0001)
  const spanLng = Math.max(maxLng - minLng, 0.0001)
  const pad = 0.08
  return (p: { lat: number; lng: number }) => ({
    x: box.x + box.w * (pad + (1 - 2 * pad) * ((p.lng - minLng) / spanLng)),
    y: box.y + box.h * (pad + (1 - 2 * pad) * (1 - (p.lat - minLat) / spanLat)),
  })
}

interface RecapAssets {
  photo?: ImageBitmap
  basemap?: ImageBitmap
  fontFamily: string
}

async function loadRecapAssets(data: RecapData): Promise<RecapAssets> {
  const [fontFamily, basemap, photo] = await Promise.all([
    ensureCanvasFont(),
    fetchRouteBasemap(data),
    (async () => {
      if (!data.photoUrl || typeof createImageBitmap !== 'function') return undefined
      try {
        const response = await fetch(data.photoUrl, { credentials: 'omit' })
        if (!response.ok) return undefined
        return await createImageBitmap(await response.blob())
      } catch {
        return undefined
      }
    })(),
  ])
  return { fontFamily, basemap, photo }
}

export function renderRecapCanvas(data: RecapData, assets: RecapAssets): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const font = (weight: number, size: number) => `${weight} ${size}px ${assets.fontFamily}`

  drawBackground(ctx)

  // header
  ctx.fillStyle = 'rgba(215,215,255,.55)'
  ctx.font = font(700, 32)
  fillTrackedText(ctx, 'TRIP RECAP', 84, 190, 10)

  ctx.fillStyle = '#ffffff'
  ctx.font = font(800, 88)
  const title = data.title.length > 24 ? data.title.slice(0, 23) + '…' : data.title
  ctx.fillText(title, 84, 300)

  ctx.fillStyle = 'rgba(215,215,255,.6)'
  ctx.font = font(500, 40)
  ctx.fillText(data.dateRange, 84, 368)

  // route panel
  const box = ROUTE_BOX
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.w, box.h, 40)
  ctx.clip()

  if (assets.basemap) {
    ctx.drawImage(assets.basemap, box.x, box.y, box.w, box.h)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.045)'
    ctx.fillRect(box.x, box.y, box.w, box.h)
  }

  if (assets.photo) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(box.x + 16, box.y + 16, box.w - 32, 300, 26)
    ctx.clip()
    ctx.drawImage(assets.photo, box.x + 16, box.y + 16, box.w - 32, 300)
    const scrim = ctx.createLinearGradient(0, box.y + 16, 0, box.y + 316)
    scrim.addColorStop(0, 'rgba(4,8,18,.12)')
    scrim.addColorStop(1, 'rgba(4,8,18,.82)')
    ctx.fillStyle = scrim
    ctx.fillRect(box.x + 16, box.y + 16, box.w - 32, 300)
    ctx.restore()
  }

  if (!assets.basemap) {
    // Vector fallback: draws the route ourselves when the real map couldn't be fetched.
    const project = projectRoute(data, box)
    if (data.routePath.length >= 2) {
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 7
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(245,140,0,.6)'
      ctx.shadowBlur = 24
      ctx.beginPath()
      data.routePath.forEach((p, i) => {
        const { x, y } = project(p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    data.stops.forEach((s, i) => {
      const { x, y } = project(s)
      ctx.fillStyle = '#0c0c26'
      ctx.beginPath()
      ctx.arc(x, y, 22, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = i === 0 || i === data.stops.length - 1 ? ACCENT_LIGHT : '#ffffff'
      ctx.beginPath()
      ctx.arc(x, y, 15, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0c0c26'
      ctx.font = font(800, 20)
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), x, y + 7)
      ctx.textAlign = 'left'
    })
  }

  // bottom scrim so the quote card stays legible over map or photo detail
  const bottomScrim = ctx.createLinearGradient(0, box.y + box.h - 200, 0, box.y + box.h)
  bottomScrim.addColorStop(0, 'rgba(4,8,18,0)')
  bottomScrim.addColorStop(1, 'rgba(4,8,18,.55)')
  ctx.fillStyle = bottomScrim
  ctx.fillRect(box.x, box.y + box.h - 200, box.w, 200)

  ctx.strokeStyle = 'rgba(255,255,255,.13)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.w, box.h, 40)
  ctx.stroke()
  ctx.restore()

  if (data.memoryText) {
    const text = data.memoryText.length > 70 ? `${data.memoryText.slice(0, 69)}…` : data.memoryText
    ctx.fillStyle = 'rgba(5,9,18,.76)'
    ctx.beginPath(); ctx.roundRect(box.x + 36, box.y + box.h - 132, box.w - 72, 88, 22); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = font(600, 30)
    ctx.fillText(`"${text}"`, box.x + 58, box.y + box.h - 78, box.w - 116)
  }

  if (assets.basemap) {
    ctx.fillStyle = 'rgba(215,215,255,.45)'
    ctx.font = font(500, 20)
    ctx.textAlign = 'right'
    ctx.fillText('Map © Mapbox © OpenStreetMap', box.x + box.w - 20, box.y + box.h - 16)
    ctx.textAlign = 'left'
  }

  // stats row
  const stats = [
    data.distance != null ? { value: `${Math.round(data.distance)}`, suffix: data.distanceUnit ?? '', label: 'DISTANCE' } : null,
    data.durationHours != null ? { value: `${Math.round(data.durationHours)}`, suffix: 'h', label: 'DRIVE TIME' } : null,
    data.days != null ? { value: `${data.days}`, suffix: '', label: 'DAYS' } : null,
    data.visitedCount != null ? { value: `${data.visitedCount}/${data.plannedCount ?? data.visitedCount}`, suffix: '', label: 'VISITED' } : null,
    data.photoCount != null ? { value: `${data.photoCount}`, suffix: '', label: 'PHOTOS' } : null,
    data.journalCount != null ? { value: `${data.journalCount}`, suffix: '', label: 'MEMORIES' } : null,
    data.expenseCount != null ? { value: `${data.expenseCount}`, suffix: '', label: 'EXPENSES' } : null,
  ].filter((stat): stat is { value: string; suffix: string; label: string } => stat !== null).slice(0, 4)
  const cellW = (W - 168 - Math.max(0, stats.length - 1) * 24) / Math.max(1, stats.length)
  stats.forEach((s, i) => {
    const x = 84 + i * (cellW + 24)
    const y = 1400
    ctx.fillStyle = 'rgba(255,255,255,.04)'
    ctx.strokeStyle = 'rgba(255,255,255,.13)'
    ctx.beginPath()
    ctx.roundRect(x, y, cellW, 190, 28)
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = font(800, 56)
    ctx.fillText(s.value + (s.suffix ? ` ${s.suffix}` : ''), x + cellW / 2, y + 95, cellW - 16)
    ctx.fillStyle = 'rgba(215,215,255,.5)'
    ctx.font = font(600, 24)
    ctx.fillText(s.label, x + cellW / 2, y + 150, cellW - 16)
    ctx.textAlign = 'left'
  })

  // branding
  ctx.fillStyle = ACCENT
  ctx.font = font(800, 44)
  ctx.textAlign = 'center'
  ctx.fillText('Tripper', W / 2, 1760)
  ctx.fillStyle = 'rgba(215,215,255,.45)'
  ctx.font = font(500, 30)
  ctx.fillText('Plan your next road trip', W / 2, 1812)
  ctx.textAlign = 'left'

  return canvas
}

/** Renders the recap and opens the native share sheet (or downloads the PNG). */
async function shareTextFallback(data: RecapData): Promise<'shared' | 'downloaded' | 'failed'> {
  const text = [data.title, data.dateRange, data.visitedCount != null ? `${data.visitedCount}/${data.plannedCount ?? data.visitedCount} visited` : null].filter(Boolean).join(' · ')
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: data.title, text })
      return 'shared'
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'trip-recap.txt'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    return 'downloaded'
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'shared' : 'failed'
  }
}

export async function shareTripRecap(data: RecapData): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const assets = await loadRecapAssets(data)
    const canvas = renderRecapCanvas(data, assets)
    assets.photo?.close()
    assets.basemap?.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return shareTextFallback(data)
    const file = new File([blob], 'trip-recap.png', { type: 'image/png' })
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: data.title })
      return 'shared'
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trip-recap.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return 'downloaded'
  } catch (err) {
    // AbortError = user closed the share sheet; treat as silent success
    if (err instanceof Error && err.name === 'AbortError') return 'shared'
    return shareTextFallback(data)
  }
}
