'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CURRENCY_SYMBOLS, type TripCurrency } from '@/types';
import { showToast } from '@/components/ui/toast';
import { COUNTRY_SELECTION_STORAGE_KEY } from '@/lib/trip-country-selection';
import {
  budgetError,
  currencyError,
  dateError,
  destinationsError,
  titleError,
  vibeError,
} from '@/lib/trip-validation';
import { DUSK } from '@/components/design/tokens';
import { ACCENT, BTN_GRAD, BackBtn, CalIcon, Country, Dots, FieldError, Header, Label, Shell, VIBES, fmtDate, nightsBetween } from './wizard-ui';

export function Step5({ name, vibe, startDate, endDate, destinations, budget, currency, onBack }: {
  name: string; vibe: string | null; startDate: string; endDate: string;
  destinations: Country[]; budget: string; currency: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const sym = CURRENCY_SYMBOLS[currency as TripCurrency] ?? currency;
  const raw = parseFloat(budget) || 0;
  const nights = nightsBetween(startDate, endDate);
  const perDay = nights > 0 && raw > 0 ? Math.round(raw / (nights + 1)) : 0;
  const sf = fmtDate(startDate);
  const ef = fmtDate(endDate);
  const vibeEmoji = VIBES.find(v => v.name === vibe)?.emoji ?? '✈️';

  const create = async () => {
    if (loading || done) return;
    const invalid = titleError(name) ?? vibeError(vibe) ?? dateError(startDate, endDate) ??
      destinationsError(destinations) ?? budgetError(budget) ?? currencyError(currency);
    if (invalid) {
      setSubmissionError(invalid);
      requestAnimationFrame(() => createRef.current?.focus());
      return;
    }
    setSubmissionError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('create_trip_with_stops', {
        p_title: name.trim(),
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_total_budget: raw,
        p_currency: currency,
        p_vibe: vibe,
        p_countries: destinations.map(({ code, name: countryName, flag, lat, lng, selectionOrder }) => ({
          code,
          name: countryName,
          flag,
          lat,
          lng,
          selectionOrder,
        })),
        p_focus_lat: destinations[0]?.lat ?? null,
        p_focus_lng: destinations[0]?.lng ?? null,
      });
      const tripId = (data as { trip_id?: string } | null)?.trip_id;
      if (!error && tripId) {
        sessionStorage.removeItem(COUNTRY_SELECTION_STORAGE_KEY);
        setDone(true);
        router.push(`/trip/${tripId}/mobile`);
      } else {
        showToast(error?.message ?? 'Failed to create trip. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={5} onBack={onBack} />
      <Dots step={5} />

      {/* Summary card */}
      <div style={{ borderRadius: 22, overflow: 'hidden', marginBottom: 20, border: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ height: 4, background: BTN_GRAD }} />
        <div style={{ padding: '20px 18px', background: 'rgba(255,255,255,.04)', backdropFilter: 'blur(16px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: `${ACCENT}22`, border: `1.5px solid ${ACCENT}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
              {vibeEmoji}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,.95)', letterSpacing: '-.4px' }}>{name || 'My Trip'}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>{vibe ? `${vibe} trip` : 'Road trip'}</div>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '0 0 14px' }} />
          {(startDate || endDate) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <CalIcon color="rgba(255,255,255,.4)" />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
                {startDate ? `${sf.day} ${sf.my}` : '—'} → {endDate ? `${ef.day} ${ef.my}` : '—'}
                {nights > 0 && <span style={{ color: 'rgba(255,255,255,.3)', marginLeft: 8 }}>({nights}n)</span>}
              </span>
            </div>
          )}
          {destinations.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {destinations.map(d => (
                <span key={d.name} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 10, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.6)' }}>
                  {d.flag} {d.name}
                </span>
              ))}
            </div>
          )}
          {raw > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Budget</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,.9)' }}>{sym}{raw.toLocaleString()}</span>
                {perDay > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: `${ACCENT}22`, color: ACCENT, fontWeight: 600 }}>
                    {sym}{perDay}/day
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Label>Invite a co-pilot</Label>
      <div style={{ borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', marginBottom: 24 }}>
        <span style={{ fontSize: 16 }}>🔗</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.5 }}>
          An invite code is generated with your trip — copy it anytime from your trips list.
        </span>
      </div>

      <BackBtn onClick={onBack} />
      <FieldError id="create-error" message={submissionError} />
      <div style={{ height: 12 }} />
      <button
        ref={createRef}
        onClick={create}
        disabled={loading || done}
        aria-describedby={submissionError ? 'create-error' : undefined}
        style={{ width: '100%', height: 70, borderRadius: 22, background: done ? 'linear-gradient(130deg, #14532d, #22c55e)' : BTN_GRAD, border: 'none', cursor: loading || done ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 18, fontWeight: 700, color: done ? DUSK.textPrimary : DUSK.onAmber, letterSpacing: '-.3px', outline: 'none', boxShadow: done ? '0 8px 32px rgba(34,197,94,.4)' : `0 8px 32px ${ACCENT}55`, transition: 'all .4s ease' }}
      >
        {done ? '✓ Trip Created!' : loading ? 'Creating...' : 'Create Trip 🚀'}
      </button>
    </Shell>
  );
}
