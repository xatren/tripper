'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'

/** dnd-kit wrapper: applies the sort transform and hands drag props to the card. */
export function SortableStopItem({ id, disabled, children }: {
  id: string
  disabled: boolean
  children: (p: { attributes: React.HTMLAttributes<HTMLDivElement>; listeners: Record<string, unknown> | undefined; isDragging: boolean }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div ref={setNodeRef} style={{ transform: DndCSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}>
      {children({ attributes: disabled ? {} : attributes as React.HTMLAttributes<HTMLDivElement>, listeners: disabled ? undefined : listeners as Record<string, unknown> | undefined, isDragging })}
    </div>
  )
}
