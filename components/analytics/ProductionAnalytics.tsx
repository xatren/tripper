'use client'

import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/next'

export function ProductionAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(
      window.location.hostname !== 'localhost'
      && window.location.hostname !== '127.0.0.1'
    )
  }, [])

  return enabled ? <Analytics /> : null
}
