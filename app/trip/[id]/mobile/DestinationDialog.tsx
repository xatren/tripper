'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { forwardSearch, type GeocodeResult } from '@/lib/mapbox/geocoding'

export interface DestinationDialogProps {
  initialQuery?: string
  onClose: () => void
  onAdd: (lat: number, lng: number, name: string, address: string) => Promise<void>
}

export function DestinationDialog({
  initialQuery = '', onClose, onAdd,
}: DestinationDialogProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null)

  // Escape closes; Tab stays trapped inside the sheet while it's open.
  useEffect(() => {
    const returnFocus = returnFocusRef.current
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !sheetRef.current) return
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocus?.focus?.()
    }
  }, [onClose])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    debounceRef.current = setTimeout(() => {
      forwardSearch(q).then((found) => {
        setResults(found)
        setIsSearching(false)
      })
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleSelect = useCallback(
    async (result: GeocodeResult) => {
      setIsSaving(true)
      await onAdd(result.lat, result.lng, result.name, result.address)
      setIsSaving(false)
      onClose()
    },
    [onAdd, onClose]
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-destination-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: '#0e0e24', border: '1px solid rgba(255,255,255,.1)', borderBottom: 'none', borderRadius: '24px 24px 0 0', padding: '20px 20px 28px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.18)' }} />
        </div>
        <div id="add-destination-title" style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Add a destination</div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <label htmlFor="destination-search" className="sr-only">Search for a destination</label>
          <input
            id="destination-search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place…"
            style={{ width: '100%', height: 48, borderRadius: 14, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#ffffff', fontSize: 15, fontFamily: 'inherit', padding: '0 14px', outline: 'none', boxSizing: 'border-box' }}
          />
          {isSearching && (
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.4)', fontSize: 12 }}>…</span>
          )}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              disabled={isSaving}
              style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 8px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,.06)', cursor: isSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: 'rgba(215,215,255,.55)', fontSize: 12 }}>{r.address}</span>
            </button>
          ))}
          {query && !isSearching && results.length === 0 && (
            <div style={{ color: 'rgba(215,215,255,.55)', fontSize: 13, padding: '16px 8px', textAlign: 'center' }}>No results</div>
          )}
        </div>
      </div>
    </div>
  )
}
