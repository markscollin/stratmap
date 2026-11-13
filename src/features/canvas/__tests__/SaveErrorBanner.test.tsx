import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SaveErrorBanner } from '../SaveErrorBanner'
import { saveChange, resetCanvasSave } from '../canvasSync'
import { ApiError } from '../../../lib/apiClient'

const flush = () => act(() => new Promise<void>(r => { setTimeout(r, 0) }))

beforeEach(() => { resetCanvasSave(); vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('SaveErrorBanner', () => {
  it('shows nothing while saves are fine', () => {
    const { container } = render(<SaveErrorBanner chartId="c1" onReload={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the action and the reason, and offers Retry and Reload for a failure that can pass', async () => {
    const onReload = vi.fn()
    render(<SaveErrorBanner chartId="c1" onReload={onReload} />)
    saveChange('c1', "Couldn't save the new role", () => Promise.reject(new TypeError('offline')))
    await flush()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't save the new role")
    expect(alert).toHaveTextContent(/reach the server/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(onReload).toHaveBeenCalled()
  })

  it('Retry saves again and the banner goes away', async () => {
    let ok = false
    render(<SaveErrorBanner chartId="c1" onReload={() => {}} />)
    saveChange('c1', 'Couldn\'t save the new role', async () => { if (!ok) throw new TypeError('offline') })
    await flush()
    ok = true
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await flush()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers only Reload when a retry could never work, and shows the server\'s message', async () => {
    render(<SaveErrorBanner chartId="c1" onReload={() => {}} />)
    saveChange('c1', "Couldn't save the new role", () => Promise.reject(new ApiError(402, { error: 'plan-limit', message: 'Your plan allows 15 roles per chart.' })))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Your plan allows 15 roles per chart.')
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('stays out of the way of the conflict banner and of other charts', async () => {
    const { rerender } = render(<SaveErrorBanner chartId="c1" onReload={() => {}} />)
    saveChange('c1', 'edit', () => Promise.reject(new ApiError(409, { error: 'chart-changed' })))
    await flush()
    expect(screen.queryByRole('alert')).toBeNull()
    resetCanvasSave()
    saveChange('c2', 'edit', () => Promise.reject(new TypeError('offline')))
    await flush()
    rerender(<SaveErrorBanner chartId="c1" onReload={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
