'use client'

import { useEffect, useState } from 'react'
import { BedDouble, DollarSign, MapPin, Moon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export interface LodgingFormData {
  hotelName: string
  location: string
  nights: number
  totalCost: number
}

interface LodgingDialogProps {
  open: boolean
  stopName?: string
  prefilledName?: string
  prefilledLocation?: string
  onClose: () => void
  onSave: (data: LodgingFormData) => Promise<void>
}

export function LodgingDialog({ open, stopName, prefilledName, prefilledLocation, onClose, onSave }: LodgingDialogProps) {
  const [hotelName, setHotelName] = useState('')
  const [location, setLocation] = useState('')
  const [nights, setNights] = useState(1)
  const [totalCost, setTotalCost] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setHotelName(prefilledName ?? '')
      setLocation(prefilledLocation ?? stopName ?? '')
      setNights(1)
      setTotalCost('')
      setError(null)
    }
  }, [open, prefilledName, prefilledLocation, stopName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hotelName.trim()) { setError('Hotel name is required.'); return }
    const cost = parseFloat(totalCost)
    if (isNaN(cost) || cost < 0) { setError('Enter a valid amount.'); return }

    setLoading(true)
    setError(null)
    try {
      await onSave({ hotelName: hotelName.trim(), location: location.trim(), nights, totalCost: cost })
      onClose()
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md gap-0 p-0" showCloseButton={false}>

        {/* Header */}
        <DialogHeader className="border-b border-border/40 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <BedDouble className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <DialogTitle className="text-base">Add Lodging</DialogTitle>
              {stopName && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <MapPin className="h-3 w-3" />
                  {stopName}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Form */}
        <form id="lodging-form" onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">

          {/* Hotel Name */}
          <div className="space-y-1.5">
            <Label htmlFor="hotelName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              Hotel Name
            </Label>
            <Input
              id="hotelName"
              placeholder="e.g. Marriott Downtown"
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              className="border-border/50 bg-muted/30 focus:bg-card"
              autoFocus
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="location" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              Location
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                id="location"
                placeholder="City, Country"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="border-border/50 bg-muted/30 pl-9 focus:bg-card"
              />
            </div>
          </div>

          {/* Nights + Cost — two columns */}
          <div className="grid grid-cols-2 gap-4">

            {/* Nights */}
            <div className="space-y-1.5">
              <Label htmlFor="nights" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                <Moon className="h-3 w-3" />
                Nights
              </Label>
              <Input
                id="nights"
                type="number"
                min={1}
                step={1}
                value={nights}
                onChange={(e) => setNights(Math.max(1, parseInt(e.target.value) || 1))}
                className="border-border/50 bg-muted/30 focus:bg-card"
              />
            </div>

            {/* Total Cost */}
            <div className="space-y-1.5">
              <Label htmlFor="totalCost" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                <DollarSign className="h-3 w-3" />
                Total (USD)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground/50">
                  $
                </span>
                <Input
                  id="totalCost"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  className="border-border/50 bg-muted/30 pl-7 focus:bg-card"
                />
              </div>
            </div>
          </div>

          {/* Summary chip — live preview */}
          {(hotelName || nights > 1 || totalCost) && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2">
              <BedDouble className="h-4 w-4 flex-shrink-0 text-emerald-400/80" />
              <p className="text-[12px] text-emerald-300/90">
                {hotelName || '—'}
                {nights > 0 && (
                  <span className="text-emerald-400/60">
                    {' '}· {nights} night{nights !== 1 ? 's' : ''}
                  </span>
                )}
                {totalCost && !isNaN(parseFloat(totalCost)) && (
                  <span className="text-emerald-400/60">
                    {' '}· ${parseFloat(totalCost).toFixed(2)}
                  </span>
                )}
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <DialogFooter className="border-t border-border/40 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="lodging-form"
            disabled={loading}
            className="bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500"
          >
            {loading ? 'Saving…' : 'Save Lodging'}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}
