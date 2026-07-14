export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface Trip {
  id: string;
  owner_id: string;
  /** @deprecated Collaboration is represented by trip_members. */
  collaborator_id?: string | null;
  title: string;
  description?: string | null;
  cover_image_url?: string;
  start_date?: string | null;
  end_date?: string | null;
  total_budget: number;
  invite_code: string;
  created_at: string;
  updated_at: string;
  members?: TripMember[];
  /** Default map focus point (e.g. the first destination country picked during creation). */
  focus_lat?: number | null;
  focus_lng?: number | null;
  /** Present after migration `008_trip_persistence`. */
  currency?: TripCurrency;
  vibe?: TripVibe | null;
  /** Present after migration `009_trip_countries`. */
  countries?: TripCountry[];
}

/** Destination country picked in the New Trip wizard (migration `009_trip_countries`). */
export interface TripCountry {
  name: string;
  flag: string;
  lat: number;
  lng: number;
}

/** Currencies offered in the New Trip wizard (migration `008_trip_persistence`). */
export type TripCurrency = 'USD' | 'EUR' | 'GBP' | 'TRY';

export const CURRENCY_SYMBOLS: Record<TripCurrency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  TRY: '₺',
};

/** Trip vibes offered in the New Trip wizard (migration `008_trip_persistence`). */
export type TripVibe = 'Road' | 'Fly' | 'Camp' | 'Beach' | 'Mountain' | 'Backpack';

export interface TripMember {
  trip_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile?: Profile;
}

export interface Profile {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

// ---- New schema types (stops / expenses / photos) ----

export interface Stop {
  id: string;
  trip_id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  order_index: number;
  stop_type: 'origin' | 'destination' | 'waypoint' | 'overnight';
  created_by: string | null;
  created_at: string;
  state?: string | null;
  notes?: string | null;
  rating?: number | null;
  estimated_cost?: number | null;
  day_number?: number | null;
  is_favorite?: boolean | null;
  /** Present after migration `008_trip_persistence`. */
  nights?: number;
}

/** Daily journal entry (migration `011_journal`). */
export interface JournalEntry {
  id: string;
  trip_id: string;
  /** ISO date (YYYY-MM-DD). */
  entry_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  journal_photos?: JournalPhoto[];
}

/** Photo attached to a journal entry, stored in the `trip-photos` bucket (migration `011_journal`). */
export interface JournalPhoto {
  id: string;
  entry_id: string;
  /** Object path inside the `trip-photos` bucket, e.g. `{trip_id}/{uuid}.jpg`. */
  storage_path: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export type ExpenseCategory =
  | 'fuel'
  | 'food'
  | 'lodging'
  | 'activities'
  | 'transport'
  | 'other';

export interface Expense {
  id: string;
  trip_id: string;
  stop_id: string | null;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  paid_by: string | null;
  created_at: string;
}

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'food', label: 'Food & Drinks' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'activities', label: 'Activities' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
];

/** Driving route segment fetched from the Directions API. */
export interface RouteSegment {
  durationText: string;          // e.g. "2 hours 15 mins"
  durationSeconds: number;
  distanceMeters: number;
  polylinePath: { lat: number; lng: number }[];
}
