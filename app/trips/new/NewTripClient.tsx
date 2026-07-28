'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  COUNTRY_SELECTION_STORAGE_KEY,
  EMPTY_COUNTRY_SELECTION,
  parseCountrySelection,
  serializeCountrySelection,
  type CountrySelectionState,
} from '@/lib/trip-country-selection';
import { Step1 } from '@/components/trips/new/Step1';
import { Step2 } from '@/components/trips/new/Step2';
import { Step3 } from '@/components/trips/new/Step3';
import { Step4 } from '@/components/trips/new/Step4';
import { Step5 } from '@/components/trips/new/Step5';
import { nightsBetween } from '@/components/trips/new/wizard-ui';

// ─── Root Wizard ──────────────────────────────────────────────────────────────

export function NewTripClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dir,  setDir]  = useState(1);

  const [name,        setName]        = useState('');
  const [vibe,        setVibe]        = useState<string | null>(null);
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [countrySelection, setCountrySelection] = useState<CountrySelectionState>(EMPTY_COUNTRY_SELECTION);
  const [countryDraftHydrated, setCountryDraftHydrated] = useState(false);
  const [budget,      setBudget]      = useState('');
  const [currency,    setCurrency]    = useState('EUR');

  useEffect(() => {
    const saved = parseCountrySelection(sessionStorage.getItem(COUNTRY_SELECTION_STORAGE_KEY));
    if (saved) setCountrySelection(saved);
    setCountryDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (!countryDraftHydrated) return;
    sessionStorage.setItem(COUNTRY_SELECTION_STORAGE_KEY, serializeCountrySelection(countrySelection));
  }, [countryDraftHydrated, countrySelection]);

  const destinations = countrySelection.countries;

  const nights = nightsBetween(startDate, endDate);

  const next = useCallback(() => { setDir(1);  setStep(s => s + 1); }, []);
  const back = useCallback(() => {
    if (step === 1) { router.back(); return; }
    setDir(-1); setStep(s => s - 1);
  }, [step, router]);

  const variants = {
    enter:  (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (d: number) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  const common = { onNext: next, onBack: back };

  return (
    <div style={{ width: '100%', minHeight: '100svh', background: '#000010', fontFamily: "var(--font-inter),'Inter',system-ui,-apple-system,sans-serif", overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0 }
        input[type=number] { -moz-appearance:textfield }
        * { scrollbar-width:none }
        *::-webkit-scrollbar { display:none }
      `}</style>

      <AnimatePresence custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, minHeight: '100svh' }}
        >
          {step === 1 && <Step1 name={name} setName={setName} vibe={vibe} setVibe={setVibe} {...common} />}
          {step === 2 && <Step2 startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} {...common} />}
          {step === 3 && <Step3 selection={countrySelection} setSelection={setCountrySelection} {...common} />}
          {step === 4 && <Step4 budget={budget} setBudget={setBudget} currency={currency} setCurrency={setCurrency} nights={nights} {...common} />}
          {step === 5 && <Step5 name={name} vibe={vibe} startDate={startDate} endDate={endDate} destinations={destinations} budget={budget} currency={currency} onBack={back} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
