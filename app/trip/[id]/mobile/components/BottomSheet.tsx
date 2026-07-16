'use client'

import type { ReactNode } from 'react'
import { MobileBottomSheet } from '@/components/mobile'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  titleId: string
  title: string
  children: ReactNode
}

/**
 * Trip-workspace bottom sheet. Thin wrapper over the design-system
 * MobileBottomSheet (dependency-free, keyboard-aware, reduced-motion aware) —
 * kept so existing call sites keep their prop shape during the migration.
 */
export function BottomSheet({ open, onClose, titleId, title, children }: BottomSheetProps) {
  return (
    <MobileBottomSheet open={open} onClose={onClose} titleId={titleId} title={title}>
      {children}
    </MobileBottomSheet>
  )
}
