'use client'

import { MotionConfig } from 'framer-motion'
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const ReducedMotionContext = createContext(false)

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function getServerSnapshot() {
  return false
}

/**
 * App-wide motion policy. Framer Motion removes transform/layout animation
 * when the OS requests reduced motion while retaining useful opacity feedback.
 */
export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerSnapshot,
  )

  return (
    <ReducedMotionContext value={reducedMotion}>
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
        {children}
      </MotionConfig>
    </ReducedMotionContext>
  )
}

/** Shared runtime-aware preference for animation systems outside Framer Motion. */
export function useReducedMotionPreference() {
  return useContext(ReducedMotionContext)
}
