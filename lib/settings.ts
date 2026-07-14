'use client';

import { useState, useEffect } from 'react';

export type DistanceUnit = 'km' | 'mi';

export interface AppSettings {
  distanceUnit: DistanceUnit;
}

const DEFAULTS: AppSettings = {
  distanceUnit: 'km',
};

const KEY = 'tripper_settings';

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function persistSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

const MI_PER_KM = 0.621371;

export function formatDistanceValue(meters: number, unit: DistanceUnit): string {
  const km = meters / 1000;
  const value = unit === 'mi' ? km * MI_PER_KM : km;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${unit}`;
}

export function convertKm(km: number, unit: DistanceUnit): number {
  return unit === 'mi' ? km * MI_PER_KM : km;
}

/** Reads the distance-unit preference on mount (settings and trip screens are separate routes/mounts). */
export function useDistanceUnit(): DistanceUnit {
  const [unit, setUnit] = useState<DistanceUnit>(DEFAULTS.distanceUnit);
  useEffect(() => {
    setUnit(loadSettings().distanceUnit);
  }, []);
  return unit;
}
