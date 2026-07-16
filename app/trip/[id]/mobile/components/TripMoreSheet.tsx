'use client'

import type { ReactNode } from 'react'
import type { Stop, Trip } from '@/types'
import { showToast } from '@/components/ui/toast'
import { downloadTripIcs } from '@/lib/ics'
import { computeStopSchedule, tripTitle } from '../trip-domain-utils'
import { SheetOptionRow, type MoreDestination } from '../domain-ui'
import { BottomSheet } from './BottomSheet'

export interface TripMoreSheetProps {
  open: boolean
  onClose: () => void
  onNavigate: (destination: 'budget' | 'packing' | 'journal') => void
  trip: Trip
  stops: Stop[]
}

const ICONS: Record<MoreDestination, ReactNode> = {
  budget: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 10h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  packing: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l1 4M18 2l-1 4" /><rect x="5" y="6" width="14" height="15" rx="4" /><path d="M9 10v4M15 10v4" /></svg>,
  journal: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></svg>,
  members: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  settings: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  export: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>,
  offline: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" /><path d="M12 8v4l3 2" /></svg>,
}

/** Bottom sheet listing every trip destination not on the primary nav bar. */
export function TripMoreSheet({ open, onClose, onNavigate, trip, stops }: TripMoreSheetProps) {
  const handleExport = () => {
    const nights = Object.fromEntries(stops.map((s) => [s.id, s.nights ?? 1]))
    const schedule = computeStopSchedule(trip.start_date, stops, nights)
    const events = stops
      .map((s, i) => ({ name: s.name, address: s.address, arrival: schedule[i]?.arrival, departure: schedule[i]?.departure }))
      .filter((e): e is { name: string; address: string | null; arrival: string; departure: string } => !!(e.arrival && e.departure))
    if (!events.length) {
      showToast('Set trip dates first to export the calendar.', 'info')
      return
    }
    downloadTripIcs(tripTitle(trip, stops), events)
    showToast('Calendar file downloaded.', 'success')
    onClose()
  }

  const soon = (label: string) => () => showToast(`${label} is coming soon.`, 'info')

  return (
    <BottomSheet open={open} onClose={onClose} titleId="trip-more-sheet-title" title="More">
      <SheetOptionRow icon={ICONS.budget} label="Budget" available onSelect={() => onNavigate('budget')} />
      <SheetOptionRow icon={ICONS.packing} label="Packing" available onSelect={() => onNavigate('packing')} />
      <SheetOptionRow icon={ICONS.journal} label="Journal" available onSelect={() => onNavigate('journal')} />
      <SheetOptionRow icon={ICONS.members} label="Members" available={false} onSelect={soon('Members')} />
      <SheetOptionRow icon={ICONS.settings} label="Trip settings" available={false} onSelect={soon('Trip settings')} />
      <SheetOptionRow icon={ICONS.export} label="Export" hint="Download calendar (.ics)" available onSelect={handleExport} />
      <SheetOptionRow icon={ICONS.offline} label="Offline access" available={false} onSelect={soon('Offline access')} />
    </BottomSheet>
  )
}
