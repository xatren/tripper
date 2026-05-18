'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Search, Clock, DollarSign, FileText, Loader2, MapPin, Check,
} from 'lucide-react'
import type { Stop, ActivityCategory, Activity } from '@/types'
import { ACTIVITY_CATEGORY_CONFIG } from '@/types'

const CATEGORIES: ActivityCategory[] = [
  'nature', 'culture', 'history', 'food', 'entertainment', 'all',
]

interface SelectedPlace {
  name: string
  address: string
  lat: number
  lng: number
  placeId: string
}

interface ActivityQuickAddSheetProps {
  open: boolean
  stop: Stop
  tripId: string
  currentUserId: string
  existingCount: number
  onClose: () => void
  onAdd: (activity: Omit<Activity, 'id' | 'created_at'>) => Promise<void>
}

export function ActivityQuickAddSheet({
  open,
  stop,
  tripId,
  currentUserId,
  existingCount,
  onClose,
  onAdd,
}: ActivityQuickAddSheetProps) {
  const placesLib = useMapsLibrary('places')
  const attributionRef = useRef<HTMLDivElement | null>(null)
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [category, setCategory] = useState<ActivityCategory>('all')
  const [timeOfDay, setTimeOfDay] = useState('')
  const [duration, setDuration] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  /* ── Init Places services ───────────────────────────────── */
  useEffect(() => {
    if (!placesLib || !attributionRef.current) return
    autocompleteRef.current = new placesLib.AutocompleteService()
    placesServiceRef.current = new placesLib.PlacesService(attributionRef.current)
  }, [placesLib])

  /* ── Reset form on open ─────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setPredictions([])
    setSelectedPlace(null)
    setCategory('all')
    setTimeOfDay('')
    setDuration('')
    setCost('')
    setNotes('')
  }, [open])

  /* ── Debounced autocomplete ─────────────────────────────── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q || !autocompleteRef.current || selectedPlace) {
      setPredictions([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    debounceRef.current = setTimeout(() => {
      autocompleteRef.current!.getPlacePredictions(
        {
          input: q,
          location: new google.maps.LatLng(stop.lat, stop.lng),
          radius: 50000,
          types: ['establishment'],
        },
        (results) => {
          setPredictions(results ?? [])
          setIsSearching(false)
        }
      )
    }, 220)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, stop.lat, stop.lng, selectedPlace])

  /* ── Select prediction ──────────────────────────────────── */
  const handleSelectPrediction = useCallback(
    (pred: google.maps.places.AutocompletePrediction) => {
      if (!placesServiceRef.current) return
      placesServiceRef.current.getDetails(
        { placeId: pred.place_id, fields: ['name', 'geometry', 'formatted_address'] },
        (result) => {
          if (!result?.geometry?.location) return
          setSelectedPlace({
            name: result.name ?? pred.structured_formatting?.main_text ?? '',
            address: result.formatted_address ?? pred.description,
            lat: result.geometry!.location!.lat(),
            lng: result.geometry!.location!.lng(),
            placeId: pred.place_id,
          })
          setQuery(result.name ?? pred.structured_formatting?.main_text ?? '')
          setPredictions([])
        }
      )
    },
    []
  )

  /* ── Save ───────────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    const name = selectedPlace?.name ?? query.trim()
    if (!name) return
    setIsSaving(true)
    try {
      await onAdd({
        trip_id: tripId,
        stop_id: stop.id,
        place_id: selectedPlace?.placeId ?? null,
        name,
        address: selectedPlace?.address ?? null,
        lat: selectedPlace?.lat ?? null,
        lng: selectedPlace?.lng ?? null,
        category,
        google_types: null,
        photo_url: null,
        rating: null,
        user_ratings_total: null,
        day_number: null,
        scheduled_at: null,
        time_of_day: timeOfDay || null,
        order_index: existingCount,
        duration_mins: duration ? parseInt(duration, 10) : null,
        notes: notes || null,
        estimated_cost: cost ? parseFloat(cost) : null,
        is_completed: false,
        created_by: currentUserId,
      })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }, [
    selectedPlace, query, tripId, stop.id, category,
    timeOfDay, duration, notes, cost, currentUserId, existingCount, onAdd, onClose,
  ])

  const canSave = !isSaving && (!!selectedPlace || query.trim().length > 0)

  return (
    <>
      {/* Hidden div for PlacesService attribution */}
      <div ref={attributionRef} className="hidden" />

      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-[440px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-sm font-semibold">
              Add Activity
              <span className="ml-1.5 font-normal text-muted-foreground">— {stop.name}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 p-5">

            {/* ── Place search ──────────────────────────── */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  autoFocus
                  placeholder="Search or type activity name…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedPlace(null) }}
                  className="pl-9 pr-8 text-sm"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground/40" />
                )}
                {selectedPlace && !isSearching && (
                  <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
                )}
              </div>

              {/* Prediction dropdown */}
              {predictions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-xl border border-border/50 bg-card p-1.5 shadow-2xl">
                  {predictions.slice(0, 5).map((pred) => (
                    <button
                      key={pred.place_id}
                      className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted"
                      onMouseDown={(e) => { e.preventDefault(); handleSelectPrediction(pred) }}
                    >
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {pred.structured_formatting?.main_text ?? pred.description}
                        </p>
                        <p className="truncate text-xs text-muted-foreground/60">
                          {pred.structured_formatting?.secondary_text ?? ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Category pills ────────────────────────── */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const cfg = ACTIVITY_CATEGORY_CONFIG[cat]
                const isActive = category === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all"
                    style={
                      isActive
                        ? {
                            backgroundColor: cfg.color + '28',
                            color: cfg.color,
                            outline: `1.5px solid ${cfg.color}55`,
                          }
                        : { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }
                    }
                  >
                    <span>{cfg.icon}</span>
                    {cfg.label}
                  </button>
                )
              })}
            </div>

            {/* ── Time + Duration ───────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="pl-9 text-sm"
                  title="Start time (optional)"
                />
              </div>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  type="number"
                  min="0"
                  step="15"
                  placeholder="Duration (mins)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            {/* ── Cost + Notes ──────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  type="number"
                  min="0"
                  placeholder="Est. cost ($)"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────── */}
          <div className="flex items-center justify-end gap-2 border-t border-border/40 bg-muted/20 px-5 py-3.5">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
            >
              {isSaving ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Adding…</>
              ) : (
                'Add to Plan'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
