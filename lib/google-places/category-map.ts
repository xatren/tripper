import type { ItineraryItemType } from '@/types'

export const GOOGLE_PLACE_CATEGORIES = [
  { id: 'all', label: 'All', nearbyTypes: [] as string[], textType: null, itemType: 'place' as ItineraryItemType, durationMinutes: 60 },
  { id: 'restaurants', label: 'Restaurants', nearbyTypes: ['restaurant'], textType: 'restaurant', itemType: 'restaurant' as ItineraryItemType, durationMinutes: 75 },
  { id: 'cafes', label: 'Cafes', nearbyTypes: ['cafe', 'coffee_shop'], textType: 'cafe', itemType: 'restaurant' as ItineraryItemType, durationMinutes: 45 },
  { id: 'attractions', label: 'Attractions', nearbyTypes: ['tourist_attraction'], textType: 'tourist_attraction', itemType: 'activity' as ItineraryItemType, durationMinutes: 90 },
  { id: 'museums', label: 'Museums', nearbyTypes: ['museum'], textType: 'museum', itemType: 'activity' as ItineraryItemType, durationMinutes: 120 },
  { id: 'parks', label: 'Parks', nearbyTypes: ['park'], textType: 'park', itemType: 'activity' as ItineraryItemType, durationMinutes: 60 },
  { id: 'hotels', label: 'Hotels', nearbyTypes: ['hotel', 'lodging'], textType: 'hotel', itemType: 'stay' as ItineraryItemType, durationMinutes: 0 },
  { id: 'shopping', label: 'Shopping', nearbyTypes: ['shopping_mall', 'store'], textType: 'shopping_mall', itemType: 'activity' as ItineraryItemType, durationMinutes: 60 },
  { id: 'nightlife', label: 'Nightlife', nearbyTypes: ['bar', 'night_club'], textType: 'bar', itemType: 'activity' as ItineraryItemType, durationMinutes: 120 },
] as const

export type GooglePlaceCategoryId = (typeof GOOGLE_PLACE_CATEGORIES)[number]['id']

export function isGooglePlaceCategory(value: string): value is GooglePlaceCategoryId {
  return GOOGLE_PLACE_CATEGORIES.some((category) => category.id === value)
}

export function googleCategory(value: GooglePlaceCategoryId) {
  return GOOGLE_PLACE_CATEGORIES.find((category) => category.id === value) ?? GOOGLE_PLACE_CATEGORIES[0]
}

export function googleTypeToItineraryType(primaryType: string | null): ItineraryItemType {
  if (!primaryType) return 'place'
  if (primaryType === 'restaurant' || primaryType === 'cafe' || primaryType === 'coffee_shop' || primaryType.endsWith('_restaurant')) return 'restaurant'
  if (primaryType === 'hotel' || primaryType === 'lodging' || primaryType === 'hostel' || primaryType === 'motel' || primaryType === 'resort_hotel') return 'stay'
  if (primaryType === 'airport') return 'flight'
  if (primaryType.includes('transit') || primaryType.includes('station') || primaryType === 'bus_stop') return 'transport'
  if (primaryType === 'museum' || primaryType === 'tourist_attraction' || primaryType === 'park' || primaryType === 'zoo' || primaryType === 'aquarium') return 'activity'
  return 'place'
}

