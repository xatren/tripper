'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { DUSK } from '@/components/design/tokens';
import { dateError } from '@/lib/trip-validation';
import { DateRangeSheet, rangeLabel } from './DateRangeSheet';
import { ACCENT, BackBtn, CalIcon, ContinueBtn, Dots, FieldError, Header, Label, Shell, nightsBetween } from './wizard-ui';

export function Step2({ startDate, setStartDate, endDate, setEndDate, onNext, onBack }: {
  startDate: string; setStartDate: (v: string) => void;
  endDate: string; setEndDate: (v: string) => void;
  onNext: () => void; onBack: () => void;
}) {
  const nights = nightsBetween(startDate, endDate);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const validate = () => {
    const nextError = dateError(startDate, endDate);
    setError(nextError);
    if (!nextError) return onNext();
    setPickerOpen(true);
  };
  const applyDates = useCallback((start: string, end: string) => {
    setStartDate(start); setEndDate(end); setError(null); setPickerOpen(false);
  }, [setStartDate, setEndDate]);
  return (
    <Shell>
      <div style={{ height: 54, flexShrink: 0 }} />
      <Header step={2} onBack={onBack} />
      <Dots step={2} />
      <Label>When are you going?</Label>

      <button type="button" onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-expanded={pickerOpen} aria-describedby={error ? 'date-error' : undefined} style={{ width: '100%', padding: '17px 18px', marginBottom: 20, borderRadius: 20, border: `1.5px solid ${error ? '#f87171' : startDate ? `${ACCENT}70` : 'rgba(255,255,255,.1)'}`, background: 'rgba(255,255,255,.045)', color: DUSK.textPrimary, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', boxShadow: startDate ? `0 0 24px ${ACCENT}12` : 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, fontWeight: 700, letterSpacing: '.9px', color: ACCENT, textTransform: 'uppercase' }}><CalIcon /> Travel dates</span>
        <span style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
          <span><small style={{ display: 'block', marginBottom: 3, color: DUSK.textMuted }}>Departure</small><strong style={{ fontSize: 18, color: startDate ? DUSK.textPrimary : 'rgba(255,255,255,.3)' }}>{rangeLabel(startDate)}</strong></span>
          <span style={{ color: ACCENT, fontSize: 18 }}>→</span>
          <span style={{ textAlign: 'right' }}><small style={{ display: 'block', marginBottom: 3, color: DUSK.textMuted }}>Return</small><strong style={{ fontSize: 18, color: endDate ? DUSK.textPrimary : 'rgba(255,255,255,.3)' }}>{rangeLabel(endDate)}</strong></span>
        </span>
        <span style={{ display: 'block', marginTop: 12, fontSize: 12, color: nights > 0 ? ACCENT : DUSK.textMuted }}>{nights > 0 ? `${nights} nights · ${nights + 1} days` : 'Tap to choose your date range'}</span>
      </button>
      <FieldError id="date-error" message={error} />

      <div style={{ borderRadius: 18, padding: '16px 18px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', marginTop: error ? 16 : 0, marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>Dates are optional</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>Leave both blank if you haven&apos;t decided yet.</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <ContinueBtn onClick={validate} />
      <BackBtn onClick={onBack} />
      <AnimatePresence><DateRangeSheet open={pickerOpen} startDate={startDate} endDate={endDate} onClose={closePicker} onApply={applyDates} /></AnimatePresence>
    </Shell>
  );
}
