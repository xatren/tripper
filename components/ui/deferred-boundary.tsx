'use client'

import { Component, type CSSProperties, type ReactNode } from 'react'

interface DeferredBoundaryProps {
  children: ReactNode
  label: string
  style?: CSSProperties
}

export function DeferredFailure({ label, onRetry, style }: { label: string; onRetry: () => void; style?: CSSProperties }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: 20, textAlign: 'center', color: 'rgba(255,255,255,.82)', background: 'rgba(8,8,28,.92)', ...style,
      }}
    >
      <span style={{ fontSize: 13 }}>Couldn&apos;t load {label}.</span>
      <button
        type="button"
        onClick={onRetry}
        style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
      >
        Retry
      </button>
    </div>
  )
}

interface DeferredBoundaryState {
  error: Error | null
}

/** Keeps a failed code-split chunk from blanking the surrounding route. */
export class DeferredBoundary extends Component<DeferredBoundaryProps, DeferredBoundaryState> {
  state: DeferredBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): DeferredBoundaryState {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return <DeferredFailure label={this.props.label} onRetry={() => window.location.reload()} style={this.props.style} />
  }
}
