'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ItineraryItem, Stop, Trip, TripMember } from '@/types'
import { showToast } from '@/components/ui/toast'
import { tokens } from '@/components/mobile/tokens'
import { getSnapshot, removeSnapshot, subscribeOfflineChanges } from '@/lib/offline/db'
import { downloadTripSnapshot, storageEstimate } from '@/lib/offline/snapshot'
import type { TripOfflineSnapshot } from '@/lib/offline/types'
import { BottomSheet } from './BottomSheet'

export interface OfflineAccessSheetProps {
  open: boolean
  onClose: () => void
  userId: string
  trip: Trip
  members: TripMember[]
  stops: Stop[]
  itinerary: ItineraryItem[]
  routeGeometry: { lat: number; lng: number }[]
}

function bytes(value: number | null) {
  if (value === null) return 'Unknown'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function OfflineAccessSheet({ open, onClose, userId, trip, members, stops, itinerary, routeGeometry }: OfflineAccessSheetProps) {
  const [snapshot, setSnapshot] = useState<TripOfflineSnapshot | null>(null)
  const [working, setWorking] = useState(false)
  const [online, setOnline] = useState(true)
  const [estimate, setEstimate] = useState<{ usage: number | null; quota: number | null }>({ usage: null, quota: null })

  const refresh = useCallback(() => {
    void getSnapshot(userId, trip.id).then(setSnapshot).catch(() => setSnapshot(null))
    void storageEstimate().then(setEstimate).catch(() => undefined)
  }, [trip.id, userId])

  useEffect(() => {
    setOnline(navigator.onLine)
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    if (open) refresh()
    const unsubscribe = subscribeOfflineChanges(refresh)
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); unsubscribe() }
  }, [open, refresh])

  const download = async () => {
    setWorking(true)
    try {
      const saved = await downloadTripSnapshot({ userId, trip, members, stops, itinerary, routeGeometry })
      setSnapshot(saved)
      showToast('Offline ready — download verified.', 'success')
    } catch (error) {
      const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
      showToast(quota ? 'Not enough device storage. No partial download was kept.' : (error instanceof Error ? error.message : 'Download failed.'), 'error')
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    setWorking(true)
    try {
      await removeSnapshot(userId, trip.id)
      setSnapshot(null)
      showToast('Offline download and its queued changes were removed.', 'success')
    } catch {
      showToast('Could not remove the offline download. Close other Tripper tabs and retry.', 'error')
    } finally {
      setWorking(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} titleId="offline-access-title" title="Offline Access">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section style={{ padding: 14, borderRadius: 16, background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: snapshot ? tokens.success : tokens.textPrimary }}>
            {snapshot ? 'Offline ready' : 'Not downloaded'}
          </div>
          <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.55, color: tokens.textMuted }}>
            {snapshot ? `Verified ${new Date(snapshot.downloaded_at).toLocaleString()} · ${bytes(snapshot.size_bytes)}` : 'Download this trip before you lose connectivity.'}
          </div>
        </section>

        <section style={{ padding: 14, borderRadius: 16, background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: tokens.textPrimary, marginBottom: 8 }}>Included</div>
          <div style={{ fontSize: 12, lineHeight: 1.7, color: tokens.textSecondary }}>
            Trip and member summary · itinerary and stops · reservation metadata · packing and tasks · expense summary · journal text · route geometry
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.55, color: tokens.warning }}>
            Map tiles are not downloaded. Mapbox documents offline regions for its native iOS/Android SDKs, not this web app. The saved route and place list remain available.
          </div>
        </section>

        <section style={{ padding: 14, borderRadius: 16, background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}` }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: .65 }}>
            <input type="checkbox" disabled aria-describedby="sensitive-offline-note" />
            <span style={{ fontSize: 12, color: tokens.textSecondary }}>Include confirmations, receipts, and booking documents</span>
          </label>
          <div id="sensitive-offline-note" style={{ marginTop: 7, fontSize: 11.5, lineHeight: 1.5, color: tokens.textMuted }}>
            Unavailable by design. Browser storage encryption at rest cannot be guaranteed, so sensitive attachments require a future separately consented, encrypted device flow.
          </div>
        </section>

        <div style={{ fontSize: 11.5, color: tokens.textMuted }}>
          Device storage: {bytes(estimate.usage)} used{estimate.quota ? ` of ${bytes(estimate.quota)}` : ''}. Download size is verified after the atomic write.
        </div>

        <button type="button" disabled={working || !online} onClick={() => void download()} style={{ minHeight: 46, border: 0, borderRadius: 14, background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800, cursor: working ? 'wait' : 'pointer', opacity: working || !online ? .55 : 1 }}>
          {working ? 'Working…' : snapshot ? 'Update download' : 'Download trip'}
        </button>
        {snapshot && (
          <button type="button" disabled={working} onClick={() => void remove()} style={{ minHeight: 44, borderRadius: 14, background: 'transparent', border: '1px solid rgba(248,113,113,.35)', color: tokens.danger, fontWeight: 750, cursor: 'pointer' }}>
            Remove download
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
