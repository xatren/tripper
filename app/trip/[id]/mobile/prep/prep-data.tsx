'use client'

/**
 * Static metadata + tiny shared atoms for the Trip Readiness center:
 * packing/task category catalogs, vibe-aware starter templates, priority
 * metadata, and the assignee/priority badges reused by list rows and sheets.
 */

import type { ReactNode } from 'react'
import { StatusChip } from '@/components/mobile'
import type { TripMember } from '@/types'
import {
  assigneeInfo,
  type PackingCategoryKey,
  type PrepPriority,
  type ReadinessSectionKey,
  type TemplateRow,
  type TripTaskCategory,
} from './prep-logic'

// ── Packing categories ───────────────────────────────────────────────────────

export const PACKING_CATEGORY_META: { key: PackingCategoryKey; label: string; icon: (color: string) => ReactNode }[] = [
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

export const PACKING_CATEGORY_LABEL = Object.fromEntries(
  PACKING_CATEGORY_META.map((meta) => [meta.key, meta.label]),
) as Record<PackingCategoryKey, string>

// ── Trip task sections ───────────────────────────────────────────────────────

export const TASK_CATEGORY_META: { key: Exclude<TripTaskCategory, 'packing'>; label: string; hint: string; icon: (color: string) => ReactNode }[] = [
  {
    key: 'reservation', label: 'Reservations', hint: 'Confirmations to chase, check-ins to do',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15" rx="2.4" />
        <path d="M3.5 10H20.5M8 3V6.5M16 3V6.5" />
      </svg>
    ),
  },
  {
    key: 'document', label: 'Documents', hint: 'Passports, visas, insurance, printouts',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 2.5H14L18 6.5V21.5H7Z" />
        <path d="M10 12H15M10 16H15" />
      </svg>
    ),
  },
  {
    key: 'payment', label: 'Payments', hint: 'Deposits, balances, currency to sort',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="13" rx="2.4" />
        <path d="M3 10.5H21M7 15H10" />
      </svg>
    ),
  },
  {
    key: 'vehicle', label: 'Vehicle', hint: 'Service, tires, tolls, chargers',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13L6.5 8C6.8 7 7.5 6.5 8.5 6.5H15.5C16.5 6.5 17.2 7 17.5 8L19 13" />
        <rect x="3.5" y="13" width="17" height="5.5" rx="1.6" />
        <circle cx="7.5" cy="18.5" r="1.8" />
        <circle cx="16.5" cy="18.5" r="1.8" />
      </svg>
    ),
  },
  {
    key: 'custom', label: 'Custom', hint: 'Anything else before you go',
    icon: (c) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3.5V5.5M12 18.5V20.5M3.5 12H5.5M18.5 12H20.5M6 6L7.4 7.4M18 18L16.6 16.6M6 18L7.4 16.6M18 6L16.6 7.4" />
      </svg>
    ),
  },
]

export const READINESS_SECTION_LABEL: Record<ReadinessSectionKey, string> = {
  packing: 'Packing',
  reservation: 'Reservations',
  document: 'Documents',
  payment: 'Payments',
  vehicle: 'Vehicle',
  custom: 'Custom',
}

// ── Vibe-aware starter templates ─────────────────────────────────────────────

export const DEFAULT_PACKING: Record<PackingCategoryKey, string[]> = {
  clothing: ['T-shirt', 'Pants', 'Underwear', 'Socks', 'Jacket / Coat', 'Shoes'],
  electronics: ['Phone charger', 'Power bank', 'Headphones', 'Adapter'],
  documents: ['ID / Passport', "Driver's license", 'Booking confirmations', 'Travel insurance'],
  toiletries: ['Toothbrush & toothpaste', 'Shampoo', 'Sunscreen', 'Personal medication'],
  other: ['Water bottle', 'Snacks', 'Spare charging cable'],
}

/** Extra starter items layered on top of the defaults, keyed by trip vibe. */
export const VIBE_PACKING: Record<string, Partial<Record<PackingCategoryKey, string[]>>> = {
  Road: { electronics: ['Car charger'], other: ['Car phone mount', 'Roadside emergency kit', 'Sunglasses'] },
  Fly: { clothing: ['Compression socks'], documents: ['Boarding passes'], other: ['Neck pillow', 'Luggage tags'] },
  Camp: { clothing: ['Thermal layers'], other: ['Tent', 'Sleeping bag', 'Headlamp', 'Multi-tool'] },
  Beach: { clothing: ['Swimsuit', 'Flip-flops', 'Sun hat'], toiletries: ['SPF 50 sunscreen', 'After-sun lotion'], other: ['Beach towel'] },
  Mountain: { clothing: ['Hiking boots', 'Rain shell', 'Fleece'], other: ['Trekking poles', 'Water filter'] },
  Backpack: { clothing: ['Quick-dry clothes'], other: ['Packing cubes', 'Padlock', 'Microfiber towel', 'Daypack'] },
}

export const VIBE_PACKING_EMOJI: Record<string, string> = {
  Road: '🚗', Fly: '✈️', Camp: '⛺', Beach: '🏖️', Mountain: '🏔️', Backpack: '🎒',
}

export function buildTemplateRows(vibe: string | null | undefined): TemplateRow[] {
  const rows: TemplateRow[] = []
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

// ── Priority ─────────────────────────────────────────────────────────────────

export const PRIORITY_META: { key: PrepPriority; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
]

export function PriorityChip({ priority }: { priority: PrepPriority | undefined }) {
  if (!priority || priority === 'normal') return null
  return (
    <StatusChip tone={priority === 'high' ? 'warning' : 'neutral'} style={{ padding: '2px 8px', fontSize: 10.5 }}>
      {priority === 'high' ? 'High' : 'Low'}
    </StatusChip>
  )
}

// ── Assignee avatar ──────────────────────────────────────────────────────────

export interface AssigneeBadgeProps {
  userId: string | null | undefined
  members: TripMember[]
  currentUserId: string
  /** Compact renders the avatar circle only (name goes to the aria-label). */
  compact?: boolean
}

/** Avatar initial + name for an item's assignee; flags members who left the trip. */
export function AssigneeBadge({ userId, members, currentUserId, compact }: AssigneeBadgeProps) {
  const info = assigneeInfo(userId, members, currentUserId)
  if (!info) return null
  const member = members.find((candidate) => candidate.user_id === userId)
  const avatarUrl = member?.profile?.avatar_url
  const initial = (info.departed ? '–' : info.name.charAt(0)).toUpperCase()
  const circle = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      width={20}
      height={20}
      style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flex: 'none' }}
    />
  ) : (
    <span
      aria-hidden="true"
      style={{
        width: 20, height: 20, borderRadius: '50%', flex: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: info.departed ? 'rgba(255,255,255,.09)' : 'rgba(245,166,35,.2)',
        border: `1px solid ${info.departed ? 'rgba(255,255,255,.16)' : 'rgba(245,166,35,.4)'}`,
        color: info.departed ? 'var(--color-text-muted)' : 'var(--color-accent-light)',
        fontSize: 10, fontWeight: 800,
      }}
    >
      {initial}
    </span>
  )
  return (
    <span
      aria-label={info.departed ? 'Assigned to a former member' : `Assigned to ${info.name}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}
    >
      {circle}
      {!compact && (
        <span
          style={{
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: info.departed ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
            fontStyle: info.departed ? 'italic' : 'normal',
          }}
        >
          {info.name}
        </span>
      )}
    </span>
  )
}

/** Progressive enhancement only — silently no-ops where the Vibration API is missing or blocked. */
export function hapticTap() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(10)
  } catch {
    // Some browsers throw on vibrate without user activation; ignore.
  }
}
