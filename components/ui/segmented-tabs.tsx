'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export interface SegmentedTabOption<T extends string = string> {
  value: T
  label: string
}

interface SegmentedTabsProps<T extends string = string> {
  options: SegmentedTabOption<T>[]
  value: T
  onValueChange: (value: T) => void
  className?: string
}

/**
 * Inline pill-tab switcher (as opposed to a bottom nav bar) — amber-on-glass
 * "track" control matching the app's design system. Built on Radix Tabs for
 * proper keyboard nav/ARIA; only the `TabsList`/`TabsTrigger` visuals are
 * restyled here, so it stays a drop-in for any tab set (Route/Days/Bookings
 * today, reusable elsewhere).
 */
export function SegmentedTabs<T extends string = string>({ options, value, onValueChange, className }: SegmentedTabsProps<T>) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)} className={className}>
      <TabsPrimitive.List
        className={cn(
          'flex gap-1.5 rounded-[14px] border p-1',
          'border-[var(--glass-subtle-border)] bg-[var(--glass-subtle-fill)]'
        )}
      >
        {options.map((opt) => (
          <TabsPrimitive.Trigger
            key={opt.value}
            value={opt.value}
            className={cn(
              'flex-1 cursor-pointer rounded-[11px] border border-transparent py-[9px] text-[13px] font-bold outline-none',
              'text-[rgba(215,215,255,.55)] [transition:all_0.25s_ease]',
              'hover:text-[rgba(215,215,255,.8)]',
              'focus-visible:ring-2 focus-visible:ring-[rgba(245,166,35,.5)]',
              'data-[state=active]:border-[rgba(245,140,0,.4)] data-[state=active]:bg-[rgba(245,140,0,.16)] data-[state=active]:text-[var(--color-accent-light)]'
            )}
          >
            {opt.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  )
}
