'use client'

import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'
import { RouteReplayMap, type RouteReplayPoint } from './RouteReplayMap'

const ACCENT = '#f5a623'
const GLASS_BORDER = 'rgba(255,255,255,.13)'

export interface TripSummaryHeroProps {
  title: string
  dateRange: string
  points: RouteReplayPoint[]
  routePath: { lat: number; lng: number }[]
  distanceKm: number
  durationHours: number
  days: number
}

function useCountUp(target: number, durationMs = 1400, delayMs = 300) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const controls = animate(0, target, {
      duration: durationMs / 1000,
      delay: delayMs / 1000,
      ease: 'easeOut',
      onUpdate: (v) => setValue(v),
    })
    return () => controls.stop()
  }, [target, durationMs, delayMs])
  return value
}

export function TripSummaryHero({ title, dateRange, points, routePath, distanceKm, durationHours, days }: TripSummaryHeroProps) {
  const distance = useCountUp(distanceKm)
  const duration = useCountUp(durationHours, 1400, 500)
  const dayCount = useCountUp(days, 1000, 700)

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 24,
        overflow: 'hidden',
        border: `1px solid ${GLASS_BORDER}`,
        background: 'linear-gradient(160deg, #0c0c26 0%, #0a1220 55%, #071018 100%)',
        boxShadow: '0 12px 40px rgba(0,0,0,.35)',
      }}
    >
      <div style={{ position: 'relative', padding: '20px 20px 14px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(215,215,255,.55)', letterSpacing: '.08em' }}>
          TRIP RECAP
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', marginTop: 4 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'rgba(215,215,255,.6)', marginTop: 2, fontWeight: 500 }}>{dateRange}</div>
      </div>

      <RouteReplayMap points={points} routePath={routePath} height={220} />

      {/* stat row */}
      <div style={{ display: 'flex', padding: '16px 20px 20px', gap: 8 }}>
        <StatCell label="DISTANCE" value={`${Math.round(distance)}`} suffix="km" />
        <StatCell label="DRIVE TIME" value={`${Math.round(duration)}`} suffix="h" />
        <StatCell label="DAYS" value={`${Math.round(dayCount)}`} suffix="" />
        <StatCell label="STOPS" value={`${points.length}`} suffix="" />
      </div>
    </div>
  )
}

function StatCell({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 4px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: `1px solid ${GLASS_BORDER}` }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
        {value}
        {suffix && <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, marginLeft: 2 }}>{suffix}</span>}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(215,215,255,.5)', letterSpacing: '.05em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}
