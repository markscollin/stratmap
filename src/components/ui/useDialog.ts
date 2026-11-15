import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

// Keyboard and focus behaviour shared by every dialog and panel (launch review R-32):
//   - when it opens, focus moves inside (to `[data-autofocus]`, else the first field, else the first control, else the panel itself)
//   - modal: Tab and Shift+Tab stay inside, and the page behind is hidden from screen readers by aria-modal
//   - Escape closes it; with several open, only the top-most one reacts
//   - when it closes, focus goes back to what had it before
// A non-modal panel (the job-description slide-out, which sits beside a canvas people keep using) gets the same but does not trap
// Tab, and answers Escape only while focus is inside it, so Escape on the canvas still means "deselect".

const TABBABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
].join(',')

/** The controls inside `root` that Tab can reach, in order. Hidden ones (display:none, aria-hidden subtrees) are skipped. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)]
    .filter(el => !el.closest('[aria-hidden="true"], [inert]') && el.getClientRects().length > 0)
}

// Open dialogs, oldest first. Only the last one answers Escape or traps Tab.
const open: symbol[] = []

export interface UseDialogOptions {
  /** Whether the dialog is showing. A panel that is always mounted passes its own visibility. */
  active?: boolean
  onClose: () => void
  /** Default true. false = a panel that does not trap Tab. */
  modal?: boolean
}

/** Returns the props to spread on the dialog's root element, which must be the element that contains everything inside it. */
export function useDialog<T extends HTMLElement>(options: UseDialogOptions): { ref: RefObject<T | null>; tabIndex: -1 } {
  const { active = true, modal = true } = options
  const ref = useRef<T | null>(null)
  // Who had focus before this dialog rendered. A child with React's `autoFocus` takes focus while the dialog mounts, before the effect
  // below runs, so reading document.activeElement there would find the dialog's own field and focus could not be given back (R-42).
  const [openedFrom] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement))
  const onCloseRef = useRef(options.onClose)
  useEffect(() => { onCloseRef.current = options.onClose })

  useEffect(() => {
    const panel = ref.current
    if (!active || !panel) return
    const id = Symbol('dialog')
    open.push(id)
    const now = document.activeElement
    const opener = panel.contains(now) ? openedFrom : now
    const before = opener instanceof HTMLElement ? opener : null

    if (!panel.contains(document.activeElement)) {
      // A modal puts you in its first field. A non-modal panel just takes focus itself, so that opening a role from the canvas
      // does not drop the cursor into a field (and Delete / Cmd+Z keep working on the canvas).
      const target = panel.querySelector<HTMLElement>('[data-autofocus]')
        ?? (modal ? tabbables(panel).find(el => el.matches('input, textarea, select')) ?? tabbables(panel)[0] : undefined)
        ?? panel
      target.focus({ preventScroll: true })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (open[open.length - 1] !== id) return
      if (e.key === 'Escape') {
        // A non-modal panel only answers while focus is inside it.
        if (!modal && !panel.contains(document.activeElement)) return
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !modal) return
      const items = tabbables(panel)
      if (items.length === 0) { e.preventDefault(); panel.focus(); return }
      const first = items[0], last = items[items.length - 1]
      const current = document.activeElement
      if (!panel.contains(current)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
      if (e.shiftKey && (current === first || current === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && current === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const at = open.indexOf(id)
      if (at >= 0) open.splice(at, 1)
      if (before && before.isConnected && before !== document.body) before.focus({ preventScroll: true })
    }
  }, [active, modal, openedFrom])

  return { ref, tabIndex: -1 }
}
