export type MemberRole = 'owner' | 'editor' | 'viewer';

/** Server-derived presentation permissions. RLS remains the security boundary. */
export interface TripCapabilities {
  role: MemberRole;
  canEdit: boolean;
  canManageTrip: boolean;
}

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
  /** ISO 3166-1 alpha-2 code. Optional for trips created before the country-picker redesign. */
  code?: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
  /** Stable visit order; array order remains the backwards-compatible source of truth. */
  selectionOrder?: number;
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

export type TripCommentEntityType =
  | 'trip' | 'stop' | 'itinerary_item' | 'reservation' | 'expense'
  | 'packing_item' | 'journal_entry' | 'trip_task';

export interface TripComment {
  id: string;
  trip_id: string;
  entity_type: TripCommentEntityType;
  entity_id: string;
  body: string;
  created_by: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TripActivityType =
  | 'item_created' | 'item_moved' | 'item_completed'
  | 'reservation_created' | 'reservation_status_changed'
  | 'member_joined' | 'member_role_changed' | 'member_removed'
  | 'invite_rotated' | 'comment_created';

export interface TripActivity {
  id: number;
  trip_id: string;
  event_type: TripActivityType;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
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

// ---- Unified itinerary (migration `20260716120000_itinerary_items`) ----

export type ItineraryItemType =
  | 'place'
  | 'activity'
  | 'stay'
  | 'flight'
  | 'transport'
  | 'restaurant'
  | 'reservation'
  | 'note'
  | 'free_time';

export type ItineraryItemStatus =
  | 'planned'
  | 'on_the_way'
  | 'arrived'
  | 'completed'
  | 'skipped';

/**
 * One entry on the daily timeline. `stops` stays the geographic route
 * backbone; an item may reference the stop it happens at via `stop_id`.
 * Stops without a linked item are projected into the timeline client-side
 * (see app/trip/[id]/mobile/itinerary-projection.ts) — no backfill required.
 */
export interface ItineraryItem {
  id: string;
  trip_id: string;
  stop_id: string | null;
  item_type: ItineraryItemType;
  title: string;
  notes: string | null;
  /** Absolute instants for timed items; null for date-only/all-day entries. */
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  /** Wall-clock day (YYYY-MM-DD) driving day grouping; null = unscheduled. */
  local_date: string | null;
  /** IANA zone the times were picked in. */
  timezone: string | null;
  order_index: number;
  lat: number | null;
  lng: number | null;
  address: string | null;
  /** Narrow provider identity; never contains an uncontrolled provider response. */
  place_provider: 'google' | 'mapbox' | null;
  external_place_id: string | null;
  normalized_address: string | null;
  /** User-selected expected visit length; independent from optional start/end time. */
  duration_minutes: number | null;
  estimated_cost: number | null;
  currency: TripCurrency | null;
  status: ItineraryItemStatus;
  is_locked: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Real bookings (migration `20260716233000_reservations`) ----

export type ReservationType =
  | 'flight'
  | 'stay'
  | 'car_rental'
  | 'train'
  | 'ferry'
  | 'restaurant'
  | 'activity'
  | 'pass'
  | 'other';

export type ReservationPaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'refunded';

export type ReservationStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed';

/**
 * A traveller's own booking record — distinct from the external partner-search
 * links on the Bookings screen. May optionally point at the itinerary item it
 * realizes (`itinerary_item_id`, SET NULL on item delete).
 */
export interface Reservation {
  id: string;
  trip_id: string;
  itinerary_item_id: string | null;
  reservation_type: ReservationType;
  provider: string | null;
  title: string;
  confirmation_number: string | null;
  start_at: string | null;
  end_at: string | null;
  /** IANA zone the times were entered in. */
  timezone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  amount: number | null;
  currency: TripCurrency | null;
  payment_status: ReservationPaymentStatus;
  status: ReservationStatus;
  booking_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  reservation_attachments?: ReservationAttachment[];
}

/**
 * Document attached to a reservation, stored in the private `trip-documents`
 * bucket under `{trip_id}/reservations/{reservation_id}/{uuid}.{ext}`.
 * Rows are immutable — replacing a file is delete + insert with a fresh path.
 */
export interface ReservationAttachment {
  id: string;
  reservation_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

/** Daily journal entry (migration `011_journal`). */
export interface JournalEntry {
  id: string;
  trip_id: string;
  /** ISO date (YYYY-MM-DD). */
  entry_date: string;
  note: string | null;
  /** Optional plan association; journal data remains a separate source. */
  itinerary_item_id?: string | null;
  /** User/device occurrence time. `created_at` remains the server record time. */
  occurred_at?: string | null;
  visibility?: 'trip' | 'private';
  is_hidden?: boolean;
  /** Only populated after the user explicitly chooses a location. */
  location_lat?: number | null;
  location_lng?: number | null;
  created_by: string | null;
  created_at: string;
  journal_photos?: JournalPhoto[];
}

export type TripEventType = 'arrived' | 'completed' | 'photo' | 'note' | 'unplanned' | 'expense-link';

/** Immutable plan-history or user-authored travel event (Phase 13). */
export interface TripEvent {
  id: string;
  trip_id: string;
  itinerary_item_id: string | null;
  event_type: TripEventType;
  occurred_at: string;
  recorded_at: string;
  created_by: string | null;
  visibility: 'trip' | 'private';
  metadata: Record<string, string | number | boolean | null>;
  is_hidden: boolean;
  idempotency_key: string;
  updated_at: string;
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

export type ExpenseSplitType = 'equal' | 'exact' | 'percentage';

export interface Expense {
  id: string;
  trip_id: string;
  stop_id: string | null;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  paid_by: string | null;
  created_at: string;
  /** Present after migration `20260717010000_expense_splits`. */
  split_type: ExpenseSplitType;
  /** Editable date shown in the UI; independent from created_at. */
  expense_date: string;
  itinerary_item_id: string | null;
  expense_splits?: ExpenseSplit[];
}

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'food', label: 'Food & Drinks' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'activities', label: 'Activities' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
];

/**
 * A participant's resolved share of an expense (migration
 * `20260717010000_expense_splits`). Rows are written only through the
 * `save_expense_with_splits` RPC, which enforces that shares reconcile
 * exactly to the expense total. `member_id` is SET NULL on account deletion,
 * mirroring `expenses.paid_by`'s attribution contract.
 */
export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string | null;
  /** Percentage (0-100) when the parent expense's split_type is 'percentage'; null otherwise. */
  share_value: number | null;
  share_amount_minor: number;
  created_at: string;
}

export type SettlementStatus = 'settled' | 'reopened';

/**
 * A persisted "mark paid" / undo record (migration
 * `20260717020000_settlements`). Written only through the
 * `record_settlement_payment`/`reopen_settlement` RPCs, which enforce
 * idempotency via a client-generated `idempotency_key`.
 */
export interface Settlement {
  id: string;
  trip_id: string;
  from_member: string | null;
  to_member: string | null;
  amount_minor: number;
  status: SettlementStatus;
  idempotency_key: string;
  note: string | null;
  created_by: string | null;
  settled_at: string;
  reopened_at: string | null;
  created_at: string;
}

/**
 * Private receipt attached to an expense, stored in the shared
 * `trip-documents` bucket under `{trip_id}/expenses/{expense_id}/{uuid}.{ext}`
 * (migration `20260717030000_expense_receipts`). Rows are immutable —
 * replacing a file is delete + insert with a fresh path.
 */
export interface ExpenseReceipt {
  id: string;
  expense_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

/** Driving route segment fetched from the Directions API. */
export interface RouteSegment {
  durationText: string;          // e.g. "2 hours 15 mins"
  durationSeconds: number;
  distanceMeters: number;
  polylinePath: { lat: number; lng: number }[];
}
