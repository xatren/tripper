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

export function renderRecapCanvas(data: RecapData, photo?: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const font = (weight: number, size: number) => `${weight} ${size}px Inter, system-ui, sans-serif`

  drawBackground(ctx)

  // header
  ctx.fillStyle = 'rgba(215,215,255,.55)'
  ctx.font = font(700, 34)
  ctx.fillText('T R I P  R E C A P', 84, 190)

  ctx.fillStyle = '#ffffff'
  ctx.font = font(800, 88)
  const title = data.title.length > 24 ? data.title.slice(0, 23) + '…' : data.title
  ctx.fillText(title, 84, 300)

  ctx.fillStyle = 'rgba(215,215,255,.6)'
  ctx.font = font(500, 40)
  ctx.fillText(data.dateRange, 84, 368)

  // route panel
  const box = { x: 84, y: 460, w: W - 168, h: 860 }
  ctx.fillStyle = 'rgba(255,255,255,.045)'
  ctx.strokeStyle = 'rgba(255,255,255,.13)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.w, box.h, 40)
  ctx.fill()
  ctx.stroke()

  if (photo) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(box.x + 16, box.y + 16, box.w - 32, 300, 26)
    ctx.clip()
    ctx.drawImage(photo, box.x + 16, box.y + 16, box.w - 32, 300)
    const scrim = ctx.createLinearGradient(0, box.y + 16, 0, box.y + 316)
    scrim.addColorStop(0, 'rgba(4,8,18,.12)')
    scrim.addColorStop(1, 'rgba(4,8,18,.82)')
    ctx.fillStyle = scrim
    ctx.fillRect(box.x + 16, box.y + 16, box.w - 32, 300)
    ctx.restore()
  }

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

  // stats row
  if (data.memoryText) {
    const text = data.memoryText.length > 70 ? `${data.memoryText.slice(0, 69)}…` : data.memoryText
    ctx.fillStyle = 'rgba(5,9,18,.76)'
    ctx.beginPath(); ctx.roundRect(box.x + 36, box.y + box.h - 132, box.w - 72, 88, 22); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = font(600, 30)
    ctx.fillText(`“${text}”`, box.x + 58, box.y + box.h - 78, box.w - 116)
  }

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
    ctx.font = font(800, 60)
    ctx.fillText(s.value + (s.suffix ? ` ${s.suffix}` : ''), x + cellW / 2, y + 95)
    ctx.fillStyle = 'rgba(215,215,255,.5)'
    ctx.font = font(600, 26)
    ctx.fillText(s.label, x + cellW / 2, y + 150)
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
    let photo: ImageBitmap | undefined
    if (data.photoUrl && typeof createImageBitmap === 'function') {
      const response = await fetch(data.photoUrl, { credentials: 'omit' })
      if (response.ok) photo = await createImageBitmap(await response.blob())
    }
    const canvas = renderRecapCanvas(data, photo)
    photo?.close()
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
