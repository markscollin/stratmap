// Launch review R-11: the editor said "Saved" before the request was even sent, and text typed in the last second was
// lost when the panel closed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { JDEditor } from '../JDEditor'
import { useCanvasSave, resetCanvasSave } from '../../canvas/canvasSync'

// Typing into TipTap in jsdom is awkward, so the test drives the editor's own update callback.
let onUpdate: ((p: { editor: { getHTML: () => string } }) => void) | undefined
vi.mock('@tiptap/react', () => ({
  useEditor: (opts: { onUpdate: typeof onUpdate }) => {
    onUpdate = opts.onUpdate
    return { storage: {}, chain: () => ({ focus: () => ({}) }), isActive: () => false, commands: { focus: () => {} } }
  },
  EditorContent: () => null,
}))
const type = (html: string) => act(() => { onUpdate?.({ editor: { getHTML: () => html } }) })

beforeEach(() => { vi.useFakeTimers(); resetCanvasSave() })
afterEach(() => { vi.useRealTimers() })

describe('JDEditor saving (R-11)', () => {
  it('sends the text after a 1 s pause, not before', () => {
    const onSave = vi.fn()
    render(<JDEditor content="" onSave={onSave} />)
    type('<p>Hello</p>')
    act(() => { vi.advanceTimersByTime(900) })
    expect(onSave).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(onSave).toHaveBeenCalledWith('<p>Hello</p>')
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('unmounting inside the debounce window still sends the text (closing the panel, switching role)', () => {
    const onSave = vi.fn()
    const { unmount } = render(<JDEditor content="" onSave={onSave} />)
    type('<p>Last second</p>')
    unmount()
    expect(onSave).toHaveBeenCalledWith('<p>Last second</p>')
    expect(onSave).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(onSave).toHaveBeenCalledTimes(1) // the timer did not send it a second time
  })

  it('hiding the tab or leaving the page sends it too', () => {
    const onSave = vi.fn()
    render(<JDEditor content="" onSave={onSave} />)
    type('<p>One</p>')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(onSave).toHaveBeenCalledWith('<p>One</p>')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    type('<p>Two</p>')
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(onSave).toHaveBeenLastCalledWith('<p>Two</p>')
  })

  it('an emptied editor is saved as an empty string, and nothing is sent when nothing was typed', () => {
    const onSave = vi.fn()
    const { unmount } = render(<JDEditor content="<p>x</p>" onSave={onSave} />)
    type('<p></p>')
    act(() => { vi.advanceTimersByTime(1100) })
    expect(onSave).toHaveBeenCalledWith('')
    onSave.mockClear()
    unmount()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('says "Saving…" until the queue has it, then "Saved" (not before the request is done)', () => {
    render(<JDEditor content="" onSave={() => { useCanvasSave.setState({ pending: 1 }) }} />)
    type('<p>a</p>')
    expect(screen.getByTestId('jd-save-status')).toHaveTextContent('Saving…')
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.getByTestId('jd-save-status')).toHaveTextContent('Saving…') // sent, server has not answered
    act(() => { useCanvasSave.setState({ pending: 0 }) })
    expect(screen.getByTestId('jd-save-status')).toHaveTextContent('Saved')
    act(() => { vi.advanceTimersByTime(2100) })
    expect(screen.queryByTestId('jd-save-status')).toBeNull()
  })

  it('says "Couldn\'t save" when the queue has a failure', () => {
    render(<JDEditor content="" onSave={() => { useCanvasSave.setState({ pending: 1 }) }} />)
    type('<p>a</p>')
    act(() => { vi.advanceTimersByTime(1100) })
    act(() => { useCanvasSave.setState({ failure: { chartId: 'c', action: 'x', message: 'y', retryable: true, conflict: false } }) })
    expect(screen.getByTestId('jd-save-status')).toHaveTextContent("Couldn't save")
  })
})
