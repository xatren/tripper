'use client'

import { showToast } from '@/components/ui/toast'
import { SheetOptionRow } from '../domain-ui'
import { BottomSheet } from './BottomSheet'

export interface TripAddSheetProps {
  open: boolean
  onClose: () => void
  onAddPlace: () => void
}

const PLACE_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
)
const ACTIVITY_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1L9.3 5.6L14 7L9.3 8.4L8 13L6.7 8.4L2 7L6.7 5.6L8 1Z" /></svg>
)
const STAY_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-8h6v8" /></svg>
)
const TRANSPORT_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-6a2 2 0 0 1 2-1.4h10a2 2 0 0 1 2 1.4l2 6" /><rect x="2" y="12" width="20" height="6" rx="2" /><circle cx="7" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>
)
const RESERVATION_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 5v14" strokeDasharray="2 2" /></svg>
)
const NOTE_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 13h6M9 17h6" /></svg>
)

/** Centralized "+ Add" sheet — today only Place is wired up; the rest are honest stubs. */
export function TripAddSheet({ open, onClose, onAddPlace }: TripAddSheetProps) {
  const soon = (label: string) => () => showToast(`Adding a ${label.toLowerCase()} is coming soon.`, 'info')
  const selectPlace = () => {
    onClose()
    onAddPlace()
  }

  return (
    <BottomSheet open={open} onClose={onClose} titleId="trip-add-sheet-title" title="Add to trip">
      <SheetOptionRow icon={PLACE_ICON} label="Place" hint="Search and add a destination" available onSelect={selectPlace} />
      <SheetOptionRow icon={ACTIVITY_ICON} label="Activity" available={false} onSelect={soon('Activity')} />
      <SheetOptionRow icon={STAY_ICON} label="Stay" available={false} onSelect={soon('Stay')} />
      <SheetOptionRow icon={TRANSPORT_ICON} label="Transport" available={false} onSelect={soon('Transport')} />
      <SheetOptionRow icon={RESERVATION_ICON} label="Reservation" available={false} onSelect={soon('Reservation')} />
      <SheetOptionRow icon={NOTE_ICON} label="Note" available={false} onSelect={soon('Note')} />
    </BottomSheet>
  )
}
