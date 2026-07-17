'use client'

import type { ItineraryItem, Stop, Trip, TripCapabilities } from '@/types'
import { GooglePlacesExplorer } from '@/components/explore/GooglePlacesExplorer'

export interface ExploreDomainProps {
  trip: Trip
  stops: Stop[]
  items: ItineraryItem[]
  setItems: React.Dispatch<React.SetStateAction<ItineraryItem[]>>
  itineraryEnabled: boolean
  currentUserId: string
  capabilities: TripCapabilities
  onSelectSection: (section: 'overview' | 'plan' | 'explore' | 'bookings') => void
}

export function ExploreDomain({ trip, stops, items, setItems, itineraryEnabled, currentUserId, capabilities, onSelectSection }: ExploreDomainProps) {
  return (
    <GooglePlacesExplorer
      mode="trip"
      trips={[{ id: trip.id, title: trip.title, startDate: trip.start_date ?? null, endDate: trip.end_date ?? null, role: capabilities.role }]}
      activeTrip={trip}
      activeStops={stops}
      activeItems={items}
      setActiveItems={setItems}
      currentUserId={currentUserId}
      canEdit={capabilities.canEdit}
      itineraryEnabled={itineraryEnabled}
      onViewItinerary={() => onSelectSection('plan')}
    />
  )
}
