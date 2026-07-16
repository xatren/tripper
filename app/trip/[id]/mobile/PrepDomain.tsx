'use client'

import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTripRealtimeTable } from '@/lib/supabase/trip-realtime'
import { showToast } from '@/components/ui/toast'
import { ACCENT, ACCENT_DARK, ACCENT_GRADIENT, ACCENT_LIGHT, GLASS_BORDER, GLASS_FILL, RetryCard } from './domain-ui'

interface PackingRow {
  id: string
  trip_id: string
  category: PackingCategoryKey
  label: string
  checked: boolean
  created_at: string
}

type PackingCategoryKey = 'clothing' | 'electronics' | 'documents' | 'toiletries' | 'other'

const PACKING_CATEGORY_META: { key: PackingCategoryKey; label: string; icon: (color: string) => ReactNode }[] = [
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

export interface PrepDomainProps {
  tripId: string
  vibe?: string | null
  userId: string
  canEdit: boolean
}

export function PrepDomain({ tripId, vibe, userId, canEdit }: PrepDomainProps) {
  const [items, setItemsState] = useState<PackingRow[]>(() => packingCache.get(tripId) ?? [])
  const [loading, setLoading] = useState(() => !packingCache.has(tripId))
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [seeding, setSeeding] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ clothing: true })
  const [draft, setDraft] = useState<Record<string, string>>({})

  const setItems: Dispatch<SetStateAction<PackingRow[]>> = useCallback((action) =>
    setItemsState((prev) => {
      const next = typeof action === 'function' ? (action as (p: PackingRow[]) => PackingRow[])(prev) : action
      packingCache.set(tripId, next)
      return next
    }), [tripId])

  const retryLoad = () => setReloadToken((t) => t + 1)

  const refreshItems = useCallback(async (surfaceError = false) => {
    const { data, error } = await createClient()
      .from('packing_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
    if (data) setItems(data as PackingRow[])
    else if (error && surfaceError) {
      setLoadError(true)
      showToast("Couldn't load the packing list. Run migration 010 if you haven't yet.", 'error', { label: 'Retry', onClick: () => setReloadToken((t) => t + 1) })
    }
    return { data, error }
  }, [setItems, tripId])

  useEffect(() => {
    if (reloadToken === 0 && packingCache.has(tripId)) return
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    refreshItems(true).then(({ data, error }) => {
        if (cancelled) return
        if (data) setLoadError(false)
        else if (error) setLoadError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshItems, tripId, reloadToken])

  useTripRealtimeTable<PackingRow & Record<string, unknown>>(
    'packing_items',
    useCallback((change) => {
      const row = (change.eventType === 'DELETE' ? change.old : change.new) as Partial<PackingRow>
      if (!row.id) return
      setItems((previous) => {
        if (change.eventType === 'DELETE') return previous.filter((item) => item.id !== row.id)
        const existing = previous.find((item) => item.id === row.id)
        if (existing) return previous.map((item) => (item.id === row.id ? { ...item, ...row } as PackingRow : item))
        return [...previous, row as PackingRow].sort((a, b) => a.created_at.localeCompare(b.created_at))
      })
    }, [setItems]),
    useCallback(() => { void refreshItems(false) }, [refreshItems]),
  )

  // Optimistic writes; revert + toast on failure.
  const toggleItem = (row: PackingRow) => {
    if (!canEdit) return
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
    if (!canEdit) return
    setItems((prev) => prev.filter((it) => it.id !== row.id))
    const supabase = createClient()
    supabase.from('packing_items').delete().eq('id', row.id).then(({ error }) => {
      if (error) {
        setItems((prev) => prev.some((item) => item.id === row.id) ? prev : [...prev, row])
        showToast("Couldn't remove the item.", 'error')
      }
    })
  }

  const addItem = async (cat: PackingCategoryKey) => {
    if (!canEdit) return
    const label = (draft[cat] ?? '').trim()
    if (!label) return
    setDraft((d) => ({ ...d, [cat]: '' }))
    const supabase = createClient()
    const { data, error } = await supabase
      .from('packing_items')
      .insert({ trip_id: tripId, category: cat, label, created_by: userId })
      .select()
      .single()
    if (!error && data) setItems((prev) => {
      const row = data as PackingRow
      return prev.some((item) => item.id === row.id)
        ? prev.map((item) => item.id === row.id ? row : item)
        : [...prev, row]
    })
    else showToast("Couldn't add the item.", 'error')
  }

  const seedTemplate = async () => {
    if (!canEdit || seeding) return
    setSeeding(true)
    const supabase = createClient()
    const rows = buildTemplateRows(vibe).map((r) => ({ trip_id: tripId, category: r.category, label: r.label, created_by: userId }))
    const { data, error } = await supabase.from('packing_items').insert(rows).select()
    if (!error && data) {
      setItems((previous) => {
        const byId = new Map(previous.map((item) => [item.id, item]))
        for (const item of data as PackingRow[]) byId.set(item.id, item)
        return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
      })
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
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{canEdit ? 'Start your packing list' : 'No packing items yet'}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(215,215,255,.6)', marginTop: 4, lineHeight: 1.5 }}>
            {canEdit ? `Get a starter list tailored to your ${vibe ?? 'Road'} trip — edit everything after.` : 'An editor can add a shared packing list for this trip.'}
          </div>
          {canEdit && <button
            onClick={seedTemplate}
            disabled={seeding}
            style={{ marginTop: 14, padding: '11px 22px', borderRadius: 12, background: ACCENT_GRADIENT, border: 'none', color: '#1a0800', fontWeight: 800, fontSize: 13.5, cursor: seeding ? 'default' : 'pointer', fontFamily: 'inherit', opacity: seeding ? 0.6 : 1, boxShadow: '0 0 20px rgba(245,140,0,.25)' }}
          >
            {seeding ? 'Adding…' : `Add ${vibe ?? 'Road'} essentials`}
          </button>}
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
                      disabled={!canEdit}
                      aria-label={item.checked ? `Uncheck ${item.label}` : `Check ${item.label}`}
                      style={{ width: 44, height: 44, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : .75, padding: 0 }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ width: 20, height: 20, borderRadius: '50%', border: item.checked ? 'none' : '1.5px solid rgba(215,215,255,.35)', background: item.checked ? 'linear-gradient(145deg,#4ade80,#22c55e)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {item.checked && (
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#06210f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                    </button>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: item.checked ? 'rgba(215,215,255,.45)' : 'rgba(255,255,255,.92)', textDecoration: item.checked ? 'line-through' : 'none' }}>
                      {item.label}
                    </span>
                    {canEdit && <button
                      onClick={() => removeItem(item)}
                      aria-label={`Remove ${item.label}`}
                      style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(215,215,255,.35)' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>}
                  </div>
                ))}
                {canEdit && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    aria-label={`Add item to ${label}`}
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(key) }}
                    placeholder="Add item..."
                    style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    aria-label={`Add item to ${label}`}
                    onClick={() => addItem(key)}
                    style={{ width: 44, height: 44, borderRadius: 10, background: GLASS_FILL, border: `1px solid ${GLASS_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LIGHT} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>}
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
