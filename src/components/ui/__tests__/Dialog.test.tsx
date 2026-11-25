import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from '../Dialog'
import { useDialog } from '../useDialog'

// jsdom has no layout, so every element reports no client rects; the hook treats that as "hidden". Give everything a box.
Object.defineProperty(HTMLElement.prototype, 'getClientRects', { configurable: true, value() { return [{ width: 1, height: 1 }] } })

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open it</button>
      {open && (
        <Dialog label="Edit role" onClose={() => { onClose(); setOpen(false) }}>
          <button>Close</button>
          <input aria-label="Name" />
          <button>Save</button>
        </Dialog>
      )}
    </div>
  )
}

describe('Dialog', () => {
  it('is a labelled modal dialog', () => {
    render(<Dialog label="Add role" onClose={() => {}}><button>x</button></Dialog>)
    const d = screen.getByRole('dialog', { name: 'Add role' })
    expect(d).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus to the first field when it opens, and gives it back to the opener when it closes', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open it' })
    await user.click(opener)
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('gives focus back to the opener even when a field inside uses React autoFocus (R-42)', async () => {
    function AutoFocusHarness() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open it</button>
          {open && <Dialog label="New chart" onClose={() => setOpen(false)}><input aria-label="Chart name" autoFocus /></Dialog>}
        </div>
      )
    }
    render(<AutoFocusHarness />)
    const opener = screen.getByRole('button', { name: 'Open it' })
    opener.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByLabelText('Chart name')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })

  it('keeps focus inside: Tab wraps from the last control to the first, Shift+Tab from the first to the last', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open it' }))
    const [close, save] = [screen.getByRole('button', { name: 'Close' }), screen.getByRole('button', { name: 'Save' })]
    save.focus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(save).toHaveFocus()
  })

  it('pulls focus back in if it somehow got outside', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open it' }))
    ;(document.body as HTMLElement).focus()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('honours data-autofocus over the first field', async () => {
    render(<Dialog label="Upgrade" onClose={() => {}}><input aria-label="Field" /><button data-autofocus>Go</button></Dialog>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveFocus()
  })

  it('closes on a backdrop click, not on a click inside, and not when a press started inside', () => {
    const onClose = vi.fn()
    render(<Dialog label="x" onClose={onClose}><button>inside</button></Dialog>)
    fireEvent.click(screen.getByRole('button', { name: 'inside' }))
    expect(onClose).not.toHaveBeenCalled()
    const backdrop = screen.getByTestId('dialog-backdrop')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'inside' }))
    fireEvent.click(backdrop) // the press began inside, so this is the end of a text selection, not a dismiss
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('with two open, Escape closes only the top one', async () => {
    const user = userEvent.setup()
    const outer = vi.fn(), inner = vi.fn()
    render(
      <>
        <Dialog label="outer" onClose={outer}><input aria-label="a" /></Dialog>
        <Dialog label="inner" onClose={inner}><input aria-label="b" /></Dialog>
      </>,
    )
    await user.keyboard('{Escape}')
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('does not let the key reach the page behind (canvas shortcuts listen on window)', async () => {
    const user = userEvent.setup()
    const onWindow = vi.fn()
    window.addEventListener('keydown', onWindow)
    render(<Dialog label="x" onClose={() => {}}><input aria-label="a" /></Dialog>)
    await user.keyboard('{Escape}')
    window.removeEventListener('keydown', onWindow)
    expect(onWindow).not.toHaveBeenCalled()
  })
})

describe('useDialog as a non-modal panel (the job-description slide-out)', () => {
  function Panel({ active, onClose }: { active: boolean; onClose: () => void }) {
    const { ref, tabIndex } = useDialog<HTMLDivElement>({ active, onClose, modal: false })
    return (
      <div>
        <button>canvas</button>
        <div ref={ref} tabIndex={tabIndex} role="dialog" aria-label="Panel"><button>one</button><button>two</button></div>
      </div>
    )
  }

  it('moves focus in when it becomes active and does not trap Tab', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Panel active={false} onClose={() => {}} />)
    rerender(<Panel active onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveFocus() // the panel itself, not its first field
    screen.getByRole('button', { name: 'two' }).focus()
    await user.tab()
    expect(document.body.contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(false) // it walked out, as a non-modal panel should
  })

  it('answers Escape only while focus is inside', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Panel active onClose={onClose} />)
    screen.getByRole('button', { name: 'canvas' }).focus()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'two' }).focus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
