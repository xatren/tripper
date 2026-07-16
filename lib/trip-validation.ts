import type { TripCountry, TripCurrency, TripVibe } from '@/types';

export const TRIP_CURRENCIES: readonly TripCurrency[] = ['USD', 'EUR', 'GBP', 'TRY'];
export const TRIP_VIBES: readonly TripVibe[] = ['Road', 'Fly', 'Camp', 'Beach', 'Mountain', 'Backpack'];
export const MAX_TRIP_BUDGET = 99_999_999.99;

export function titleError(title: string): string | null {
  return title.trim() ? null : 'Enter a name for your trip.';
}

export function vibeError(vibe: string | null): string | null {
  return vibe && (TRIP_VIBES as readonly string[]).includes(vibe)
    ? null
    : 'Choose a trip vibe.';
}

export function dateError(startDate: string, endDate: string): string | null {
  if (!startDate && !endDate) return null;
  if (!startDate) return 'Choose a departure date or clear the return date.';
  if (!endDate) return 'Choose a return date or clear the departure date.';
  return endDate < startDate ? 'Return date must be on or after departure.' : null;
}

export function destinationsError(destinations: TripCountry[]): string | null {
  if (destinations.length === 0) return 'Add at least one destination.';
  return destinations.every(country =>
    Boolean(country.name.trim()) &&
    Boolean(country.flag.trim()) &&
    Number.isFinite(country.lat) && country.lat >= -90 && country.lat <= 90 &&
    Number.isFinite(country.lng) && country.lng >= -180 && country.lng <= 180
  ) ? null : 'One or more destinations are invalid. Remove them and add them again.';
}

export function budgetError(budget: string): string | null {
  if (!budget.trim()) return null;
  const amount = Number(budget);
  if (!Number.isFinite(amount)) return 'Enter a valid budget amount.';
  if (amount < 0) return 'Budget cannot be negative.';
  if (amount > MAX_TRIP_BUDGET) return 'Budget must be 99,999,999.99 or less.';
  return null;
}

export function currencyError(currency: string): string | null {
  return (TRIP_CURRENCIES as readonly string[]).includes(currency)
    ? null
    : 'Choose a supported currency.';
}
