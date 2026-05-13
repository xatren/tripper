export type PinCategory =
  | 'hotel'
  | 'restaurant'
  | 'scenic_view'
  | 'national_park'
  | 'gas_station'
  | 'hidden_spot'
  | 'camping'
  | 'coffee_stop'
  | 'activity'
  | 'city'
  | 'other';

export type BudgetCategory =
  | 'gas'
  | 'hotel'
  | 'food'
  | 'activities'
  | 'emergency'
  | 'misc';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface Pin {
  id: string;
  trip_id: string;
  created_by: string;
  title: string;
  description?: string;
  address?: string;
  category: PinCategory;
  lat: number;
  lng: number;
  day_number?: number;
  order_index: number;
  is_favorite: boolean;
  is_completed: boolean;
  rating?: number;
  estimated_cost?: number;
  visit_date?: string;
  stay_duration_hours?: number;
  created_at: string;
  updated_at: string;
  photos?: PinPhoto[];
}

export interface Trip {
  id: string;
  owner_id: string;
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
  pins?: Pin[];
}

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

export interface PinPhoto {
  id: string;
  pin_id: string;
  storage_path: string;
  url: string;
  caption?: string;
  uploaded_by?: string;
  created_at: string;
}

export interface BudgetItem {
  id: string;
  trip_id: string;
  pin_id?: string;
  category: BudgetCategory;
  label: string;
  amount: number;
  date?: string;
  created_by?: string;
  created_at: string;
}

export const CATEGORY_COLORS: Record<PinCategory, string> = {
  hotel: '#6366F1',
  restaurant: '#EF4444',
  scenic_view: '#10B981',
  national_park: '#059669',
  gas_station: '#64748B',
  hidden_spot: '#8B5CF6',
  camping: '#F97316',
  coffee_stop: '#92400E',
  activity: '#3B82F6',
  city: '#F59E0B',
  other: '#6B7280',
};

export const CATEGORY_ICONS: Record<PinCategory, string> = {
  hotel: '🏨',
  restaurant: '🍽️',
  scenic_view: '🏔️',
  national_park: '🌲',
  gas_station: '⛽',
  hidden_spot: '💎',
  camping: '⛺',
  coffee_stop: '☕',
  activity: '🎯',
  city: '🏙️',
  other: '📍',
};

export const CATEGORY_LABELS: Record<PinCategory, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  scenic_view: 'Scenic View',
  national_park: 'National Park',
  gas_station: 'Gas Station',
  hidden_spot: 'Hidden Spot',
  camping: 'Camping',
  coffee_stop: 'Coffee Stop',
  activity: 'Activity',
  city: 'City',
  other: 'Other',
};

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  gas: 'Gas',
  hotel: 'Hotel',
  food: 'Food',
  activities: 'Activities',
  emergency: 'Emergency',
  misc: 'Miscellaneous',
};

export const BUDGET_CATEGORY_ICONS: Record<BudgetCategory, string> = {
  gas: '⛽',
  hotel: '🏨',
  food: '🍔',
  activities: '🎯',
  emergency: '🚨',
  misc: '💳',
};

// ---- New schema types (stops / expenses / photos) ----

/** Map pin / stop category (12-cell grid on Add Location). */
export type StopPlaceCategory =
  | 'hotel'
  | 'restaurant'
  | 'scenic_view'
  | 'national_park'
  | 'gas_station'
  | 'hidden_spot'
  | 'camping'
  | 'coffee_stop'
  | 'city'
  | 'beach'
  | 'museum'
  | 'activity';

export const STOP_PLACE_LABELS: Record<StopPlaceCategory, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  scenic_view: 'Scenic View',
  national_park: 'National Park',
  gas_station: 'Gas Station',
  hidden_spot: 'Hidden Spot',
  camping: 'Camping',
  coffee_stop: 'Coffee Stop',
  city: 'City',
  beach: 'Beach',
  museum: 'Museum',
  activity: 'Activity',
};

export interface NewStopPayload {
  lat: number;
  lng: number;
  name: string;
  address: string | null;
  state: string | null;
  description: string | null;
  notes: string | null;
  place_category: StopPlaceCategory;
  rating: number | null;
  estimated_cost: number | null;
  day_number: number | null;
  arrival_date: string | null;
  is_favorite: boolean;
}

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
  /** Present after migration `004_stops_place_fields`. */
  place_category?: StopPlaceCategory | null;
  state?: string | null;
  notes?: string | null;
  rating?: number | null;
  estimated_cost?: number | null;
  day_number?: number | null;
  is_favorite?: boolean | null;
}

export interface Photo {
  id: string;
  stop_id: string;
  blob_pathname: string;
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
  distanceText: string;          // e.g. "234 km"
  distanceMeters: number;
  polylinePath: { lat: number; lng: number }[];
}

/** Stable cache key for a segment between two positions. */
export function segmentKey(
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): string {
  return `${aLat.toFixed(5)},${aLng.toFixed(5)}-${bLat.toFixed(5)},${bLng.toFixed(5)}`
}
