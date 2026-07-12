'use client'

import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useMotionValue, animate } from 'framer-motion'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { SegmentedTabs } from '@/components/ui/segmented-tabs'
import { createClient } from '@/lib/supabase/client'
import { TripboxMap } from '@/components/map/mapbox/TripboxMap'
import { getFullRoute, type RouteLeg } from '@/lib/mapbox/directions'
import { forwardSearch, type GeocodeResult } from '@/lib/mapbox/geocoding'
import type { Trip, Stop, Expense, ExpenseCategory, Profile, JournalEntry } from '@/types'
import { EXPENSE_CATEGORIES, CURRENCY_SYMBOLS } from '@/types'
import { TripSummaryHero } from '@/components/journal/TripSummaryHero'
import { showToast, Toaster } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fetchWeatherForStops, type DayWeather, type WeatherKind } from '@/lib/weather/openMeteo'
import { getOptimizedOrder } from '@/lib/mapbox/optimize'
import { downloadTripIcs } from '@/lib/ics'
import { shareTripRecap } from '@/lib/recap-image'

const ACCENT = '#f5a623'
const ACCENT_LIGHT = '#f8c04a'
const ACCENT_DARK = '#e8821a'
const GLASS_FILL = 'rgba(255,255,255,.055)'
const GLASS_BORDER = 'rgba(255,255,255,.13)'

/** Bottom-sheet snap heights, in px, resolved against the live viewport height. */
const SHEET_MIN_PX = 190
const SHEET_DEFAULT_RATIO = 0.54
const SHEET_MAX_RATIO = 0.88

interface TripMobileClientProps {
  trip: Trip
  stops: Stop[]
  currentUserId: string
  /** Owner + collaborator profiles, for the Budget split view. */
  members: Profile[]
}

export function TripMobileClient(props: TripMobileClientProps) {
  return <TripMobileContent {...props} />
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHeaderDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return ''
  if (start && end) return `${formatHeaderDate(start)} – ${formatHeaderDate(end)}`
  return formatHeaderDate((start || end) as string)
}

function tripTitle(trip: Trip, stops: Stop[]) {
  if (stops.length >= 2) return `${stops[0].name} → ${stops[stops.length - 1].name}`
  if (stops.length === 1) return stops[0].name
  return trip.title
}

function formatDayChip(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── Stop schedule ──────────────────────────────────────────────────────────
// Arrival/departure dates are derived, not stored: trip.start_date plus the
// cumulative per-stop nights. Reordering stops or changing nights therefore
// never leaves stale dates behind.

interface StopSchedule {
  arrival: string | null
  departure: string | null
  /** 1-based trip day the stay starts / ends on. */
  dayStart: number
  dayEnd: number
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function computeStopSchedule(
  startDate: string | null | undefined,
  stops: Stop[],
  nights: Record<string, number>
): StopSchedule[] {
  let cursor = startDate ?? null
  let day = 1
  return stops.map((s) => {
    const n = Math.max(1, nights[s.id] ?? 1)
    const arrival = cursor
    const departure = cursor ? addDays(cursor, n) : null
    const entry: StopSchedule = { arrival, departure, dayStart: day, dayEnd: day + n - 1 }
    cursor = departure
    day += n
    return entry
  })
}

// ─── Weather ────────────────────────────────────────────────────────────────
// Live Open-Meteo forecast (see lib/weather/openMeteo). Chips only appear for
// arrival dates inside the ~16-day forecast horizon — no fake data.

function WeatherIcon({ kind, size = 18 }: { kind: WeatherKind; size?: number }) {
  const cloud = 'rgba(215,215,255,.7)'
  switch (kind) {
    case 'sunny':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.3" stroke={ACCENT_LIGHT} strokeWidth="1.6" />
          <g stroke={ACCENT_LIGHT} strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 2.5V5" />
            <path d="M12 19V21.5" />
            <path d="M4.2 4.2L6 6" />
            <path d="M18 18L19.8 19.8" />
            <path d="M2.5 12H5" />
            <path d="M19 12H21.5" />
            <path d="M4.2 19.8L6 18" />
            <path d="M18 6L19.8 4.2" />
          </g>
        </svg>
      )
    case 'partly':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="9" r="3.2" stroke={ACCENT_LIGHT} strokeWidth="1.6" />
          <path d="M7 19.5H16.3C18.4 19.5 20.1 17.8 20.1 15.7C20.1 13.7 18.6 12.1 16.7 12C16.2 9.8 14.2 8.2 11.9 8.2" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'cloudy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M6.3 18H16.4C18.5 18 20.2 16.3 20.2 14.1C20.2 12.1 18.7 10.5 16.8 10.3C16.4 7.6 14.1 5.5 11.2 5.5C8 5.5 5.4 8.1 5.4 11.3C5.4 11.5 5.4 11.7 5.44 11.9C3.7 12.3 2.4 13.9 2.4 15.6C2.4 16.9 3.4 18 6.3 18Z" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'rainy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M6.3 15H16.4C18.5 15 20.2 13.3 20.2 11.1C20.2 9.1 18.7 7.5 16.8 7.3C16.4 4.6 14.1 2.5 11.2 2.5C8 2.5 5.4 5.1 5.4 8.3C5.4 8.5 5.4 8.7 5.44 8.9C3.7 9.3 2.4 10.9 2.4 12.6C2.4 13.9 3.4 15 6.3 15Z" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <g stroke="#7ec8ff" strokeWidth="1.6" strokeLinecap="round">
            <path d="M8.2 18.3L7.2 20.8" />
            <path d="M12.5 18.3L11.5 20.8" />
            <path d="M16.8 18.3L15.8 20.8" />
          </g>
        </svg>
      )
    case 'snowy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M6.3 15H16.4C18.5 15 20.2 13.3 20.2 11.1C20.2 9.1 18.7 7.5 16.8 7.3C16.4 4.6 14.1 2.5 11.2 2.5C8 2.5 5.4 5.1 5.4 8.3C5.4 8.5 5.4 8.7 5.44 8.9C3.7 9.3 2.4 10.9 2.4 12.6C2.4 13.9 3.4 15 6.3 15Z" stroke={cloud} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <g stroke="#bfe3ff" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 17.8v3M6.8 19.3h2.4" />
            <path d="M14.5 17.8v3M13.3 19.3h2.4" />
          </g>
        </svg>
      )
  }
}

// ─── Prep / packing list ────────────────────────────────────────────────────
// Backed by the `packing_items` table (migration 010). A vibe-aware starter
// template seeds the list on first open.

type Section = 'plan' | 'prep' | 'budget' | 'journal'

interface PackingRow {
  id: string
  category: PackingCategoryKey
  label: string
  checked: boolean
}

type PackingCategoryKey = 'clothing' | 'electronics' | 'documents' | 'toiletries' | 'other'

const PACKING_CATEGORY_META: { key: PackingCategoryKey; label: string; icon: (color: string) => React.ReactNode }[] = [
  {
    key: 'clothing', label: 'Clothing',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4L4 7.5L6.5 10.5L9 8.5V20H15V8.5L17.5 10.5L20 7.5L16 4C16 5.1 14.2 6 12 6C9.8 6 8 5.1 8 4Z" />
      </svg>
    ),
  },
  {
    key: 'electronics', label: 'Electronics',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2.5" width="12" height="19" rx="2.4" />
        <path d="M11 19h2" />
      </svg>
    ),
  },
  {
    key: 'documents', label: 'Documents',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 2.5H14L18 6.5V21.5H7Z" />
        <path d="M10 12H15M10 16H15" />
      </svg>
    ),
  },
  {
    key: 'toiletries', label: 'Toiletries',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5C12 2.5 7.5 9 7.5 14C7.5 17.6 9.9 20.5 12 20.5C14.1 20.5 16.5 17.6 16.5 14C16.5 9 12 2.5 12 2.5Z" />
      </svg>
    ),
  },
  {
    key: 'other', label: 'Other',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="8" width="17" height="12" rx="2.2" />
        <path d="M8 8V6.5C8 5 9.1 3.5 12 3.5C14.9 3.5 16 5 16 6.5V8" />
      </svg>
    ),
  },
]

const DEFAULT_PACKING: Record<PackingCategoryKey, string[]> = {
  clothing: ['T-shirt', 'Pants', 'Underwear', 'Socks', 'Jacket / Coat', 'Shoes'],
  electronics: ['Phone charger', 'Power bank', 'Headphones', 'Adapter'],
  documents: ['ID / Passport', "Driver's license", 'Booking confirmations', 'Travel insurance'],
  toiletries: ['Toothbrush & toothpaste', 'Shampoo', 'Sunscreen', 'Personal medication'],
  other: ['Water bottle', 'Snacks', 'Spare charging cable'],
}

/** Extra starter items layered on top of the defaults, keyed by trip vibe. */
const VIBE_PACKING: Record<string, Partial<Record<PackingCategoryKey, string[]>>> = {
  Road: { electronics: ['Car charger'], other: ['Car phone mount', 'Roadside emergency kit', 'Sunglasses'] },
  Fly: { clothing: ['Compression socks'], documents: ['Boarding passes'], other: ['Neck pillow', 'Luggage tags'] },
  Camp: { clothing: ['Thermal layers'], other: ['Tent', 'Sleeping bag', 'Headlamp', 'Multi-tool'] },
  Beach: { clothing: ['Swimsuit', 'Flip-flops', 'Sun hat'], toiletries: ['SPF 50 sunscreen', 'After-sun lotion'], other: ['Beach towel'] },
  Mountain: { clothing: ['Hiking boots', 'Rain shell', 'Fleece'], other: ['Trekking poles', 'Water filter'] },
  Backpack: { clothing: ['Quick-dry clothes'], other: ['Packing cubes', 'Padlock', 'Microfiber towel', 'Daypack'] },
}

const VIBE_PACKING_EMOJI: Record<string, string> = {
  Road: '🚗', Fly: '✈️', Camp: '⛺', Beach: '🏖️', Mountain: '🏔️', Backpack: '🎒',
}

function buildTemplateRows(vibe: string | null | undefined): { category: PackingCategoryKey; label: string }[] {
  const rows: { category: PackingCategoryKey; label: string }[] = []
  for (const key of Object.keys(DEFAULT_PACKING) as PackingCategoryKey[]) {
    DEFAULT_PACKING[key].forEach((label) => rows.push({ category: key, label }))
  }
  const extras = vibe ? VIBE_PACKING[vibe] : undefined
  if (extras) {
    for (const [cat, labels] of Object.entries(extras) as [PackingCategoryKey, string[]][]) {
      labels.forEach((label) => rows.push({ category: cat, label }))
    }
  }
  return rows
}

// Session-lifetime cache so re-opening the Prep tab never refetches; every
// mutation below writes through it.
const packingCache = new Map<string, PackingRow[]>()

function PrepTab({ tripId, vibe, userId }: { tripId: string; vibe?: string | null; userId: string }) {
  const [items, setItemsState] = useState<PackingRow[]>(() => packingCache.get(tripId) ?? [])
  const [loading, setLoading] = useState(() => !packingCache.has(tripId))
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [seeding, setSeeding] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ clothing: true })
  const [draft, setDraft] = useState<Record<string, string>>({})

  const setItems: React.Dispatch<React.SetStateAction<PackingRow[]>> = (action) =>
    setItemsState((prev) => {
      const next = typeof action === 'function' ? (action as (p: PackingRow[]) => PackingRow[])(prev) : action
      packingCache.set(tripId, next)
      return next
    })

  const retryLoad = () => setReloadToken((t) => t + 1)

  useEffect(() => {
    if (reloadToken === 0 && packingCache.has(tripId)) return
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    const supabase = createClient()
    supabase
      .from('packing_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (data) {
          packingCache.set(tripId, data as PackingRow[])
          setItemsState(data as PackingRow[])
        } else if (error) {
          setLoadError(true)
          showToast("Couldn't load the packing list. Run migration 010 if you haven't yet.", 'error', { label: 'Retry', onClick: () => setReloadToken((t) => t + 1) })
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tripId, reloadToken])

  // Optimistic writes; revert + toast on failure.
  const toggleItem = (row: PackingRow) => {
    setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, checked: !it.checked } : it)))
    const supabase = createClient()
    supabase.from('packing_items').update({ checked: !row.checked }).eq('id', row.id).then(({ error }) => {
      if (error) {
        setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, checked: row.checked } : it)))
        showToast("Couldn't update the item.", 'error')
      }
    })
  }

  const removeItem = (row: PackingRow) => {
    setItems((prev) => prev.filter((it) => it.id !== row.id))
    const supabase = createClient()
    supabase.from('packing_items').delete().eq('id', row.id).then(({ error }) => {
      if (error) {
        setItems((prev) => [...prev, row])
        showToast("Couldn't remove the item.", 'error')
      }
    })
  }

  const addItem = async (cat: PackingCategoryKey) => {
    const label = (draft[cat] ?? '').trim()
    if (!label) return
    setDraft((d) => ({ ...d, [cat]: '' }))
    const supabase = createClient()
    const { data, error } = await supabase
      .from('packing_items')
      .insert({ trip_id: tripId, category: cat, label, created_by: userId })
      .select()
      .single()
    if (!error && data) setItems((prev) => [...prev, data as PackingRow])
    else showToast("Couldn't add the item.", 'error')
  }

  const seedTemplate = async () => {
    if (seeding) return
    setSeeding(true)
    const supabase = createClient()
    const rows = buildTemplateRows(vibe).map((r) => ({ trip_id: tripId, category: r.category, label: r.label, created_by: userId }))
    const { data, error } = await supabase.from('packing_items').insert(rows).select()
    if (!error && data) {
      setItems(data as PackingRow[])
      setExpanded({ clothing: true })
    } else {
      showToast("Couldn't create the starter list.", 'error')
    }
    setSeeding(false)
  }

  const grouped = {} as Record<PackingCategoryKey, PackingRow[]>
  for (const meta of PACKING_CATEGORY_META) grouped[meta.key] = []
  for (const it of items) (grouped[it.category] ?? grouped.other).push(it)

  const totalItems = items.length
  const totalChecked = items.filter((i) => i.checked).length
  const overallPct = totalItems ? Math.round((totalChecked / totalItems) * 100) : 0

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: i === 0 ? 92 : 66, borderRadius: 20, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, animation: 'pulseglow 1.6s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ paddingTop: 14 }}>
        <RetryCard
          title="Couldn't load your packing list"
          hint="Check your connection — or run migration 010 if you haven't yet."
          onRetry={retryLoad}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14 }}>
      <div style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em' }}>Packing List</div>
            <div style={{ fontSize: 12, color: 'rgba(215,215,255,.6)', marginTop: 2, fontWeight: 500 }}>{totalChecked}/{totalItems} packed</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT_LIGHT }}>{overallPct}%</div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${overallPct}%`, borderRadius: 999, background: `linear-gradient(90deg, ${ACCENT_DARK}, ${ACCENT_LIGHT})`, transition: 'width .3s ease' }} />
        </div>
      </div>

      {totalItems === 0 && (
        <div style={{ background: GLASS_FILL, border: '1px solid rgba(245,166,35,.3)', borderRadius: 20, padding: '20px 18px', textAlign: 'center', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{VIBE_PACKING_EMOJI[vibe ?? 'Road'] ?? '🚗'}</div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>Start your packing list</div>
          <div style={{ fontSize: 12.5, color: 'rgba(215,215,255,.6)', marginTop: 4, lineHeight: 1.5 }}>
            Get a starter list tailored to your {vibe ?? 'Road'} trip — edit everything after.
          </div>
          <button
            onClick={seedTemplate}
            disabled={seeding}
            style={{ marginTop: 14, padding: '11px 22px', borderRadius: 12, background: 'linear-gradient(135deg, #f5a623, #f8c04a)', border: 'none', color: '#1a0800', fontWeight: 800, fontSize: 13.5, cursor: seeding ? 'default' : 'pointer', fontFamily: 'inherit', opacity: seeding ? 0.6 : 1, boxShadow: '0 0 20px rgba(245,140,0,.25)' }}
          >
            {seeding ? 'Adding…' : `Add ${vibe ?? 'Road'} essentials`}
          </button>
        </div>
      )}

      {PACKING_CATEGORY_META.map(({ key, label, icon }) => {
        const list = grouped[key]
        const checkedCount = list.filter((i) => i.checked).length
        const isOpen = !!expanded[key]
        return (
          <div key={key} style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
              aria-expanded={isOpen}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 16, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 12, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                {icon(ACCENT_LIGHT)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(215,215,255,.55)', fontWeight: 500, marginTop: 1 }}>{checkedCount}/{list.length} packed</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, background: item.checked ? 'rgba(74,222,128,.08)' : 'rgba(255,255,255,.035)' }}>
                    <button
                      onClick={() => toggleItem(item)}
                      aria-label={item.checked ? `Uncheck ${item.label}` : `Check ${item.label}`}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: item.checked ? 'none' : '1.5px solid rgba(215,215,255,.35)', background: item.checked ? 'linear-gradient(145deg,#4ade80,#22c55e)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}
                    >
                      {item.checked && (
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#06210f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </button>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: item.checked ? 'rgba(215,215,255,.45)' : 'rgba(255,255,255,.92)', textDecoration: item.checked ? 'line-through' : 'none' }}>
                      {item.label}
                    </span>
                    <button
                      onClick={() => removeItem(item)}
                      aria-label={`Remove ${item.label}`}
                      style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(215,215,255,.35)' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(key) }}
                    placeholder="Add item..."
                    style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={() => addItem(key)}
                    style={{ width: 34, height: 34, borderRadius: 10, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div style={{ height: 20 }} />
    </div>
  )
}

// ─── Budget ─────────────────────────────────────────────────────────────────
// Backed by the live `expenses` table (see supabase/migrations/000_full_schema.sql).
// Amounts use the trip's currency (migration 008); "$" is the pre-migration fallback.

const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, (color: string) => React.ReactNode> = {
  fuel: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M4 11h8" />
      <path d="M14 8.5l3 2v6.5a1.5 1.5 0 0 0 3 0V11l-2.5-2.5" />
    </svg>
  ),
  food: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2.5v8a2 2 0 0 0 4 0v-8M9 2.5v19M17 2.5c-1.7 0-3 2-3 5s1.3 5 3 5v9" />
    </svg>
  ),
  lodging: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 19V6M3 15h18v4M8 15v-3a2 2 0 0 1 2-2h8a4 4 0 0 1 4 4v1" />
      <circle cx="7.5" cy="10" r="1.5" />
    </svg>
  ),
  activities: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5l2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 16.9l-5.7 3.2 1.2-6.4-4.7-4.5 6.4-.8z" />
    </svg>
  ),
  transport: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
      <path d="M3 16h18v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18h-11v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <circle cx="7.5" cy="16" r="1.3" />
      <circle cx="16.5" cy="16" r="1.3" />
    </svg>
  ),
  other: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2.4" />
      <path d="M16 12h2.5" />
      <path d="M3 9.5h18" />
    </svg>
  ),
}

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function BudgetTab({
  trip, expenses, loading, error, onRetry, members, currentUserId, onAdd, onDelete,
}: {
  trip: Trip
  expenses: Expense[]
  loading: boolean
  error: boolean
  onRetry: () => void
  members: Profile[]
  currentUserId: string
  onAdd: (category: ExpenseCategory, description: string, amount: number, paidBy: string) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [draftDesc, setDraftDesc] = useState<Record<string, string>>({})
  const [draftAmount, setDraftAmount] = useState<Record<string, string>>({})
  const [draftPayer, setDraftPayer] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const partner = members.find((m) => m.id !== currentUserId) ?? null
  const partnerName = partner
    ? partner.display_name?.split(' ')[0] ?? partner.email?.split('@')[0] ?? 'Partner'
    : null

  const sym = CURRENCY_SYMBOLS[trip.currency ?? 'USD'] ?? '$'
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const total = trip.total_budget || 0
  const remaining = total - spent
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
  const overBudget = total > 0 && remaining < 0

  // Splitwise-lite: everything is split 50/50 between the two trip members.
  const myPaid = expenses.filter((e) => e.paid_by === currentUserId).reduce((s, e) => s + Number(e.amount), 0)
  const partnerPaid = partner ? expenses.filter((e) => e.paid_by === partner.id).reduce((s, e) => s + Number(e.amount), 0) : 0
  const net = (myPaid - partnerPaid) / 2

  const submitExpense = async (cat: ExpenseCategory) => {
    const amountRaw = parseFloat(draftAmount[cat] ?? '')
    if (!amountRaw || amountRaw <= 0) return
    setSubmitting(cat)
    await onAdd(cat, (draftDesc[cat] ?? '').trim(), amountRaw, draftPayer[cat] ?? currentUserId)
    setDraftDesc((d) => ({ ...d, [cat]: '' }))
    setDraftAmount((d) => ({ ...d, [cat]: '' }))
    setSubmitting(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14 }}>
      <div style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em' }}>Trip Budget</div>
            <div style={{ fontSize: 12, color: 'rgba(215,215,255,.6)', marginTop: 2, fontWeight: 500 }}>
              {sym}{formatMoney(spent)} of {sym}{formatMoney(total)} spent
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: overBudget ? '#f87171' : ACCENT_LIGHT }}>
            {total > 0 ? `${pct}%` : '—'}
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: overBudget ? 'linear-gradient(90deg, #dc2626, #f87171)' : `linear-gradient(90deg, ${ACCENT_DARK}, ${ACCENT_LIGHT})`, transition: 'width .3s ease' }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: overBudget ? '#f87171' : 'rgba(215,215,255,.6)' }}>
          {total <= 0
            ? 'No budget set for this trip'
            : overBudget
              ? `${sym}${formatMoney(Math.abs(remaining))} over budget`
              : `${sym}${formatMoney(remaining)} remaining`}
        </div>
      </div>

      {error && !loading && (
        <RetryCard
          title="Couldn't load expenses"
          hint="Your budget summary is shown, but the expense list didn't come through."
          onRetry={onRetry}
        />
      )}

      {partner && !loading && !error && (
        <div style={{ background: GLASS_FILL, border: `1px solid ${net === 0 ? GLASS_BORDER : 'rgba(245,166,35,.3)'}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(215,215,255,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Split 50/50</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6, color: net === 0 ? '#4ade80' : ACCENT_LIGHT }}>
            {net > 0
              ? `${partnerName} owes you ${sym}${formatMoney(net)}`
              : net < 0
                ? `You owe ${partnerName} ${sym}${formatMoney(-net)}`
                : 'All settled up 🎉'}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 12, color: 'rgba(215,215,255,.6)', fontWeight: 500 }}>
            <span>You paid {sym}{formatMoney(myPaid)}</span>
            <span>·</span>
            <span>{partnerName} paid {sym}{formatMoney(partnerPaid)}</span>
          </div>
        </div>
      )}

      {loading &&
        [0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ height: 66, borderRadius: 20, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, animation: 'pulseglow 1.6s ease-in-out infinite', animationDelay: `${i * 0.15}s` }}
          />
        ))}

      {!loading && !error && EXPENSE_CATEGORIES.map(({ value: cat, label }) => {
        const list = expenses.filter((e) => e.category === cat)
        const catSpent = list.reduce((sum, e) => sum + Number(e.amount), 0)
        const isOpen = !!expanded[cat]
        return (
          <div key={cat} style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setExpanded((e) => ({ ...e, [cat]: !e[cat] }))}
              aria-expanded={isOpen}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 16, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 12, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                {EXPENSE_CATEGORY_ICONS[cat](ACCENT_LIGHT)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(215,215,255,.55)', fontWeight: 500, marginTop: 1 }}>
                  {list.length} {list.length === 1 ? 'expense' : 'expenses'}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.9)', flex: 'none' }}>{sym}{formatMoney(catSpent)}</div>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,.035)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.description || label}
                    </span>
                    {partner && item.paid_by && (
                      <span
                        title={item.paid_by === currentUserId ? 'Paid by you' : `Paid by ${partnerName}`}
                        style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 800, color: '#fff', background: item.paid_by === currentUserId ? 'linear-gradient(135deg,#f5a623,#e8821a)' : 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}
                      >
                        {item.paid_by === currentUserId ? 'ME' : partnerName?.[0]?.toUpperCase() ?? 'P'}
                      </span>
                    )}
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT_LIGHT, flex: 'none' }}>{sym}{formatMoney(Number(item.amount))}</span>
                    <button
                      onClick={() => onDelete(item.id)}
                      style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(215,215,255,.35)' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                ))}
                {partner && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 11.5, color: 'rgba(215,215,255,.55)', fontWeight: 600 }}>Paid by</span>
                    {[{ id: currentUserId, label: 'Me' }, { id: partner.id, label: partnerName ?? 'Partner' }].map((p) => {
                      const active = (draftPayer[cat] ?? currentUserId) === p.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => setDraftPayer((d) => ({ ...d, [cat]: p.id }))}
                          style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: active ? 'rgba(245,166,35,.18)' : 'rgba(255,255,255,.05)', border: `1px solid ${active ? 'rgba(245,166,35,.45)' : 'rgba(255,255,255,.1)'}`, color: active ? ACCENT_LIGHT : 'rgba(215,215,255,.7)' }}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    value={draftDesc[cat] ?? ''}
                    onChange={(e) => setDraftDesc((d) => ({ ...d, [cat]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitExpense(cat) }}
                    placeholder="Description"
                    style={{ flex: 1.4, minWidth: 0, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <input
                    value={draftAmount[cat] ?? ''}
                    onChange={(e) => setDraftAmount((d) => ({ ...d, [cat]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitExpense(cat) }}
                    placeholder={`${sym}0`}
                    inputMode="decimal"
                    style={{ width: 70, flex: 'none', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 10px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={() => submitExpense(cat)}
                    disabled={submitting === cat}
                    style={{ width: 34, height: 34, borderRadius: 10, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: submitting === cat ? 'default' : 'pointer', opacity: submitting === cat ? 0.5 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div style={{ height: 20 }} />
    </div>
  )
}

// ─── Journal ────────────────────────────────────────────────────────────────

const JOURNAL_BUCKET = 'trip-photos'

// Session-lifetime cache so re-opening the Journal tab never refetches.
const journalCache = new Map<string, JournalEntry[]>()

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatJournalDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/** Downscale to max 1600px and re-encode as JPEG before upload (keeps the bucket lean). */
async function compressJournalPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress failed'))), 'image/jpeg', 0.85)
  })
}

function journalPhotoUrl(path: string): string {
  return createClient().storage.from(JOURNAL_BUCKET).getPublicUrl(path).data.publicUrl
}

function JournalTab({
  trip, stops, routeLegs, routePath, currentUserId,
}: {
  trip: Trip
  stops: Stop[]
  routeLegs: RouteLeg[]
  routePath: { lat: number; lng: number }[]
  currentUserId: string
}) {
  const [sharing, setSharing] = useState(false)
  const [entries, setEntriesState] = useState<JournalEntry[] | null>(() => journalCache.get(trip.id) ?? null)
  const [entriesError, setEntriesError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  // Write-through wrapper: keeps the session cache in sync with every mutation.
  const setEntries: React.Dispatch<React.SetStateAction<JournalEntry[] | null>> = (action) =>
    setEntriesState((prev) => {
      const next = typeof action === 'function' ? (action as (p: JournalEntry[] | null) => JournalEntry[] | null)(prev) : action
      if (next) journalCache.set(trip.id, next)
      return next
    })
  const [draftNote, setDraftNote] = useState('')
  const [draftDate, setDraftDate] = useState(todayIso())
  const [draftFiles, setDraftFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (reloadToken === 0 && journalCache.has(trip.id)) return
    let cancelled = false
    setEntriesState(null)
    setEntriesError(false)
    createClient()
      .from('journal_entries')
      .select('*, journal_photos(*)')
      .eq('trip_id', trip.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Table missing until migration 011_journal runs, or the request
          // failed — degrade without poisoning the cache.
          setEntriesState([])
          setEntriesError(true)
          return
        }
        const rows = (data ?? []) as JournalEntry[]
        journalCache.set(trip.id, rows)
        setEntriesState(rows)
      })
    return () => { cancelled = true }
  }, [trip.id, reloadToken])

  // Escape closes the photo lightbox.
  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

  const submitEntry = async () => {
    const note = draftNote.trim()
    if (saving || (!note && draftFiles.length === 0)) return
    setSaving(true)
    const supabase = createClient()
    const { data: entry, error } = await supabase
      .from('journal_entries')
      .insert({ trip_id: trip.id, entry_date: draftDate, note: note || null, created_by: currentUserId })
      .select('*')
      .single()
    if (error || !entry) {
      setSaving(false)
      showToast("Couldn't save the entry. Run migration 011 first?", 'error', { label: 'Retry', onClick: () => submitEntry() })
      return
    }
    const photos: JournalEntry['journal_photos'] = []
    for (const file of draftFiles) {
      try {
        const blob = await compressJournalPhoto(file)
        const path = `${trip.id}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage.from(JOURNAL_BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        const { data: row, error: rowErr } = await supabase
          .from('journal_photos')
          .insert({ entry_id: entry.id, storage_path: path, uploaded_by: currentUserId })
          .select('*')
          .single()
        if (rowErr || !row) throw rowErr ?? new Error('insert failed')
        photos.push(row)
      } catch {
        showToast(`Couldn't upload ${file.name}.`, 'error')
      }
    }
    setEntries((prev) => {
      const next = [{ ...entry, journal_photos: photos } as JournalEntry, ...(prev ?? [])]
      return next.sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
    })
    setDraftNote('')
    setDraftFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setSaving(false)
    showToast('Journal entry saved 📝', 'success')
  }

  const deleteEntry = async (entry: JournalEntry) => {
    setPendingDelete(null)
    const supabase = createClient()
    const paths = (entry.journal_photos ?? []).map((p) => p.storage_path)
    if (paths.length > 0) await supabase.storage.from(JOURNAL_BUCKET).remove(paths)
    const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
    if (error) {
      showToast("Couldn't delete the entry.", 'error')
      return
    }
    setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id))
  }

  const points = stops.map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, label: i + 1, title: s.name }))
  const distanceKm = routeLegs.reduce((sum, l) => sum + l.distanceMeters, 0) / 1000
  const durationHours = routeLegs.reduce((sum, l) => sum + l.durationSeconds, 0) / 3600
  const days = trip.start_date && trip.end_date ? totalNights(trip) + 1 : stops.length
  const recapReady = stops.length >= 2 && routePath.length >= 2

  const inputStyle: CSSProperties = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ paddingTop: 14, paddingBottom: 20 }}>
      {recapReady ? (
        <>
          <TripSummaryHero
            title={tripTitle(trip, stops)}
            dateRange={formatDateRange(trip.start_date, trip.end_date) || 'Dates not set'}
            points={points}
            routePath={routePath}
            distanceKm={distanceKm}
            durationHours={durationHours}
            days={days}
          />
          <button
            onClick={async () => {
              if (sharing) return
              setSharing(true)
              const result = await shareTripRecap({
                title: tripTitle(trip, stops),
                dateRange: formatDateRange(trip.start_date, trip.end_date) || 'Dates not set',
                routePath,
                stops: stops.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name })),
                distanceKm,
                durationHours,
                days,
              })
              setSharing(false)
              if (result === 'failed') showToast("Couldn't create the recap image.", 'error')
              else if (result === 'downloaded') showToast('Recap image downloaded — story-ready! 📸', 'success')
            }}
            disabled={sharing}
            style={{ width: '100%', marginTop: 12, padding: '14px 16px', borderRadius: 16, background: 'linear-gradient(135deg, #f5a623, #f8c04a)', border: 'none', color: '#1a0800', fontWeight: 800, fontSize: 14.5, cursor: sharing ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: '0 0 24px rgba(245,140,0,.3)', opacity: sharing ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a0800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <path d="M16 6l-4-4-4 4M12 2v13" />
            </svg>
            {sharing ? 'Creating image…' : 'Share trip recap'}
          </button>
        </>
      ) : (
        <div style={{ padding: '18px 16px', borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', textAlign: 'center' }}>
          <span style={{ color: 'rgba(215,215,255,.55)', fontSize: 12.5 }}>
            {stops.length < 2 ? 'Add at least 2 stops to see your trip recap' : 'Loading route recap…'}
          </span>
        </div>
      )}

      {/* ── Daily journal ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.85)', letterSpacing: '.02em', marginBottom: 10 }}>Daily journal</div>

        {/* composer */}
        <div style={{ borderRadius: 16, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="date"
            value={draftDate}
            onChange={(e) => e.target.value && setDraftDate(e.target.value)}
            style={{ ...inputStyle, colorScheme: 'dark', width: 'fit-content' }}
          />
          <textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="How was the day? Notes, highlights, hidden gems…"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
          {draftFiles.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {draftFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)' }} />
                  <button
                    onClick={() => setDraftFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove photo"
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'rgba(20,20,40,.9)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setDraftFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, color: 'rgba(255,255,255,.85)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3.2" /><path d="M8 5l1.2-2h5.6L16 5" />
              </svg>
              Add photos
            </button>
            <button
              onClick={submitEntry}
              disabled={saving || (!draftNote.trim() && draftFiles.length === 0)}
              style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg, #f5a623, #f8c04a)', border: 'none', color: '#1a0800', fontSize: 12.5, fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving || (!draftNote.trim() && draftFiles.length === 0) ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Save entry'}
            </button>
          </div>
        </div>

        {/* entries */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries === null && (
            <div style={{ height: 76, borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
          )}
          {entriesError && (
            <RetryCard
              title="Couldn't load the journal"
              hint="Check your connection — or run migration 011 if you haven't yet."
              onRetry={() => setReloadToken((t) => t + 1)}
            />
          )}
          {entries?.length === 0 && !entriesError && (
            <span style={{ color: 'rgba(215,215,255,.5)', fontSize: 12.5, textAlign: 'center', padding: '12px 0' }}>No entries yet — write your first note above ✍️</span>
          )}
          {entries?.map((entry) => (
            <div key={entry.id} style={{ borderRadius: 16, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT_LIGHT }}>{formatJournalDate(entry.entry_date)}</span>
                <button
                  onClick={() => setPendingDelete(entry)}
                  aria-label="Delete entry"
                  style={{ marginLeft: 'auto', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(215,215,255,.35)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
              </div>
              {entry.note && (
                <div style={{ marginTop: 6, fontSize: 13.5, color: 'rgba(255,255,255,.9)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{entry.note}</div>
              )}
              {(entry.journal_photos?.length ?? 0) > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {entry.journal_photos!.map((p) => {
                    const url = journalPhotoUrl(p.storage_path)
                    return (
                      <button
                        key={p.id}
                        onClick={() => setLightbox(url)}
                        aria-label="View photo full-screen"
                        style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'block', width: '100%' }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={p.caption ?? 'Trip photo'}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', display: 'block' }}
                        />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Trip photo"
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <button
            autoFocus
            onClick={() => setLightbox(null)}
            aria-label="Close photo"
            style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.22)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Trip photo" style={{ maxWidth: '100%', maxHeight: '90svh', borderRadius: 14, objectFit: 'contain' }} />
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete journal entry?"
        message="The note and its photos will be removed for everyone on this trip."
        onConfirm={() => pendingDelete && deleteEntry(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

const BOOKING_PARTNERS = ['Booking.com', 'Expedia', 'Airbnb', 'Hostelworld', 'Agoda'] as const

function bookingUrl(
  partner: (typeof BOOKING_PARTNERS)[number],
  stop: Stop,
  arrival?: string | null,
  departure?: string | null
) {
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

function totalNights(trip: Trip) {
  if (!trip.start_date || !trip.end_date) return 0
  const ms = new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

const topBtnStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  background: GLASS_FILL,
  border: `1px solid ${GLASS_BORDER}`,
  backdropFilter: 'blur(20px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0,0,0,.3)',
}

// ─── Main content ────────────────────────────────────────────────────────────

function TripMobileContent({ trip, stops: initialStops, currentUserId, members }: TripMobileClientProps) {
  const router = useRouter()
  const [stops, setStops] = useState(initialStops)
  const [activeSection, setActiveSection] = useState<Section>('plan')
  const [activeTab, setActiveTab] = useState<'route' | 'days' | 'bookings'>('route')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addInitialQuery, setAddInitialQuery] = useState('')
  const [aiHint, setAiHint] = useState(false)
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([])
  const [routeLegs, setRouteLegs] = useState<RouteLeg[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [nights, setNights] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialStops.map((s) => [s.id, s.nights ?? 1]))
  )
  const [optimizing, setOptimizing] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const sheetHeight = useMotionValue(420)

  useEffect(() => {
    const h = stageRef.current?.clientHeight ?? window.innerHeight
    sheetHeight.set(Math.round(h * SHEET_DEFAULT_RATIO))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snapPoints = useCallback(() => {
    const h = stageRef.current?.clientHeight ?? window.innerHeight
    return {
      min: SHEET_MIN_PX,
      mid: Math.round(h * SHEET_DEFAULT_RATIO),
      max: Math.round(h * SHEET_MAX_RATIO),
    }
  }, [])

  // Native Pointer Events (not Framer's onPan) so dragging works reliably with
  // mouse, touch, and pen alike, and pointer capture keeps tracking even if the
  // finger/cursor drifts outside the handle's small hit area mid-drag.
  const dragStart = useRef<{ pointerId: number; clientY: number; height: number } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStart.current = { pointerId: e.pointerId, clientY: e.clientY, height: sheetHeight.get() }
      setIsDragging(true)
    },
    [sheetHeight]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStart.current
      if (!drag || e.pointerId !== drag.pointerId) return
      const { min, max } = snapPoints()
      const next = drag.height - (e.clientY - drag.clientY)
      sheetHeight.set(Math.min(max, Math.max(min, next)))
    },
    [sheetHeight, snapPoints]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current || e.pointerId !== dragStart.current.pointerId) return
      dragStart.current = null
      setIsDragging(false)
      const { min, mid, max } = snapPoints()
      const current = sheetHeight.get()
      const nearest = [min, mid, max].reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a))
      animate(sheetHeight, nearest, { type: 'spring', stiffness: 320, damping: 34 })
    },
    [sheetHeight, snapPoints]
  )

  // One debounced Directions request per actual route change. Keying on the
  // coordinate signature means renames, nights, and failed-reorder reverts to a
  // cached order never refetch; rapid drag-drops collapse into the last state,
  // and the AbortController cancels an in-flight response that became stale.
  const routeKey = stops.map((s) => `${s.lng},${s.lat}`).join(';')
  useEffect(() => {
    if (stops.length < 2) {
      setRoutePath([])
      setRouteLegs([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const points = stops.map((s) => ({ lat: s.lat, lng: s.lng }))
      getFullRoute(points, { signal: controller.signal }).then((full) => {
        if (controller.signal.aborted || !full) return
        setRoutePath(full.route.polylinePath)
        setRouteLegs(full.legs)
      })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // Optimistic update; reverts to the previous value if the write fails.
  const changeNights = (id: string, delta: number) => {
    const current = nights[id] ?? 1
    const next = Math.max(1, current + delta)
    if (next === current) return
    setNights((prev) => ({ ...prev, [id]: next }))
    const supabase = createClient()
    supabase
      .from('stops')
      .update({ nights: next })
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          setNights((prev) => ({ ...prev, [id]: current }))
          showToast("Couldn't save nights. Run migration 008 if you haven't yet.", 'error', { label: 'Retry', onClick: () => changeNights(id, delta) })
        }
      })
  }

  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deleteStopTarget, setDeleteStopTarget] = useState<Stop | null>(null)

  const handleDeleteStop = useCallback(async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('stops').delete().eq('id', id)
    if (!error) setStops((prev) => prev.filter((s) => s.id !== id))
    else showToast("Couldn't delete the stop. Please try again.", 'error')
  }, [])

  const handleRenameStop = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const supabase = createClient()
    const { error } = await supabase.from('stops').update({ name: trimmed }).eq('id', id)
    if (!error) setStops((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)))
    else showToast("Couldn't rename the stop.", 'error')
  }, [])

  // Drag-and-drop reordering (dnd-kit). Pointer needs a small movement and touch
  // a long-press before a drag starts, so taps on the buttons inside each card
  // (nights stepper, rename) keep working as plain clicks.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  )

  const [savingOrder, setSavingOrder] = useState(false)

  // Shows the new order immediately, then persists the whole order in a single
  // atomic RPC (migration 014). On failure the previous order comes back (so a
  // refresh never shows a different route) and the error toast offers a retry.
  const applyStopOrder = (next: Stop[], previous: Stop[]) => {
    setStops(next)
    setSavingOrder(true)
    const supabase = createClient()
    supabase
      .rpc('reorder_trip_stops', { p_trip_id: trip.id, p_stop_ids: next.map((s) => s.id) })
      .then(({ error }) => {
        setSavingOrder(false)
        if (error) {
          setStops(previous)
          showToast("Couldn't save the new stop order — reverted.", 'error', { label: 'Retry', onClick: () => applyStopOrder(next, previous) })
        }
      })
  }

  // Mapbox Optimization API — keeps first/last stops fixed, reorders the middle.
  const handleOptimize = async () => {
    if (optimizing) return
    if (stops.length < 3) { showToast('Add at least 3 stops to optimize the order.', 'info'); return }
    if (stops.length > 12) { showToast('Optimization works with up to 12 stops.', 'info'); return }
    setOptimizing(true)
    const order = await getOptimizedOrder(stops.map((s) => ({ lat: s.lat, lng: s.lng })))
    setOptimizing(false)
    if (!order) { showToast("Couldn't optimize the route. Please try again.", 'error'); return }
    if (order.every((v, i) => v === i)) { showToast('Your route is already optimal! 🎉', 'success'); return }
    applyStopOrder(order.map((i) => stops[i]), stops)
    showToast('Route optimized — stops reordered.', 'success')
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = stops.findIndex((s) => s.id === active.id)
    const newIndex = stops.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    applyStopOrder(arrayMove(stops, oldIndex, newIndex), stops)
  }

  const handleAddStop = useCallback(
    async (lat: number, lng: number, name: string, address: string) => {
      const attempt = async () => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('stops')
          .insert({
            trip_id: trip.id,
            name,
            lat,
            lng,
            address,
            order_index: stops.length,
            stop_type: stops.length === 0 ? 'origin' : 'destination',
            created_by: currentUserId,
          })
          .select()
          .single()
        if (!error && data) setStops((prev) => [...prev, data as Stop])
        else showToast("Couldn't add the destination.", 'error', { label: 'Retry', onClick: () => { void attempt() } })
      }
      await attempt()
    },
    [trip.id, stops.length, currentUserId]
  )

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [expensesError, setExpensesError] = useState(false)
  const [expensesReload, setExpensesReload] = useState(0)
  // Expenses are only fetched once the Budget tab is first opened; after that
  // the list lives in this component's state, so re-entering the tab is instant.
  const [expensesRequested, setExpensesRequested] = useState(false)

  useEffect(() => {
    if (activeSection === 'budget') setExpensesRequested(true)
  }, [activeSection])

  useEffect(() => {
    if (!expensesRequested) return
    let cancelled = false
    setExpensesLoading(true)
    setExpensesError(false)
    const supabase = createClient()
    supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (data) setExpenses(data as Expense[])
        else if (error) {
          setExpensesError(true)
          showToast("Couldn't load expenses.", 'error', { label: 'Retry', onClick: () => setExpensesReload((t) => t + 1) })
        }
        setExpensesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [trip.id, expensesRequested, expensesReload])

  const handleAddExpense = useCallback(
    async (category: ExpenseCategory, description: string, amount: number, paidBy: string) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('expenses')
        .insert({ trip_id: trip.id, category, amount, description: description || null, paid_by: paidBy || currentUserId })
        .select()
        .single()
      if (!error && data) setExpenses((prev) => [data as Expense, ...prev])
      else showToast("Couldn't save the expense.", 'error')
    },
    [trip.id, currentUserId]
  )

  const handleDeleteExpense = useCallback(async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (!error) setExpenses((prev) => prev.filter((e) => e.id !== id))
    else showToast("Couldn't delete the expense.", 'error')
  }, [])

  const stopSchedule = computeStopSchedule(trip.start_date, stops, nights)
  const routeLoading = stops.length >= 2 && routeLegs.length === 0
  const summaryKm = Math.round(routeLegs.reduce((sum, l) => sum + l.distanceMeters, 0) / 1000)
  const summaryMin = Math.round(routeLegs.reduce((sum, l) => sum + l.durationSeconds, 0) / 60)
  const summaryDuration = `${Math.floor(summaryMin / 60)}h ${String(summaryMin % 60).padStart(2, '0')}m`
  const nightsTotal = totalNights(trip)
  const nightsPlanned = stops.reduce((sum, s) => sum + (nights[s.id] ?? 1), 0)
  const nightsTarget = nightsTotal || nightsPlanned || 1
  const ringCircumference = 150.8
  const ringPct = Math.min(1, nightsPlanned / nightsTarget)
  const ringOffset = ringCircumference * (1 - ringPct)
  const defaultCenter =
    trip.focus_lat != null && trip.focus_lng != null ? { lat: trip.focus_lat, lng: trip.focus_lng } : undefined
  // Example searches for the empty state: the wizard's destination countries
  // when available, otherwise a generic starter set.
  const emptyStateSuggestions = (trip.countries?.length ? trip.countries.map((c) => c.name) : ['Rome', 'Barcelona', 'Tokyo']).slice(0, 3)

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100svh',
        background: 'linear-gradient(145deg, #06061c, #0a1020, #071216)',
        fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif",
        position: 'relative',
        overflow: 'clip',
      }}
    >
      <style>{`
        @keyframes dashmove { to { stroke-dashoffset: -40; } }
        @keyframes pulseglow { 0%,100% { opacity: .45; } 50% { opacity: .8; } }
        * { scrollbar-width: none }
        *::-webkit-scrollbar { display: none }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      {/* luminous orbs */}
      <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 340, height: 340, borderRadius: '50%', background: 'rgba(245,140,0,.22)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 160, left: -100, width: 340, height: 340, borderRadius: '50%', background: 'rgba(90,0,210,.20)', filter: 'blur(70px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 220, right: -120, width: 320, height: 320, borderRadius: '50%', background: 'rgba(0,100,160,.14)', filter: 'blur(70px)', pointerEvents: 'none' }} />

      <div ref={stageRef} style={{ position: 'relative', zIndex: 1, height: '100svh', maxWidth: 480, margin: '0 auto', overflow: 'hidden' }}>
        {activeSection !== 'plan' && (
          <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 18px 14px', paddingTop: 'max(20px, env(safe-area-inset-top))', flex: 'none' }}>
              <button onClick={() => setActiveSection('plan')} title="Back to plan" aria-label="Back to plan" style={topBtnStyle}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
              <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.2px' }}>
                {activeSection === 'prep' ? 'Prep' : activeSection === 'budget' ? 'Budget' : 'Journal'}
              </div>
              <div style={{ width: 40 }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 16px 16px' }}>
              {activeSection === 'prep' && <PrepTab tripId={trip.id} vibe={trip.vibe} userId={currentUserId} />}
              {activeSection === 'budget' && (
                <BudgetTab trip={trip} expenses={expenses} loading={expensesLoading} error={expensesError} onRetry={() => setExpensesReload((t) => t + 1)} members={members} currentUserId={currentUserId} onAdd={handleAddExpense} onDelete={handleDeleteExpense} />
              )}
              {activeSection === 'journal' && (
                <JournalTab trip={trip} stops={stops} routeLegs={routeLegs} routePath={routePath} currentUserId={currentUserId} />
              )}
            </div>
            <BottomNav active={activeSection} onSelect={setActiveSection} />
          </div>
        )}

        {activeSection === 'plan' && (
        <>
        {/* map layer — fixed, full-bleed, never resized or re-rendered by the sheet drag.
            The sheet is a pure overlay on top; it covers more/less of this static map as it moves,
            but the map's own DOM container size (and therefore its camera) never changes. */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#06061c' }}>
          <TripboxMap
            points={stops.map((s, idx) => ({ id: s.id, lat: s.lat, lng: s.lng, label: idx + 1, title: s.name, subtitle: s.address ?? undefined }))}
            routePath={routePath}
            defaultCenter={defaultCenter}
            defaultZoom={5}
          />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to bottom, transparent 78%, rgba(6,6,28,.6) 100%)' }} />
        </div>

        {/* floating header — sits over the map, not a separate opaque block */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
            padding: '20px 18px 14px', paddingTop: 'max(20px, env(safe-area-inset-top))',
            background: 'linear-gradient(to bottom, rgba(6,6,20,.8) 0%, rgba(6,6,20,.45) 55%, transparent 100%)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'auto' }}>
            <button onClick={() => router.push('/trips')} title="Back to trips" aria-label="Back to trips" style={topBtnStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>

            <div style={{ flex: 1, textAlign: 'center', padding: '0 8px', minWidth: 0 }}>
              <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>
                {tripTitle(trip, stops)}
              </div>
              <div style={{ color: 'rgba(215,215,255,.7)', fontWeight: 500, fontSize: 12.5, marginTop: 3, textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>
                {formatDateRange(trip.start_date, trip.end_date) || 'No dates set'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
              <div style={{ height: 40, padding: '0 10px', borderRadius: 14, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>📍</span>
                <span style={{ color: ACCENT, fontWeight: 700, fontSize: 12.5 }}>{stops.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* draggable bottom sheet */}
        <motion.div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
            height: sheetHeight,
            background: 'rgba(10,10,26,.82)', border: `1px solid ${GLASS_BORDER}`, borderBottom: 'none',
            backdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0',
            boxShadow: '0 -12px 40px rgba(0,0,0,.35)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 12px', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', flex: 'none' }}
          >
            <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.22)' }} />
          </div>

          {/* pinned route summary — stays visible above Route/Days/Bookings so the
              user keeps context while scrolling the sheet or panning the map */}
          {stops.length > 0 && (
            <div
              aria-live="polite"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 16px 10px', flex: 'none', fontSize: 12.5, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}
            >
              <span>{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span>
              {stops.length >= 2 && (
                routeLoading ? (
                  <>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)' }} />
                    <span aria-hidden="true" style={{ width: 96, height: 9, borderRadius: 999, background: 'rgba(255,255,255,.12)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)' }} />
                    <span>{summaryKm.toLocaleString('en-US')} km</span>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)' }} />
                    <span>{summaryDuration}</span>
                  </>
                )
              )}
              {savingOrder && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,166,35,.14)', border: '1px solid rgba(245,166,35,.35)', color: ACCENT_LIGHT, fontSize: 11 }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_LIGHT, animation: 'pulseglow 1s ease-in-out infinite' }} />
                  Saving route…
                </span>
              )}
            </div>
          )}

          {/* tabs — inline segmented pill control (Route/Days/Bookings) */}
          <div style={{ padding: '0 16px 12px', flex: 'none' }}>
            <SegmentedTabs
              options={[
                { value: 'route', label: 'Route' },
                { value: 'days', label: 'Days' },
                { value: 'bookings', label: 'Bookings' },
              ]}
              value={activeTab}
              onValueChange={setActiveTab}
            />
          </div>

          {/* content */}
          <div style={{ flex: 1, padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, overflowY: 'auto' }}>

            {activeTab === 'route' && (
              <>
                {stops.length > 0 && (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 22, padding: '18px 20px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <svg width="56" height="56" viewBox="0 0 56 56" style={{ flex: 'none', transform: 'rotate(-90deg)' }}>
                        <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
                        <circle cx="28" cy="28" r="24" fill="none" stroke="url(#tripper-ring-grad)" strokeWidth="5" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} />
                        <defs>
                          <linearGradient id="tripper-ring-grad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={ACCENT_LIGHT} />
                            <stop offset="100%" stopColor={ACCENT} />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{nightsPlanned} / {nightsTarget}</div>
                        <div style={{ fontSize: 12, color: 'rgba(215,215,255,.7)', fontWeight: 500, marginTop: 2 }}>Nights Planned</div>
                      </div>
                    </div>
                    <button
                      onClick={handleOptimize}
                      disabled={optimizing}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 999, padding: '10px 14px', flex: 'none', cursor: optimizing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: optimizing ? 0.6 : 1 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={optimizing ? { animation: 'pulseglow 1s ease-in-out infinite' } : undefined}><path d="M8 1L9.3 5.6L14 7L9.3 8.4L8 13L6.7 8.4L2 7L6.7 5.6L8 1Z" fill={ACCENT_LIGHT} /></svg>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{optimizing ? 'Optimizing…' : 'Optimize'}</span>
                    </button>
                  </div>
                )}

                {stops.length === 0 ? (
                  <div style={{ width: '100%', flex: 1, minHeight: 200, border: '1.5px dashed rgba(255,255,255,.15)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(136,136,228,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(136,136,228,.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>
                    </div>
                    <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 16, textAlign: 'center' }}>Add your first destination</div>
                    <div style={{ color: 'rgba(215,215,255,.55)', fontWeight: 400, fontSize: 13, textAlign: 'center' }}>Search any city or place to start your route</div>
                    <button
                      onClick={() => { setAddInitialQuery(''); setIsAddOpen(true) }}
                      style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, padding: '12px 22px', borderRadius: 13, background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`, border: 'none', color: '#1a0800', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 0 22px rgba(245,140,0,.3)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      Add your first stop
                    </button>
                    {emptyStateSuggestions.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                        <span style={{ fontSize: 11.5, color: 'rgba(215,215,255,.45)', fontWeight: 600 }}>Try:</span>
                        {emptyStateSuggestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => { setAddInitialQuery(q); setIsAddOpen(true) }}
                            style={{ padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(215,215,255,.8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    {stops.map((stop, idx) => (
                      <SortableStopItem key={stop.id} id={stop.id}>
                        {({ attributes, listeners, isDragging }) => (
                          <>
                        <div {...attributes} {...listeners} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: isDragging ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.045)', border: `1px solid ${isDragging ? 'rgba(245,166,35,.4)' : 'rgba(255,255,255,.09)'}`, touchAction: 'manipulation', cursor: isDragging ? 'grabbing' : 'grab' }}>
                          <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ flex: 'none', opacity: 0.45 }} aria-hidden="true">
                            <circle cx="2" cy="2" r="1.2" fill="#d7d7ff" /><circle cx="6" cy="2" r="1.2" fill="#d7d7ff" />
                            <circle cx="2" cy="7" r="1.2" fill="#d7d7ff" /><circle cx="6" cy="7" r="1.2" fill="#d7d7ff" />
                            <circle cx="2" cy="12" r="1.2" fill="#d7d7ff" /><circle cx="6" cy="12" r="1.2" fill="#d7d7ff" />
                          </svg>
                          <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: `${ACCENT}22`, border: `1.5px solid ${ACCENT}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ACCENT }}>
                            {idx + 1}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {editingStopId === stop.id ? (
                              <input
                                autoFocus
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleRenameStop(stop.id, editDraft)
                                    setEditingStopId(null)
                                  } else if (e.key === 'Escape') {
                                    setEditingStopId(null)
                                  }
                                }}
                                onBlur={() => {
                                  handleRenameStop(stop.id, editDraft)
                                  setEditingStopId(null)
                                }}
                                style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '4px 8px', fontSize: 14, fontWeight: 600, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                              />
                            ) : (
                              <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name}</div>
                            )}
                            {stop.address && (
                              <div style={{ color: 'rgba(215,215,255,.55)', fontSize: 11.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.address}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: 4, flex: 'none' }}>
                            <button
                              aria-label={`Remove a night in ${stop.name}`}
                              onClick={() => changeNights(stop.id, -1)}
                              style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(215,215,255,.8)', background: 'none', border: 'none' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 700, width: 20, textAlign: 'center' }}>{nights[stop.id] ?? 1}</span>
                            <button
                              aria-label={`Add a night in ${stop.name}`}
                              onClick={() => changeNights(stop.id, 1)}
                              style={{ width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: ACCENT_LIGHT, background: 'none', border: 'none' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '6px 4px 0' }}>
                          <button
                            onClick={() => {
                              setEditingStopId(stop.id)
                              setEditDraft(stop.name)
                            }}
                            title="Rename stop"
                            aria-label={`Rename ${stop.name}`}
                            style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(215,215,255,.6)' }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                          </button>
                          <button
                            onClick={() => setDeleteStopTarget(stop)}
                            title="Delete stop"
                            aria-label={`Delete ${stop.name}`}
                            style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: '#f87171' }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>
                          </button>
                        </div>

                        {idx < stops.length - 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 10px 32px' }}>
                            <div style={{ position: 'relative', width: 2, height: 28, background: 'repeating-linear-gradient(to bottom, rgba(245,140,0,.5) 0 4px, transparent 4px 8px)' }}>
                              <div style={{ position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, margin: -4, borderRadius: '50%', background: ACCENT_LIGHT, boxShadow: '0 0 14px 3px rgba(245,140,0,.6)', animation: 'pulseglow 2.2s ease-in-out infinite' }} />
                            </div>
                            {routeLegs[idx] ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(215,215,255,.55)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
                                    <path d="M2 12L6 4L9 9L11 6L14 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  {routeLegs[idx].distanceText}
                                </span>
                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(215,215,255,.35)', flex: 'none' }} />
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(215,215,255,.55)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
                                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
                                    <path d="M8 4.5V8L10.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  {routeLegs[idx].durationText}
                                </span>
                              </div>
                            ) : (
                              <span aria-hidden="true" style={{ width: 92, height: 10, borderRadius: 999, background: 'rgba(255,255,255,.1)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />
                            )}
                          </div>
                        )}
                          </>
                        )}
                      </SortableStopItem>
                    ))}
                  </div>
                  </SortableContext>
                  </DndContext>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                  <div style={{ color: 'rgba(215,215,255,.55)', fontSize: 12, fontWeight: 500 }}>or</div>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                </div>

                <button
                  onClick={() => setAiHint(true)}
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: GLASS_FILL, border: '1px solid rgba(245,166,35,.35)', boxShadow: '0 0 20px rgba(245,140,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <span style={{ fontSize: 14 }}>✨</span>
                  <span style={{ color: '#f5c268', fontWeight: 700, fontSize: 14 }}>{aiHint ? 'Coming soon' : 'Generate trip with AI'}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,166,35,.15)', border: '1px solid rgba(245,166,35,.35)', color: ACCENT_LIGHT, letterSpacing: '.05em' }}>SOON</span>
                </button>
              </>
            )}

            {activeTab === 'days' && <DaysTab stops={stops} routeLegs={routeLegs} schedule={stopSchedule} tripName={tripTitle(trip, stops)} />}
            {activeTab === 'bookings' && <BookingsTab stops={stops} schedule={stopSchedule} />}
          </div>

          <BottomNav active={activeSection} onSelect={setActiveSection} />
        </motion.div>
        </>
        )}
      </div>

      {/* FAB */}
      {activeSection === 'plan' && (
        <button
          onClick={() => { setAddInitialQuery(''); setIsAddOpen(true) }}
          title="Add destination"
          aria-label="Add destination"
          style={{ position: 'fixed', right: 18, bottom: 96, width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(145deg, ${ACCENT_LIGHT}, ${ACCENT_DARK})`, boxShadow: '0 0 32px rgba(245,140,0,.45), 0 8px 20px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, border: 'none', cursor: 'pointer' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}

      {isAddOpen && <AddDestinationSheet initialQuery={addInitialQuery} onClose={() => setIsAddOpen(false)} onAdd={handleAddStop} />}

      <ConfirmDialog
        open={deleteStopTarget !== null}
        title="Delete this stop?"
        message={deleteStopTarget ? `"${deleteStopTarget.name}" will be removed from your route. This can't be undone.` : ''}
        onConfirm={() => {
          if (deleteStopTarget) handleDeleteStop(deleteStopTarget.id)
          setDeleteStopTarget(null)
        }}
        onCancel={() => setDeleteStopTarget(null)}
      />
      <Toaster />
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

/** dnd-kit wrapper: applies the sort transform and hands drag props to the card. */
function SortableStopItem({ id, children }: {
  id: string
  children: (p: { attributes: React.HTMLAttributes<HTMLDivElement>; listeners: Record<string, unknown> | undefined; isDragging: boolean }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: DndCSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}>
      {children({ attributes: attributes as React.HTMLAttributes<HTMLDivElement>, listeners: listeners as Record<string, unknown> | undefined, isDragging })}
    </div>
  )
}

function DaysTab({ stops, routeLegs, schedule, tripName }: { stops: Stop[]; routeLegs: RouteLeg[]; schedule: StopSchedule[]; tripName: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [weather, setWeather] = useState<Record<string, DayWeather | null>>({})

  // Refetch only when a stop or its arrival date actually changes.
  const weatherKey = stops.map((s, i) => `${s.id}:${schedule[i]?.arrival ?? ''}`).join('|')
  useEffect(() => {
    if (!stops.length) return
    let cancelled = false
    fetchWeatherForStops(
      stops.map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, date: schedule[i]?.arrival ?? null }))
    ).then((w) => {
      if (!cancelled) setWeather(w)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherKey])

  if (stops.length === 0) return <ComingSoon label="Day-by-day planning" />

  const exportIcs = () => {
    const events = stops
      .map((s, i) => ({ name: s.name, address: s.address, arrival: schedule[i]?.arrival, departure: schedule[i]?.departure }))
      .filter((e): e is { name: string; address: string | null; arrival: string; departure: string } => !!(e.arrival && e.departure))
    if (!events.length) {
      showToast('Set trip dates first to export the calendar.', 'info')
      return
    }
    downloadTripIcs(tripName, events)
    showToast('Calendar file downloaded.', 'success')
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {schedule[0]?.arrival && (
        <button
          onClick={exportIcs}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 16px', borderRadius: 14, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
            <path d="M8 2.5v4M16 2.5v4M3 9.5h18M12 13v5M9.5 15.5h5" />
          </svg>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Add to calendar (.ics)</span>
        </button>
      )}
      {stops.map((stop, idx) => {
        const isOpen = !!expanded[stop.id]
        const sched = schedule[idx]
        const dayLabel = sched
          ? sched.dayStart === sched.dayEnd
            ? `Day ${sched.dayStart}`
            : `Days ${sched.dayStart}–${sched.dayEnd}`
          : `Day ${idx + 1}`
        const dateChip = sched?.arrival ? formatDayChip(sched.arrival) : null
        const hasDetail = !!(stop.notes || stop.address)
        const prevStop = idx > 0 ? stops[idx - 1] : null
        const leg = idx > 0 ? routeLegs[idx - 1] : null
        const w = weather[stop.id]
        return (
          <div key={stop.id}>
            {prevStop && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', padding: 12, background: 'rgba(0,0,0,.18)', borderRadius: 14 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}>{prevStop.name}</div>
                </div>
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: 2, background: 'linear-gradient(to right, transparent, #8888e4, transparent)' }} />
                  <div style={{ fontSize: 10.5, color: 'rgba(215,215,255,.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {leg
                      ? `${leg.durationText} · ${leg.distanceText}`
                      : <span aria-hidden="true" style={{ display: 'inline-block', width: 64, height: 8, borderRadius: 999, background: 'rgba(255,255,255,.12)', animation: 'pulseglow 1.6s ease-in-out infinite' }} />}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(215,215,255,.85)' }}>{stop.name}</div>
                </div>
              </div>
            )}
            <div
              onClick={() => hasDetail && setExpanded((e) => ({ ...e, [stop.id]: !e[stop.id] }))}
              role={hasDetail ? 'button' : undefined}
              tabIndex={hasDetail ? 0 : undefined}
              aria-expanded={hasDetail ? isOpen : undefined}
              onKeyDown={(e) => {
                if (hasDetail && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setExpanded((prev) => ({ ...prev, [stop.id]: !prev[stop.id] }))
                }
              }}
              style={{
                background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20,
                padding: 16, cursor: hasDetail ? 'pointer' : 'default', backdropFilter: 'blur(20px)',
                boxShadow: '0 6px 20px rgba(0,0,0,.2)',
              }}
            >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(215,215,255,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {dayLabel}{dateChip ? ` · ${dateChip}` : ''}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stop.name}
                </div>
                {prevStop && <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT_LIGHT, marginTop: 3 }}>Travel Day</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                {w && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <WeatherIcon kind={w.kind} />
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>
                      {w.high}° <span style={{ color: 'rgba(215,215,255,.5)', fontWeight: 600 }}>/ {w.low}°</span>
                    </div>
                  </div>
                )}
                {hasDetail && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <path d="M4 6L8 10L12 6" stroke="rgba(215,215,255,.6)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stop.address && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(215,215,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Address</div>
                    <div style={{ fontSize: 13, color: 'rgba(215,215,255,.88)', lineHeight: 1.5 }}>{stop.address}</div>
                  </div>
                )}
                {stop.notes && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(215,215,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Notes</div>
                    <div style={{ fontSize: 13, color: 'rgba(215,215,255,.88)', lineHeight: 1.5 }}>{stop.notes}</div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BookingsTab({ stops, schedule }: { stops: Stop[]; schedule: StopSchedule[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (stops.length === 0) return <ComingSoon label="Bookings" />

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {stops.map((stop, idx) => {
        const moreOpen = !!expanded[stop.id]
        const shown = moreOpen ? BOOKING_PARTNERS : BOOKING_PARTNERS.slice(0, 3)
        const arrival = schedule[idx]?.arrival ?? stop.arrival_date
        const departure = schedule[idx]?.departure ?? stop.departure_date
        const hasDates = !!(arrival && departure)
        const dateRange = formatDateRange(arrival, departure)
        return (
          <div
            key={stop.id}
            style={{ background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20, padding: 16, backdropFilter: 'blur(20px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em' }}>Stay in {stop.name}</div>
                {dateRange && <div style={{ fontSize: 12, color: 'rgba(215,215,255,.65)', marginTop: 3, fontWeight: 500 }}>{dateRange}</div>}
              </div>
              <a
                href={bookingUrl('Booking.com', stop, arrival, departure)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid rgba(245,140,0,.5)', color: ACCENT_LIGHT, borderRadius: 999, padding: '8px 13px', flex: 'none', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Add Stay</span>
              </a>
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
              {shown.map((partner) => (
                <a
                  key={partner}
                  href={bookingUrl(partner, stop, arrival, departure)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.06)', textDecoration: 'none', color: 'inherit' }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(215,215,255,.88)', flex: 'none' }}>
                    {partner[0]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#fff' }}>{partner}</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', opacity: 0.5 }}>
                    <path d="M6 3L11 8L6 13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ))}
            </div>

            {BOOKING_PARTNERS.length > 3 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [stop.id]: !e[stop.id] }))}
                aria-expanded={moreOpen}
                style={{ width: '100%', textAlign: 'center', padding: '12px 0 2px', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit' }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(215,215,255,.6)' }}>
                  {moreOpen ? 'Show Fewer Partners' : `Show ${BOOKING_PARTNERS.length - 3} More Partners`}
                </span>
              </button>
            )}

            {hasDates ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 14px', background: 'rgba(30,140,90,.12)', border: '1px solid rgba(30,180,110,.3)', borderRadius: 12 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#86efac' }}>Destination and dates are automatically pre-filled</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="rgba(215,215,255,.55)" strokeWidth="1.6" /><path d="M8 5v3.5M8 11h.01" stroke="rgba(215,215,255,.55)" strokeWidth="1.6" strokeLinecap="round" /></svg>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(215,215,255,.6)' }}>Set trip dates to pre-fill check-in & check-out</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Shown in place of a list when its initial load fails, so the user always has a way forward. */
function RetryCard({ title, hint, onRetry }: { title: string; hint?: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ width: '100%', background: GLASS_FILL, border: '1px solid rgba(239,68,68,.3)', borderRadius: 20, padding: '22px 18px', textAlign: 'center', backdropFilter: 'blur(20px)' }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
        <path d="M12 3L22 20H2L12 3Z" stroke="#f87171" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M12 9.5V14M12 17h.01" stroke="#f87171" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: 'rgba(215,215,255,.6)', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
      <button
        onClick={onRetry}
        style={{ marginTop: 14, padding: '10px 24px', borderRadius: 12, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Try again
      </button>
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '40px 16px', textAlign: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'rgba(215,215,255,.55)', fontSize: 12.5 }}>Coming soon</span>
    </div>
  )
}

function BottomNav({ active, onSelect }: { active: Section; onSelect: (s: Section) => void }) {
  const items: { key: Section; label: string; icon: (color: string) => React.ReactNode }[] = [
    {
      key: 'plan', label: 'Plan',
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5-2V4l5.5 2 6-2 5.5 2v14l-5.5-2-6 2z" /><path d="M9 6v14M15 4v14" /></svg>),
    },
    {
      key: 'prep', label: 'Prep',
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l1 4M18 2l-1 4" /><rect x="5" y="6" width="14" height="15" rx="4" /><path d="M9 10v4M15 10v4" /></svg>),
    },
    {
      key: 'budget', label: 'Budget',
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 10h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>),
    },
    {
      key: 'journal', label: 'Journal',
      icon: (color) => (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></svg>),
    },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, borderTop: `1px solid ${GLASS_BORDER}`, background: 'rgba(255,255,255,.03)', padding: '10px 10px 12px', flex: 'none' }}>
      {items.map((item) => {
        const isActive = item.key === active
        const color = isActive ? ACCENT : 'rgba(215,215,255,.45)'
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '7px 0 6px', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: isActive ? 'rgba(245,166,35,.12)' : 'transparent',
            }}
          >
            {item.icon(color)}
            <span style={{ color, fontWeight: 600, fontSize: 11 }}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function AddDestinationSheet({
  initialQuery = '', onClose, onAdd,
}: {
  initialQuery?: string
  onClose: () => void
  onAdd: (lat: number, lng: number, name: string, address: string) => Promise<void>
}) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Escape closes; Tab stays trapped inside the sheet while it's open.
  useEffect(() => {
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
    return () => document.removeEventListener('keydown', onKeyDown)
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
          <input
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
