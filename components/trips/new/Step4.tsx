'use client';

import { useRef, useState } from 'react';
import { CURRENCY_SYMBOLS, type TripCurrency } from '@/types';
import { budgetError, currencyError } from '@/lib/trip-validation';
import { ACCENT, BTN_GRAD, BackBtn, CalIcon, ContinueBtn, Dots, FieldError, Header, Label, Shell } from './wizard-ui';

const CURRENCIES = Object.keys(CURRENCY_SYMBOLS) as TripCurrency[];

export function Step4({ budget, setBudget, currency, setCurrency, nights, onNext, onBack }: {
  budget: string; setBudget: (v: string) => void;
  currency: string; setCurrency: (v: string) => void;
  nights: number; onNext: () => void; onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sym = CURRENCY_SYMBOLS[currency as TripCurrency] ?? currency;
  const raw = parseFloat(budget) || 0;
  const perDay = nights > 0 && raw > 0 ? Math.round(raw / (nights + 1)) : 0;
  const maxBudget = currency === 'TRY' ? 100000 : 10000;
  const barW = Math.min(100, (raw / maxBudget) * 100);
  const validate = () => {
    const nextError = budgetError(budget) ?? currencyError(currency);
    setError(nextError);
    if (!nextError) return onNext();
    if (budgetError(budget)) inputRef.current?.focus();
    else currencyRef.current?.focus();
  };

  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={4} onBack={onBack} />
      <Dots step={4} />
      <Label htmlFor="trip-total-budget">Total budget</Label>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: ACCENT, opacity: .85, marginBottom: 4 }}>{sym}</span>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'text' }}>
          <span style={{ fontSize: 64, fontWeight: 900, letterSpacing: '-3px', color: raw > 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.15)', lineHeight: 1 }}>
            {raw > 0 ? raw.toLocaleString() : '0'}
          </span>
          {focused && (
            <span style={{ width: 3, height: 52, background: ACCENT, marginLeft: 4, borderRadius: 2, display: 'inline-block', animation: 'cursorBlink 1s step-end infinite' }} />
          )}
          <input
            id="trip-total-budget"
            ref={inputRef}
            type="number"
            value={budget}
            min="0"
            max="99999999.99"
            step="0.01"
            inputMode="decimal"
            aria-label="Total budget"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'budget-error' : undefined}
            onChange={e => { setBudget(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') validate(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'text' }}
          />
        </div>
        <FieldError id="budget-error" message={error} />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 32 }}>
        {CURRENCIES.map((c, index) => (
          <button ref={index === 0 ? currencyRef : undefined} key={c} aria-pressed={currency === c} onClick={() => { setCurrency(c); setError(null); }} style={{ height: 36, borderRadius: 18, padding: '0 16px', background: currency === c ? `${ACCENT}22` : 'rgba(255,255,255,.05)', border: `1.5px solid ${currency === c ? ACCENT : 'rgba(255,255,255,.1)'}`, fontSize: 13, fontWeight: 600, color: currency === c ? ACCENT : 'rgba(255,255,255,.5)', cursor: 'pointer', outline: 'none', transition: 'all .2s', fontFamily: 'inherit' }}>
            {c}
          </button>
        ))}
      </div>

      {raw > 0 && (
        <div style={{ borderRadius: 18, padding: '16px 18px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CalIcon />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>Per day</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>{nights} nights</div>
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'rgba(255,255,255,.9)' }}>~{sym}{perDay.toLocaleString()}</div>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${barW}%`, background: BTN_GRAD, borderRadius: 2, transition: 'width .4s ease' }} />
          </div>
        </div>
      )}

      <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.25)', margin: '0 0 20px' }}>You can always update this later</p>

      <div style={{ flex: 1 }} />
      <ContinueBtn onClick={validate} />
      <BackBtn onClick={onBack} />
    </Shell>
  );
}
