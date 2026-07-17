'use client'

import { MobileBottomSheet, FilterChip, InlineError, SkeletonBlock, tokens } from '@/components/mobile'
import type { ItineraryItemType } from '@/types'
import type { GooglePlaceDetail, GooglePlaceErrorCode, GooglePlaceSearchResult } from '@/lib/google-places/types'
import { safeHttpUrl, safeHttpsUrl, safeTelUrl, formatDurationMinutes } from '@/lib/google-places/pure'
import { ExploreAttribution } from './ExploreAttribution'

export type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; place: GooglePlaceDetail; reviewsEnabled: boolean }
  | { status: 'error'; code: GooglePlaceErrorCode; retryable: boolean }

const TYPES: Array<{ value: ItineraryItemType; label: string }> = [
  { value: 'place', label: 'Place' }, { value: 'activity', label: 'Activity' },
  { value: 'restaurant', label: 'Restaurant' }, { value: 'stay', label: 'Stay' },
  { value: 'transport', label: 'Transport' }, { value: 'flight', label: 'Flight' },
  { value: 'reservation', label: 'Reservation' },
]
const DURATIONS = [30, 45, 60, 90, 120, 180, 240]

function LinkButton({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return null
  return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: tokens.radius12, border: '1px solid rgba(255,255,255,.13)', color: tokens.textPrimary, textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}>{children}</a>
}

export function GooglePlaceDetailSheet({ summary, state, itemType, durationMinutes, canEdit, onItemTypeChange, onDurationChange, onClose, onRetry, onSave, onAdd }: {
  summary: GooglePlaceSearchResult | null
  state: DetailState | null
  itemType: ItineraryItemType
  durationMinutes: number
  canEdit: boolean
  onItemTypeChange: (value: ItineraryItemType) => void
  onDurationChange: (value: number) => void
  onClose: () => void
  onRetry: () => void
  onSave: () => void
  onAdd: () => void
}) {
  const detail = state?.status === 'ready' ? state.place : null
  const place = detail ?? summary
  return (
    <MobileBottomSheet open={!!summary} onClose={onClose} title="Place details">
      {!place ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {detail?.photos[0] || summary?.photoRef ? (
            <div>
              {/* The no-store proxy intentionally avoids caching Google provider content. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/places/photo?ref=${encodeURIComponent(detail?.photos[0]?.reference ?? summary!.photoRef!)}&maxWidth=1200`} alt={`Photo of ${place.name}`} style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: tokens.radius16, background: tokens.surfaceRaised }} />
              {detail?.photos[0]?.authorAttributions.length ? <div style={{ marginTop: 5, fontSize: 10.5, color: tokens.textMuted }}>Photo by {detail.photos[0].authorAttributions.map((author, index) => <span key={`${author.displayName}-${index}`}>{index ? ', ' : ''}{author.uri ? <a href={author.uri} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{author.displayName ?? 'Contributor'}</a> : author.displayName ?? 'Contributor'}</span>)}</div> : null}
            </div>
          ) : <div aria-label="No photo available" style={{ height: 140, display: 'grid', placeItems: 'center', borderRadius: tokens.radius16, background: 'linear-gradient(135deg,#1f2937,#0f766e)', color: tokens.textSecondary }}>Photo unavailable</div>}

          <section style={{ padding: 14, borderRadius: tokens.radius16, background: tokens.surfaceSolid }}>
            <h2 style={{ margin: 0, color: tokens.textPrimary, fontSize: 19, lineHeight: 1.25 }}>{place.name}</h2>
            {(place.primaryTypeLabel || place.primaryType) && <p style={{ margin: '5px 0 0', color: tokens.textMuted, fontSize: 12.5 }}>{place.primaryTypeLabel ?? place.primaryType?.replaceAll('_', ' ')}</p>}
            {place.formattedAddress && <p style={{ margin: '8px 0 0', color: tokens.textSecondary, fontSize: 13, lineHeight: 1.45 }}>{place.formattedAddress}</p>}
            {detail && <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
              {detail.rating != null && detail.userRatingCount != null && <span aria-label={`Rated ${detail.rating} out of 5 from ${detail.userRatingCount} reviews`} style={{ color: tokens.accentLight }}>{detail.rating.toFixed(1)} · {detail.userRatingCount.toLocaleString()} reviews</span>}
              {detail.openNow != null && <span style={{ color: detail.openNow ? tokens.successSoft : tokens.danger }}>{detail.openNow ? 'Open now' : 'Closed now'}</span>}
            </div>}
            <div style={{ marginTop: 12 }}><ExploreAttribution /></div>
          </section>

          {state?.status === 'loading' && <div role="status" aria-live="polite" style={{ display: 'grid', gap: 10 }}><SkeletonBlock height={76} /><SkeletonBlock height={110} /></div>}
          {state?.status === 'error' && <InlineError onRetry={state.retryable ? onRetry : undefined}>Couldn&apos;t load current place details.</InlineError>}

          {detail && (detail.currentOpeningHours || detail.regularOpeningHours) && (
            <section style={{ padding: 14, borderRadius: tokens.radius16, background: tokens.surfaceSolid }}>
              <h3 style={{ margin: '0 0 8px', color: tokens.textPrimary, fontSize: 14 }}>Opening hours</h3>
              {(detail.currentOpeningHours?.weekdayDescriptions.length ? detail.currentOpeningHours.weekdayDescriptions : detail.regularOpeningHours?.weekdayDescriptions ?? []).map((line) => <div key={line} style={{ color: tokens.textSecondary, fontSize: 12.5, lineHeight: 1.55 }}>{line}</div>)}
            </section>
          )}

          {detail && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <LinkButton href={safeHttpUrl(detail.websiteUri)}>Website</LinkButton>
              <LinkButton href={safeTelUrl(detail.internationalPhoneNumber ?? detail.nationalPhoneNumber)}>Call</LinkButton>
              <LinkButton href={safeHttpsUrl(detail.googleMapsUri)}>View on Google Maps</LinkButton>
            </div>
          )}

          {detail?.reviews.length ? (
            <section style={{ padding: 14, borderRadius: tokens.radius16, background: tokens.surfaceSolid }}>
              <h3 style={{ margin: '0 0 10px', color: tokens.textPrimary, fontSize: 14 }}>Review preview</h3>
              {detail.reviews.slice(0, 2).map((review, index) => (
                <article key={`${review.publishTime}-${index}`} style={{ paddingTop: index ? 12 : 0, marginTop: index ? 12 : 0, borderTop: index ? '1px solid rgba(255,255,255,.08)' : 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {review.authorPhotoUri && (
                      // Provider author avatars must remain uncached and directly associated with the review attribution.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={review.authorPhotoUri} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />
                    )}
                    <div style={{ color: tokens.textSecondary, fontSize: 12 }}>{review.authorUri ? <a href={review.authorUri} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{review.authorDisplayName ?? 'Google Maps reviewer'}</a> : review.authorDisplayName ?? 'Google Maps reviewer'} · {review.rating}/5</div>
                  </div>
                  {review.text && <p style={{ color: tokens.textSecondary, fontSize: 12.5, lineHeight: 1.5, margin: '8px 0 0' }}>{review.text}</p>}
                  {review.googleMapsUri && <a href={review.googleMapsUri} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 6, color: tokens.accentLight, fontSize: 11.5 }}>View source on Google Maps</a>}
                </article>
              ))}
            </section>
          ) : null}

          <section>
            <div style={{ color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>Add as</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{TYPES.map((type) => <FilterChip key={type.value} selected={itemType === type.value} onClick={() => onItemTypeChange(type.value)}>{type.label}</FilterChip>)}</div>
          </section>
          <section>
            <div style={{ color: tokens.textMuted, fontSize: 11.5, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>Estimated visit</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><FilterChip selected={durationMinutes === 0} onClick={() => onDurationChange(0)}>Flexible</FilterChip>{DURATIONS.map((duration) => <FilterChip key={duration} selected={durationMinutes === duration} onClick={() => onDurationChange(duration)}>{formatDurationMinutes(duration)}</FilterChip>)}</div>
          </section>

          {!canEdit && <p style={{ color: tokens.textMuted, fontSize: 12.5, lineHeight: 1.45, margin: 0 }}>Only owners and editors can add places.</p>}
          <div style={{ display: 'grid', gap: 10, position: 'sticky', bottom: 0, paddingTop: 6, background: tokens.glassElevatedFill }}>
            <button type="button" disabled={!canEdit} onClick={onAdd} style={{ minHeight: 48, border: 0, borderRadius: tokens.radius16, background: tokens.accentCtaGradient, color: tokens.textOnAccent, fontFamily: 'inherit', fontWeight: 800, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : .55 }}>Add to trip</button>
            <button type="button" disabled={!canEdit} onClick={onSave} style={{ minHeight: 44, borderRadius: tokens.radius12, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)', color: tokens.textPrimary, fontFamily: 'inherit', fontWeight: 700, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : .55 }}>Save to trip (Unscheduled)</button>
          </div>
        </div>
      )}
    </MobileBottomSheet>
  )
}
