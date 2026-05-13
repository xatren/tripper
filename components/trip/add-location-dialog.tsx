'use client'

import { useEffect, useState } from 'react'
import {
  Building2,
  Calendar,
  Camera,
  Coffee,
  Fuel,
  Hotel,
  Landmark,
  MapPin,
  Mountain,
  Sparkles,
  Star,
  Tent,
  Trees,
  Umbrella,
  UtensilsCrossed,
  Zap,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { NewStopPayload, StopPlaceCategory } from '@/types'
import { STOP_PLACE_LABELS } from '@/types'

const GRID_ITEMS: { id: StopPlaceCategory; Icon: LucideIcon }[] = [
  { id: 'hotel', Icon: Hotel },
  { id: 'restaurant', Icon: UtensilsCrossed },
  { id: 'scenic_view', Icon: Mountain },
  { id: 'national_park', Icon: Trees },
  { id: 'gas_station', Icon: Fuel },
  { id: 'hidden_spot', Icon: Sparkles },
  { id: 'camping', Icon: Tent },
  { id: 'coffee_stop', Icon: Coffee },
  { id: 'city', Icon: Building2 },
  { id: 'beach', Icon: Umbrella },
  { id: 'museum', Icon: Landmark },
  { id: 'activity', Icon: Zap },
]

const fieldShell =
  'rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30'

const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'

interface AddLocationDialogProps {
  open: boolean
  lat: number
  lng: number
  initialName: string
  initialAddress: string
  isResolvingAddress: boolean
  onCancel: () => void
  onConfirm: (payload: NewStopPayload) => void
}

export function AddLocationDialog({
  open,
  lat,
  lng,
  initialName,
  initialAddress,
  isResolvingAddress,
  onCancel,
  onConfirm,
}: AddLocationDialogProps) {
  const [name, setName] = useState(initialName)
  const [address, setAddress] = useState(initialAddress)
  const [state, setState] = useState('')
  const [placeCategory, setPlaceCategory] = useState<StopPlaceCategory>('scenic_view')
  const [rating, setRating] = useState(3)
  const [visitDate, setVisitDate] = useState('')
  const [cost, setCost] = useState('')
  const [dayNumber, setDayNumber] = useState('1')
  const [notes, setNotes] = useState('')
  const [description, setDescription] = useState('')
  const [favorite, setFavorite] = useState(false)

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  useEffect(() => {
    setAddress(initialAddress)
  }, [initialAddress])

  useEffect(() => {
    if (!open) {
      setState('')
      setPlaceCategory('scenic_view')
      setRating(3)
      setVisitDate('')
      setCost('')
      setDayNumber('1')
      setNotes('')
      setDescription('')
      setFavorite(false)
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim() || 'Untitled stop'
    const costNum = cost.trim() === '' ? null : parseFloat(cost)
    const dayNum = dayNumber.trim() === '' ? null : parseInt(dayNumber, 10)
    onConfirm({
      lat,
      lng,
      name: trimmed,
      address: address.trim() || null,
      state: state.trim().toUpperCase() || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
      place_category: placeCategory,
      rating: rating > 0 ? rating : null,
      estimated_cost: costNum !== null && !Number.isNaN(costNum) ? costNum : null,
      day_number: dayNum !== null && !Number.isNaN(dayNum) ? dayNum : null,
      arrival_date: visitDate || null,
      is_favorite: favorite,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto border-border/60 bg-card p-0 shadow-2xl sm:max-w-xl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 pb-4 pt-5">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/35 bg-primary/15 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Add Location</h2>
                <p className="text-xs text-muted-foreground">
                  Coords: {lat.toFixed(3)}, {lng.toFixed(3)}
                </p>
              </div>
            </div>
            <DialogClose
              type="button"
              className="rounded-full border border-border/80 bg-secondary/50 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div>
              <label className={labelClass} htmlFor="loc-name">
                Name *
              </label>
              <Input
                id="loc-name"
                className={cn(fieldShell, 'h-auto')}
                placeholder={isResolvingAddress ? 'Looking up location…' : 'e.g. Golden Gate Bridge'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="loc-address">
                  Address
                </label>
                <Input
                  id="loc-address"
                  className={cn(fieldShell, 'h-auto')}
                  placeholder={isResolvingAddress ? 'Resolving…' : 'Address...'}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="loc-state">
                  State
                </label>
                <Input
                  id="loc-state"
                  className={cn(fieldShell, 'h-auto')}
                  placeholder="CA"
                  maxLength={8}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className={labelClass}>Category</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRID_ITEMS.map(({ id, Icon }) => {
                  const active = placeCategory === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPlaceCategory(id)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center text-[11px] font-medium transition-colors sm:text-xs',
                        active
                          ? 'border-teal-500/70 bg-teal-950/35 text-teal-300 shadow-[0_0_0_1px_rgba(45,212,191,0.15)]'
                          : 'border-border bg-input/60 text-muted-foreground hover:border-border hover:bg-input hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-teal-300' : 'opacity-80')} />
                      <span className="leading-tight">{STOP_PLACE_LABELS[id]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className={labelClass}>Rating</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="rounded p-1 text-amber-400 transition-transform hover:scale-110"
                    aria-label={`${n} stars`}
                  >
                    <Star
                      className={cn('h-6 w-6', n <= rating ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground/40')}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="loc-date">
                  Date
                </label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="loc-date"
                    type="date"
                    className={cn(fieldShell, 'h-auto pl-9')}
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="loc-cost">
                  Cost $
                </label>
                <Input
                  id="loc-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  className={cn(fieldShell, 'h-auto')}
                  placeholder="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="loc-day">
                  Day #
                </label>
                <Input
                  id="loc-day"
                  type="number"
                  min={1}
                  className={cn(fieldShell, 'h-auto')}
                  placeholder="1"
                  value={dayNumber}
                  onChange={(e) => setDayNumber(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="loc-notes">
                Notes
              </label>
              <Textarea
                id="loc-notes"
                className={cn(fieldShell, 'min-h-[72px] resize-y py-2')}
                placeholder="Useful tips, reminders..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="loc-desc">
                Description
              </label>
              <Textarea
                id="loc-desc"
                className={cn(fieldShell, 'min-h-[96px] resize-y py-2')}
                placeholder="Describe this place..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={favorite}
                onChange={(e) => setFavorite(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-input accent-primary"
              />
              Mark as favorite
            </label>
          </div>

          <div className="mt-auto flex gap-3 border-t border-border/60 px-5 py-4">
            <Button type="button" variant="outline" className="flex-1 border-border bg-secondary/40" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 gap-2">
              <Camera className="h-4 w-4" />
              Add to Trip
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
