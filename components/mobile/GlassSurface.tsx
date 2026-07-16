import { forwardRef, type ElementType, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import type { GlassVariant } from './tokens'

export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  /** Glass tier — subtle (inline accents), standard (floating cards/controls), elevated (sheets/nav). */
  variant?: GlassVariant
  /** Semantic element to render, e.g. 'section', 'header', 'nav'. */
  as?: ElementType
}

/**
 * Liquid Glass container. Backed by the `.glass-*` utilities in globals.css,
 * which carry the backdrop-filter fallback for browsers without support.
 * Radius/padding/layout stay with the caller. Reserve for floating chrome
 * (nav, sheets, headers, map controls) — dense list content should use the
 * opaque `--color-surface-*` tokens instead.
 */
export const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(function GlassSurface(
  { variant = 'standard', as: Component = 'div', className, ...rest },
  ref,
) {
  return <Component ref={ref} className={cn(`glass-${variant}`, className)} {...rest} />
})
