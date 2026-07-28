'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUSK } from '@/components/design/tokens';
import { ACCENT, BTN_GRAD, nightsBetween } from './wizard-ui';

export function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function rangeLabel(date: string) {
  if (!date) return 'Select';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export function DateRangeSheet({ open, startDate, endDate, onClose, onApply }: {
  open: boolean; startDate: string; endDate: string;
  onClose: () => void; onApply: (start: string, end: string) => void;
}) {
  const initialMonth = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
  const [month, setMonth] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [hoveredDate, setHoveredDate] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraftStart(startDate); setDraftEnd(endDate); setHoveredDate('');
    const selected = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, startDate, endDate, onClose]);

  if (!open) return null;
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date;
  });
  const chooseDate = (value: string) => {
    if (!draftStart || draftEnd) { setDraftStart(value); setDraftEnd(''); return; }
    if (value < draftStart) { setDraftEnd(draftStart); setDraftStart(value); return; }
    setDraftEnd(value);
  };
  const canApply = Boolean(draftStart && draftEnd);
  const previewEnd = draftEnd || (hoveredDate >= draftStart ? hoveredDate : '');
  const selectedNights = draftStart && draftEnd ? nightsBetween(draftStart, draftEnd) : 0;
  const startIndex = days.findIndex(date => isoDate(date) === draftStart);
  const endIndex = days.findIndex(date => isoDate(date) === draftEnd);
  const badgeLeft = startIndex >= 0 && endIndex >= 0 && Math.floor(startIndex / 7) === Math.floor(endIndex / 7)
    ? (((startIndex % 7) + (endIndex % 7)) / 2 + .5) / 7 * 100
    : 50;
  const DATE_ACCENT = '#FFC82C';

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,12,.72)', backdropFilter: 'blur(6px)' }}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="date-range-title" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 32 }} style={{ width: '100%', maxWidth: 430, borderRadius: '28px 28px 0 0', padding: '12px 20px max(22px, env(safe-area-inset-bottom))', background: '#0F0C20', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 -20px 60px rgba(0,0,0,.55)', overflow: 'hidden' }}>
        <div style={{ width: 42, height: 4, margin: '0 auto 16px', borderRadius: 4, background: 'rgba(255,255,255,.18)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div><h3 id="date-range-title" style={{ margin: 0, fontSize: 19, color: DUSK.textPrimary }}>Select travel dates</h3><p style={{ margin: '3px 0 0', fontSize: 12, color: DUSK.textMuted }}>{draftStart && !draftEnd ? 'Now select your return date' : 'Choose departure and return'}</p></div>
          <button type="button" onClick={onClose} aria-label="Close date picker" style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.06)', color: DUSK.textPrimary, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 16, borderRadius: 16, background: 'rgba(255,200,44,.06)', border: '1px solid rgba(255,200,44,.22)' }}>
          <div><span style={{ display: 'block', fontSize: 10, color: DUSK.textMuted, textTransform: 'uppercase' }}>Departure</span><strong style={{ fontSize: 15, color: draftStart ? DUSK.textPrimary : 'rgba(255,255,255,.35)' }}>{rangeLabel(draftStart)}</strong></div>
          <span style={{ color: ACCENT }}>→</span>
          <div style={{ textAlign: 'right' }}><span style={{ display: 'block', fontSize: 10, color: DUSK.textMuted, textTransform: 'uppercase' }}>Return</span><strong style={{ fontSize: 15, color: draftEnd ? DUSK.textPrimary : 'rgba(255,255,255,.35)' }}>{rangeLabel(draftEnd)}</strong></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month" style={{ width: 44, height: 44, borderRadius: 13, border: 0, background: 'rgba(255,255,255,.05)', color: DUSK.textPrimary, fontSize: 22, cursor: 'pointer' }}>‹</button>
          <strong style={{ fontSize: 15, color: DUSK.textPrimary }}>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month" style={{ width: 44, height: 44, borderRadius: 13, border: 0, background: 'rgba(255,255,255,.05)', color: DUSK.textPrimary, fontSize: 22, cursor: 'pointer' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 5 }}>
          {['M','T','W','T','F','S','S'].map((day, index) => <span key={`${day}-${index}`} style={{ fontSize: 10, color: DUSK.textMuted, padding: 5 }}>{day}</span>)}
        </div>
        <div style={{ position: 'relative', paddingTop: 34 }}>
          <AnimatePresence>
            {canApply && (
              <motion.div
                key={`${draftStart}-${draftEnd}`}
                initial={{ opacity: 0, y: 6, scale: .92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: .94 }}
                transition={{ duration: .22, ease: 'easeOut' }}
                aria-live="polite"
                style={{ position: 'absolute', zIndex: 4, top: 0, left: `${badgeLeft}%`, translate: '-50% 0', minWidth: 88, height: 27, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', borderRadius: 999, background: DATE_ACCENT, color: '#1d1600', boxShadow: '0 5px 20px rgba(255,200,44,.26)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', pointerEvents: 'none' }}
              >
                {selectedNights} {selectedNights === 1 ? 'Night' : 'Nights'}
              </motion.div>
            )}
          </AnimatePresence>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 3 }}>
          {days.map((date, index) => {
            const value = isoDate(date); const endpoint = value === draftStart || value === draftEnd;
            const inRange = Boolean(draftStart && previewEnd && value > draftStart && value < previewEnd);
            const currentMonth = date.getMonth() === month.getMonth();
            const isStart = value === draftStart; const isEnd = value === (draftEnd || previewEnd);
            const rowStart = index % 7 === 0; const rowEnd = index % 7 === 6;
            const hasRange = Boolean(draftStart && previewEnd);
            const stripBackground = !hasRange ? 'transparent'
              : isStart && isEnd ? 'transparent'
              : isStart ? (rowEnd ? 'transparent' : 'linear-gradient(to right, transparent 0 50%, rgba(255,200,44,.15) 50% 100%)')
              : isEnd ? (rowStart ? 'transparent' : 'linear-gradient(to right, rgba(255,200,44,.15) 0 50%, transparent 50% 100%)')
              : inRange ? 'linear-gradient(90deg, rgba(255,200,44,.11), rgba(255,200,44,.19), rgba(255,200,44,.11))' : 'transparent';
            const stripRadius = inRange && rowStart ? '15px 0 0 15px' : inRange && rowEnd ? '0 15px 15px 0' : 0;
            return (
              <div key={value} onMouseEnter={() => !draftEnd && setHoveredDate(value)} onMouseLeave={() => setHoveredDate('')} style={{ height: 42, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.span aria-hidden="true" initial={false} animate={{ opacity: hasRange && (inRange || isStart || isEnd) ? 1 : 0, scaleX: hasRange && (inRange || isStart || isEnd) ? 1 : .15 }} transition={{ type: 'spring', stiffness: 360, damping: 30, delay: hasRange ? Math.min(Math.abs(index - Math.max(0, startIndex)) * .012, .12) : 0 }} style={{ position: 'absolute', left: 0, right: 0, top: 6, bottom: 6, borderRadius: stripRadius, background: stripBackground, transformOrigin: isEnd ? 'left center' : 'right center', boxShadow: inRange ? 'inset 0 1px 0 rgba(255,200,44,.08), inset 0 -1px 0 rgba(255,200,44,.05)' : 'none', willChange: 'transform, opacity' }} />
                <motion.button type="button" onClick={() => chooseDate(value)} aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full' })} aria-pressed={endpoint} initial={false} animate={endpoint ? { scale: [1, 1.15, 1], boxShadow: ['0 0 0 rgba(255,200,44,0)', '0 0 28px rgba(255,200,44,.72)', '0 5px 20px rgba(255,200,44,.38)'] } : { scale: 1, boxShadow: '0 0 0 rgba(255,200,44,0)' }} whileTap={{ scale: .9 }} transition={{ duration: .34, ease: 'easeOut' }} style={{ position: 'relative', zIndex: 1, width: 38, height: 38, padding: 0, border: endpoint ? `1px solid ${DATE_ACCENT}` : '1px solid transparent', borderRadius: '50%', background: endpoint ? DATE_ACCENT : 'transparent', color: endpoint ? DUSK.onAmber : currentMonth ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.22)', fontWeight: endpoint ? 800 : 500, cursor: 'pointer', willChange: 'transform, box-shadow' }}>{date.getDate()}</motion.button>
              </div>
            );
          })}
          </div>
        </div>
        <button type="button" onClick={() => onApply('', '')} style={{ width: '100%', minHeight: 44, marginTop: 10, border: 0, background: 'transparent', color: DUSK.textMuted, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>Dates not decided yet</button>
        <button type="button" disabled={!canApply} onClick={() => onApply(draftStart, draftEnd)} style={{ width: '100%', height: 56, borderRadius: 18, border: 0, background: canApply ? BTN_GRAD : 'rgba(255,255,255,.08)', color: canApply ? DUSK.onAmber : 'rgba(255,255,255,.3)', fontFamily: 'inherit', fontSize: 16, fontWeight: 750, cursor: canApply ? 'pointer' : 'default' }}>Apply dates</button>
      </motion.div>
    </div>
  );
}
