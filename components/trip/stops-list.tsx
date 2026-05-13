'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, MapPin, Trash2, Edit2, Calendar, Star } from 'lucide-react'
import type { Stop, StopPlaceCategory } from '@/types'
import { STOP_PLACE_LABELS } from '@/types'

interface StopsListProps {
  stops: Stop[]
  selectedStopId: string | null
  onSelectStop: (id: string | null) => void
  onUpdateStop: (stopId: string, updates: Partial<Stop>) => void
  onDeleteStop: (stopId: string) => void
  onReorderStops: (stops: Stop[]) => void
  compact?: boolean
}

export function StopsList({
  stops,
  selectedStopId,
  onSelectStop,
  onUpdateStop,
  onDeleteStop,
  onReorderStops,
  compact = false,
}: StopsListProps) {
  const [editingStop, setEditingStop] = useState<Stop | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = stops.findIndex((s) => s.id === active.id)
      const newIndex = stops.findIndex((s) => s.id === over.id)
      const reordered = arrayMove(stops, oldIndex, newIndex).map((s, i) => ({
        ...s,
        order_index: i,
      }))
      onReorderStops(reordered)
    }
  }

  if (stops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MapPin className="mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="mb-1 font-medium text-foreground">No stops yet</h3>
        <p className="text-sm text-muted-foreground">
          Search for places on the map to add stops to your trip
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {stops.length} Stop{stops.length !== 1 ? 's' : ''}
        </h2>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {stops.map((stop, index) => (
              <SortableStopItem
                key={stop.id}
                stop={stop}
                index={index}
                isSelected={stop.id === selectedStopId}
                isLast={index === stops.length - 1}
                onSelect={() => onSelectStop(stop.id)}
                onEdit={() => setEditingStop(stop)}
                onDelete={() => onDeleteStop(stop.id)}
                compact={compact}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={!!editingStop} onOpenChange={() => setEditingStop(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Stop</DialogTitle>
          </DialogHeader>
          {editingStop && (
            <StopEditForm
              stop={editingStop}
              onSave={(updates) => {
                onUpdateStop(editingStop.id, updates)
                setEditingStop(null)
              }}
              onCancel={() => setEditingStop(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function SortableStopItem({
  stop,
  index,
  isSelected,
  isLast,
  onSelect,
  onEdit,
  onDelete,
  compact,
}: {
  stop: Stop
  index: number
  isSelected: boolean
  isLast: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  compact: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
  })

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg border transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border/50 bg-card/50 hover:border-border'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {index + 1}
        </div>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={onSelect}>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-medium text-foreground">{stop.name}</p>
            <span className="shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
              {STOP_PLACE_LABELS[(stop.place_category ?? 'scenic_view') as StopPlaceCategory]}
            </span>
            {stop.is_favorite && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorite" />
            )}
          </div>
          {!compact && stop.address && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{stop.address}</p>
          )}
          {!compact && (stop.arrival_date || stop.departure_date) && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {stop.arrival_date &&
                new Date(stop.arrival_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              {stop.arrival_date && stop.departure_date && ' - '}
              {stop.departure_date &&
                new Date(stop.departure_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
            </div>
          )}
        </div>

        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!isLast && <div className="absolute left-[52px] top-full z-10 h-2 w-0.5 bg-border" />}
    </div>
  )
}

function StopEditForm({
  stop,
  onSave,
  onCancel,
}: {
  stop: Stop
  onSave: (updates: Partial<Stop>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(stop.name)
  const [address, setAddress] = useState(stop.address || '')
  const [state, setState] = useState(stop.state || '')
  const [placeCategory, setPlaceCategory] = useState<StopPlaceCategory>(
    (stop.place_category ?? 'scenic_view') as StopPlaceCategory
  )
  const [rating, setRating] = useState(stop.rating?.toString() ?? '')
  const [estimatedCost, setEstimatedCost] = useState(
    stop.estimated_cost != null ? String(stop.estimated_cost) : ''
  )
  const [dayNumber, setDayNumber] = useState(stop.day_number?.toString() ?? '')
  const [notes, setNotes] = useState(stop.notes || '')
  const [description, setDescription] = useState(stop.description || '')
  const [arrivalDate, setArrivalDate] = useState(stop.arrival_date || '')
  const [departureDate, setDepartureDate] = useState(stop.departure_date || '')
  const [isFavorite, setIsFavorite] = useState(!!stop.is_favorite)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = rating.trim() === '' ? null : parseInt(rating, 10)
    const cost = estimatedCost.trim() === '' ? null : parseFloat(estimatedCost)
    const day = dayNumber.trim() === '' ? null : parseInt(dayNumber, 10)
    onSave({
      name,
      address: address.trim() || null,
      state: state.trim().toUpperCase() || null,
      place_category: placeCategory,
      rating: r !== null && !Number.isNaN(r) ? Math.min(5, Math.max(1, r)) : null,
      estimated_cost: cost !== null && !Number.isNaN(cost) ? cost : null,
      day_number: day !== null && !Number.isNaN(day) ? day : null,
      notes: notes.trim() || null,
      description: description || null,
      arrival_date: arrivalDate || null,
      departure_date: departureDate || null,
      is_favorite: isFavorite,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input id="state" value={state} onChange={(e) => setState(e.target.value)} maxLength={8} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={placeCategory}
          onChange={(e) => setPlaceCategory(e.target.value as StopPlaceCategory)}
        >
          {(Object.keys(STOP_PLACE_LABELS) as StopPlaceCategory[]).map((id) => (
            <option key={id} value={id}>
              {STOP_PLACE_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rating">Rating (1–5)</Label>
          <Input
            id="rating"
            type="number"
            min={1}
            max={5}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cost">Cost $</Label>
          <Input
            id="cost"
            type="number"
            step="0.01"
            min={0}
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dayn">Day #</Label>
          <Input id="dayn" type="number" min={1} value={dayNumber} onChange={(e) => setDayNumber(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="arrival">Arrival Date</Label>
          <Input
            id="arrival"
            type="date"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="departure">Departure Date</Label>
          <Input
            id="departure"
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe this place..."
          rows={3}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isFavorite}
          onChange={(e) => setIsFavorite(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Mark as favorite
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save Changes</Button>
      </div>
    </form>
  )
}
