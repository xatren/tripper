'use client'

import { useCallback, useEffect, useState } from 'react'
import { tokens } from '@/components/mobile/tokens'
import { discardMediaQueueItem, discardQueueItem, listMediaQueue, listQueue, retryQueueItem, setMediaQueueState, subscribeOfflineChanges } from '@/lib/offline/db'
import { flushOfflineQueue } from '@/lib/offline/sync'
import type { OfflineMediaQueueItem, OfflineQueueItem } from '@/lib/offline/types'
import { BottomSheet } from './BottomSheet'

function label(item: OfflineQueueItem) {
  return `${item.entity.replaceAll('_', ' ')} · ${item.action.replaceAll('_', ' ')}`
}

export function OfflineStatus({ userId, tripId }: { userId: string; tripId: string }) {
  const [items, setItems] = useState<OfflineQueueItem[]>([])
  const [media, setMedia] = useState<OfflineMediaQueueItem[]>([])
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const refresh = useCallback(() => void Promise.all([listQueue(userId, tripId), listMediaQueue(userId, tripId)]).then(([changes, photos]) => { setItems(changes); setMedia(photos) }).catch(() => { setItems([]); setMedia([]) }), [tripId, userId])

  useEffect(() => {
    setOnline(navigator.onLine)
    refresh()
    const reconnect = () => { setOnline(true); void flushOfflineQueue(userId).then(refresh) }
    const disconnect = () => setOnline(false)
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', disconnect)
    if (navigator.onLine) reconnect()
    const unsubscribe = subscribeOfflineChanges(refresh)
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('offline', disconnect); unsubscribe() }
  }, [refresh, userId])

  const waiting = [...items, ...media].filter((item) => item.status === 'pending' || item.status === 'retrying').length
  if (online && items.length === 0 && media.length === 0) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open sync center" style={{ position: 'fixed', zIndex: 80, top: 'max(8px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', maxWidth: 'calc(100% - 24px)', minHeight: 38, padding: '8px 13px', borderRadius: 16, backdropFilter: 'blur(18px) saturate(1.25)', WebkitBackdropFilter: 'blur(18px) saturate(1.25)', background: 'rgba(9,15,28,.72)', border: '1px solid rgba(255,255,255,.15)', color: tokens.textPrimary, boxShadow: '0 10px 28px rgba(0,0,0,.28)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
        {online ? 'Sync needs attention' : 'Offline'} · {waiting || items.length + media.length} item{(waiting || items.length + media.length) === 1 ? '' : 's'} waiting
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} titleId="sync-center-title" title="Sync center">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.length === 0 && media.length === 0 ? <div style={{ color: tokens.textMuted, fontSize: 13 }}>Everything is synced.</div> : items.map((item) => (
            <div key={item.id} style={{ padding: 12, borderRadius: 14, background: tokens.surfaceSolid, border: `1px solid ${item.status === 'conflict' ? 'rgba(251,191,36,.4)' : tokens.glassSubtleBorder}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: tokens.textPrimary, fontSize: 12.5, fontWeight: 750, textTransform: 'capitalize' }}>{label(item)}</span>
                <span style={{ color: item.status === 'pending' || item.status === 'retrying' ? tokens.warning : tokens.danger, fontSize: 11, fontWeight: 800 }}>{item.status}</span>
              </div>
              {item.last_error && <div style={{ marginTop: 6, color: tokens.textMuted, fontSize: 11.5, lineHeight: 1.45 }}>{item.last_error}</div>}
              {(item.status === 'failed' || item.status === 'conflict' || item.status === 'blocked') && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => void retryQueueItem(item.id).then(() => flushOfflineQueue(userId)).then(refresh)} style={{ minHeight: 36, padding: '7px 12px', borderRadius: 10, border: 0, background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800 }}>Retry</button>
                  <button type="button" onClick={() => void discardQueueItem(item.id).then(refresh)} style={{ minHeight: 36, padding: '7px 12px', borderRadius: 10, border: `1px solid ${tokens.glassSubtleBorder}`, background: 'transparent', color: tokens.textSecondary, fontWeight: 700 }}>Discard</button>
                </div>
              )}
            </div>
          ))}
          {media.map((item) => (
            <div key={item.id} style={{ padding: 12, borderRadius: 14, background: tokens.surfaceSolid, border: `1px solid ${tokens.glassSubtleBorder}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: tokens.textPrimary, fontSize: 12.5, fontWeight: 750 }}>{item.file_name} · photo</span><span style={{ color: item.status === 'pending' || item.status === 'retrying' ? tokens.warning : tokens.danger, fontSize: 11, fontWeight: 800 }}>{item.status}</span></div>
              <div style={{ marginTop: 4, color: tokens.textMuted, fontSize: 11 }}>{(item.size_bytes / 1024 / 1024).toFixed(1)} MB · private media queue</div>
              {item.last_error && <div style={{ marginTop: 6, color: tokens.textMuted, fontSize: 11.5 }}>{item.last_error}</div>}
              {(item.status === 'failed' || item.status === 'blocked') && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button type="button" onClick={() => void setMediaQueueState(item.id, 'pending', null).then(() => flushOfflineQueue(userId)).then(refresh)} style={{ minHeight: 36, padding: '7px 12px', borderRadius: 10, border: 0, background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontWeight: 800 }}>Retry</button><button type="button" onClick={() => void discardMediaQueueItem(item.id).then(refresh)} style={{ minHeight: 36, padding: '7px 12px', borderRadius: 10, border: `1px solid ${tokens.glassSubtleBorder}`, background: 'transparent', color: tokens.textSecondary, fontWeight: 700 }}>Discard</button></div>}
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}
