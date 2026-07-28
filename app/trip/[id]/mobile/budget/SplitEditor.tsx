'use client'

import { useEffect, useMemo } from 'react'
import { tokens } from '@/components/mobile'
import { DUSK } from '@/components/design/tokens'
import type { ExpenseSplitType } from '@/types'
import { resolveEqualShares, resolveExactShares, resolvePercentageShares, type ShareResult } from '../budget-settlement'

export interface SplitParticipant {
  memberId: string
  name: string
  included: boolean
  /** Raw text input, used when splitType === 'exact'. */
  exactAmount: string
  /** Raw text input (0-100), used when splitType === 'percentage'. */
  percentage: string
}

export type SplitResolution =
  | { ok: true; shares: ShareResult[] }
  | { ok: false; message: string }

export interface SplitEditorProps {
  currencySymbol: string
  totalMinor: number
  splitType: ExpenseSplitType
  onSplitTypeChange: (type: ExpenseSplitType) => void
  participants: SplitParticipant[]
  onToggleParticipant: (memberId: string) => void
  onChangeExactAmount: (memberId: string, value: string) => void
  onChangePercentage: (memberId: string, value: string) => void
  onResolutionChange: (resolution: SplitResolution) => void
}

const SEGMENT_LABELS: Record<ExpenseSplitType, string> = {
  equal: 'Equal',
  exact: 'Exact amounts',
  percentage: 'Percentage',
}

/**
 * Equal/exact/percentage split editor. Recomputes on every change and reports
 * the resolution (reconciled shares, or a blocking error) to the caller so
 * the parent sheet can disable Save until the split reconciles exactly — no
 * amount is ever silently redistributed.
 */
export function SplitEditor({
  currencySymbol, totalMinor, splitType, onSplitTypeChange,
  participants, onToggleParticipant, onChangeExactAmount, onChangePercentage,
  onResolutionChange,
}: SplitEditorProps) {
  const included = participants.filter((participant) => participant.included)

  const resolution = useMemo<SplitResolution>(() => {
    if (included.length === 0) return { ok: false, message: 'Pick at least one participant.' }

    if (splitType === 'equal') {
      return { ok: true, shares: resolveEqualShares(included.map((p) => p.memberId), totalMinor) }
    }

    if (splitType === 'exact') {
      const parsed = included.map((p) => ({ memberId: p.memberId, amountMinor: Math.round((Number(p.exactAmount) || 0) * 100) }))
      const result = resolveExactShares(parsed, totalMinor)
      if (!result.ok) {
        const remaining = result.remainderMinor / 100
        return {
          ok: false,
          message: remaining > 0
            ? `${currencySymbol}${remaining.toFixed(2)} left to assign`
            : `${currencySymbol}${Math.abs(remaining).toFixed(2)} too much assigned`,
        }
      }
      return result
    }

    const parsed = included.map((p) => ({ memberId: p.memberId, percent: Number(p.percentage) || 0 }))
    const result = resolvePercentageShares(parsed, totalMinor)
    if (!result.ok) {
      const remaining = result.remainderPercent
      return {
        ok: false,
        message: remaining > 0
          ? `${remaining.toFixed(1)}% left to assign`
          : `${Math.abs(remaining).toFixed(1)}% too much assigned`,
      }
    }
    return result
    // included is derived from participants every render; comparing its content, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, splitType, totalMinor, currencySymbol])

  useEffect(() => {
    onResolutionChange(resolution)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution])

  const shareByMember = useMemo(() => {
    if (!resolution.ok) return new Map<string, number>()
    return new Map(resolution.shares.map((share) => [share.memberId, share.shareMinor]))
  }, [resolution])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(Object.keys(SEGMENT_LABELS) as ExpenseSplitType[]).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={splitType === type}
            onClick={() => onSplitTypeChange(type)}
            style={{
              flex: 1, minHeight: 40, borderRadius: tokens.radius12, cursor: 'pointer', fontFamily: 'inherit',
              background: splitType === type ? 'rgba(245,166,35,.18)' : 'rgba(255,255,255,.05)',
              border: `1px solid ${splitType === type ? 'rgba(245,166,35,.45)' : 'rgba(255,255,255,.1)'}`,
              color: splitType === type ? tokens.accentLight : tokens.textSecondary, fontSize: 12.5, fontWeight: 700,
            }}
          >
            {SEGMENT_LABELS[type]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {participants.map((participant) => (
          <div
            key={participant.memberId}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, minHeight: 44,
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              opacity: participant.included ? 1 : 0.5,
            }}
          >
            <button
              type="button"
              onClick={() => onToggleParticipant(participant.memberId)}
              aria-pressed={participant.included}
              aria-label={`${participant.included ? 'Remove' : 'Include'} ${participant.name}`}
              style={{
                width: 26, height: 26, borderRadius: 7, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: participant.included ? 'rgba(245,166,35,.25)' : 'rgba(255,255,255,.06)',
                border: `1px solid ${participant.included ? 'rgba(245,166,35,.5)' : 'rgba(255,255,255,.16)'}`,
                cursor: 'pointer',
              }}
            >
              {participant.included && (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke={tokens.accentLight} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {participant.name}
            </span>
            {splitType === 'equal' && participant.included && (
              <span style={{ fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary, flex: 'none' }}>
                {currencySymbol}{((shareByMember.get(participant.memberId) ?? 0) / 100).toFixed(2)}
              </span>
            )}
            {splitType === 'exact' && participant.included && (
              <input
                aria-label={`${participant.name} amount`}
                inputMode="decimal"
                value={participant.exactAmount}
                onChange={(e) => onChangeExactAmount(participant.memberId, e.target.value)}
                placeholder="0.00"
                style={{ width: 74, minHeight: 32, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: DUSK.textPrimary, fontSize: 12.5, fontFamily: 'inherit', outline: 'none', textAlign: 'right', flex: 'none' }}
              />
            )}
            {splitType === 'percentage' && participant.included && (
              <input
                aria-label={`${participant.name} percentage`}
                inputMode="decimal"
                value={participant.percentage}
                onChange={(e) => onChangePercentage(participant.memberId, e.target.value)}
                placeholder="0"
                style={{ width: 54, minHeight: 32, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: DUSK.textPrimary, fontSize: 12.5, fontFamily: 'inherit', outline: 'none', textAlign: 'right', flex: 'none' }}
              />
            )}
          </div>
        ))}
      </div>

      <div
        role="status"
        style={{
          padding: '9px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: resolution.ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.1)',
          border: `1px solid ${resolution.ok ? 'rgba(34,197,94,.32)' : 'rgba(239,68,68,.3)'}`,
          color: resolution.ok ? '#4ade80' : tokens.danger,
        }}
      >
        {resolution.ok ? 'Split reconciles exactly' : resolution.message}
      </div>
    </div>
  )
}
