'use client'

import { EmptyState, InlineError, SkeletonBlock, tokens } from '@/components/mobile'
import type { GooglePlaceErrorCode, GooglePlaceSearchResult } from '@/lib/google-places/types'
import { ExploreAttribution } from './ExploreAttribution'

export type ExploreSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; results: GooglePlaceSearchResult[] }
  | { status: 'error'; code: GooglePlaceErrorCode; retryable: boolean }

const ERROR_COPY: Record<GooglePlaceErrorCode, string> = {
  invalid_request: 'Try a more specific place or destination.',
  unauthorized: 'Sign in again to search places.',
  configuration: 'Google Places is not configured for this environment.',
  rate_limited: 'Too many searches at once. Wait a moment and try again.',
  quota_exceeded: 'The Google Places quota is temporarily unavailable.',
  provider_unavailable: 'Google Places is temporarily unavailable.',
  network: 'Could not reach the place search service. Check your connection.',
}

function ResultCard({ result, selected, onSelect }: { result: GooglePlaceSearchResult; selected: boolean; onSelect: () => void }) {
  const ratio = result.photoWidth && result.photoHeight ? `${result.photoWidth} / ${result.photoHeight}` : '4 / 3'
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} style={{ width: '100%', display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 12, padding: 12, minHeight: 120, textAlign: 'left', borderRadius: tokens.radius16, background: tokens.surfaceSolid, border: `1px solid ${selected ? tokens.accent : 'rgba(255,255,255,.08)'}`, color: tokens.textPrimary, cursor: 'pointer', fontFamily: 'inherit' }}>
      {result.photoRef ? (
        // The no-store proxy intentionally avoids framework image caching of Google provider content.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/places/photo?ref=${encodeURIComponent(result.photoRef)}&maxWidth=320`} alt="" loading="lazy" style={{ width: 96, aspectRatio: ratio, maxHeight: 96, objectFit: 'cover', borderRadius: tokens.radius12, background: tokens.surfaceRaised }} />
      ) : (
        <span aria-label="No photo available" style={{ width: 96, height: 96, display: 'grid', placeItems: 'center', borderRadius: tokens.radius12, background: 'linear-gradient(135deg,#1f2937,#0f766e)', color: tokens.textSecondary, fontSize: 22 }}>◇</span>
      )}
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{result.name}</span>
        {(result.primaryTypeLabel || result.primaryType) && <span style={{ fontSize: 11.5, color: tokens.textMuted }}>{result.primaryTypeLabel ?? result.primaryType?.replaceAll('_', ' ')}</span>}
        {result.formattedAddress && <span style={{ fontSize: 12.5, lineHeight: 1.35, color: tokens.textSecondary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{result.formattedAddress}</span>}
        {result.rating != null && result.userRatingCount != null && <span aria-label={`Rated ${result.rating} out of 5 from ${result.userRatingCount} reviews`} style={{ fontSize: 12, color: tokens.accentLight }}>{result.rating.toFixed(1)} · {result.userRatingCount.toLocaleString()} reviews</span>}
        {result.openNow != null && <span style={{ fontSize: 11.5, color: result.openNow ? tokens.successSoft : tokens.danger }}>{result.openNow ? 'Open' : 'Closed'}</span>}
        <ExploreAttribution compact />
      </span>
    </button>
  )
}

export function ExploreResultsList({ state, selectedPlaceId, onSelect, onRetry, hasProximity }: { state: ExploreSearchState; selectedPlaceId: string | null; onSelect: (place: GooglePlaceSearchResult) => void; onRetry: () => void; hasProximity: boolean }) {
  if (state.status === 'loading') return <div role="status" aria-live="polite" aria-label="Searching places" style={{ display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map((key) => <SkeletonBlock key={key} height={120} />)}</div>
  if (state.status === 'error') return <InlineError onRetry={state.retryable ? onRetry : undefined}>{ERROR_COPY[state.code]}</InlineError>
  if (state.status === 'idle') return <EmptyState title="Find a real place" description={hasProximity ? 'Search by name or choose a category near this destination.' : 'Search for a place and destination, for example “cafes in Lisbon”.'} />
  if (state.results.length === 0) return <EmptyState title="No places found" description="Try another search, category, or destination." />
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{state.results.length} places found</div>
      <ul aria-label="Place results" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {state.results.map((result) => <li key={result.placeId}><ResultCard result={result} selected={result.placeId === selectedPlaceId} onSelect={() => onSelect(result)} /></li>)}
      </ul>
    </>
  )
}
