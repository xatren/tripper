'use client'

import { useState } from 'react'
import { Check, MapPinPlus } from 'lucide-react'
import { MobileBottomSheet } from '@/components/mobile'
import styles from './AddToRouteButton.module.css'

export interface AddToRouteTripOption {
  id: string
  title: string
}

export interface AddToRouteButtonProps {
  placeName: string
  /** True once this place is already on the active trip's route (§9.3 "Already in route"). */
  isAdded: boolean
  /** This place's insert is in flight — disables the button without touching any other card's state. */
  saving: boolean
  /** Owner/editor trips only (`editableTrips`). Empty means "Start a trip here" (§9.3). */
  trips: readonly AddToRouteTripOption[]
  onAddToTrip: (tripId: string) => void
  onStartTrip: () => void
  className?: string
}

/**
 * The four states of §9.3: already added, saving, zero editable trips (start
 * a trip), and one-or-many editable trips (add directly, or pick one first).
 * Supabase writes and the toast/rollback contract live in the caller
 * (`DiscoverClient`), mirroring `insertPlace`/`handleAddStop` keeping all
 * network logic out of the leaf component.
 */
export function AddToRouteButton({
  placeName,
  isAdded,
  saving,
  trips,
  onAddToTrip,
  onStartTrip,
  className,
}: AddToRouteButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  if (isAdded) {
    return (
      <button type="button" className={`${styles.button} ${styles.added} ${className ?? ''}`} disabled aria-disabled="true">
        <Check size={15} aria-hidden="true" />
        In your route
      </button>
    )
  }

  const label = trips.length === 0 ? 'Start a trip here' : 'Add to Route'

  const handleClick = () => {
    if (saving) return
    if (trips.length === 0) { onStartTrip(); return }
    if (trips.length === 1) { onAddToTrip(trips[0].id); return }
    setPickerOpen(true)
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.button} ${className ?? ''}`}
        onClick={handleClick}
        disabled={saving}
        aria-busy={saving}
      >
        <MapPinPlus size={15} aria-hidden="true" />
        {saving ? 'Adding…' : label}
      </button>

      <MobileBottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={`Add ${placeName} to`}>
        <ul className={styles.tripList}>
          {trips.map((trip) => (
            <li key={trip.id}>
              <button
                type="button"
                className={styles.tripOption}
                onClick={() => { setPickerOpen(false); onAddToTrip(trip.id) }}
              >
                {trip.title}
              </button>
            </li>
          ))}
        </ul>
      </MobileBottomSheet>
    </>
  )
}
