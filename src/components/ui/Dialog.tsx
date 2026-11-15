import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useDialog } from './useDialog'

/**
 * The one modal dialog (launch review R-32): a dimmed backdrop and a panel with `role="dialog"`, `aria-modal`, an accessible name,
 * a focus trap, Escape to close and focus put back where it was (see useDialog). Clicking the backdrop closes it; a press that
 * starts inside the panel (selecting text in a field and letting go outside) does not.
 *
 * Render it only while open: `{open && <Dialog …>}`.
 */
export function Dialog({ label, onClose, children, zIndex = 300, align = 'center', panelStyle }: {
  /** What a screen reader announces, e.g. "Edit role". Required. */
  label: string
  onClose: () => void
  children: ReactNode
  zIndex?: number
  /** 'top' puts the panel near the top of the screen (the search box). */
  align?: 'center' | 'top'
  panelStyle?: CSSProperties
}) {
  const { ref, tabIndex } = useDialog<HTMLDivElement>({ onClose })
  // null = no press seen (a programmatic or assistive-technology click), which counts as a dismiss.
  const pressedOnBackdrop = useRef<boolean | null>(null)
  return (
    <div
      data-canvas-overlay
      data-testid="dialog-backdrop"
      onMouseDown={e => { pressedOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        const startedHere = pressedOnBackdrop.current !== false
        pressedOnBackdrop.current = null
        if (e.target === e.currentTarget && startedHere) onClose()
      }}
      style={{
        position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: align === 'top' ? 'flex-start' : 'center', justifyContent: 'center', paddingTop: align === 'top' ? '14vh' : undefined,
      }}
    >
      <div
        ref={ref}
        tabIndex={tabIndex}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onWheel={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border-hover)', boxShadow: 'var(--shadow)', outline: 'none',
          animation: 'nodePop .22s cubic-bezier(.34,1.56,.64,1)', maxWidth: 'calc(100vw - 32px)', ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>
  )
}
