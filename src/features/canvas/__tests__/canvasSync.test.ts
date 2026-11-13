import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveChange, retrySave, discardUnsaved, hasUnsaved, resetCanvasSave, useCanvasSave, describeFailure } from '../canvasSync'
import { ApiError } from '../../../lib/apiClient'
import { useToastStore } from '../../../store/toastStore'

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  resetCanvasSave()
  useToastStore.setState({ toasts: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('canvas write queue', () => {
  it('runs writes one at a time, in the order they were made', async () => {
    const log: string[] = []
    let releaseFirst!: () => void
    saveChange('c1', 'role', () => new Promise<void>(r => { log.push('role:start'); releaseFirst = () => { log.push('role:end'); r() } }))
    saveChange('c1', 'line', async () => { log.push('line') })
    await flush()
    expect(log).toEqual(['role:start'])          // the line waits for the role
    releaseFirst()
    await flush()
    expect(log).toEqual(['role:start', 'role:end', 'line'])
    expect(useCanvasSave.getState().pending).toBe(0)
  })

  it('stops at the first failure: nothing queued behind it is sent', async () => {
    const after = vi.fn().mockResolvedValue(undefined)
    saveChange('c1', "Couldn't save the new role", () => Promise.reject(new ApiError(500, { error: 'Internal server error' })))
    saveChange('c1', "Couldn't save the reporting line", after)
    await flush()
    expect(after).not.toHaveBeenCalled()
    const f = useCanvasSave.getState().failure!
    expect(f).toMatchObject({ chartId: 'c1', action: "Couldn't save the new role", retryable: true, conflict: false })
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error' && t.message.includes("Couldn't save the new role"))).toBe(true)
  })

  it('Retry sends the failed write again, then carries on with the rest', async () => {
    const order: string[] = []
    let fail = true
    saveChange('c1', 'a', async () => { order.push('a'); if (fail) throw new TypeError('Failed to fetch') })
    saveChange('c1', 'b', async () => { order.push('b') })
    await flush()
    expect(order).toEqual(['a'])
    fail = false
    retrySave('c1')
    await flush()
    expect(order).toEqual(['a', 'a', 'b'])
    expect(useCanvasSave.getState().failure).toBeNull()
    expect(hasUnsaved('c1')).toBe(false)
  })

  it('a failure that cannot pass (plan limit, 403) is not retryable and shows the server\'s sentence', async () => {
    saveChange('c1', "Couldn't save the new role", () => Promise.reject(new ApiError(402, { error: 'plan-limit', message: 'Your plan allows 15 roles per chart.' })))
    await flush()
    expect(useCanvasSave.getState().failure).toMatchObject({ retryable: false, message: 'Your plan allows 15 roles per chart.' })
    retrySave('c1') // ignored
    expect(useCanvasSave.getState().failure).not.toBeNull()
  })

  it('Reload (discardUnsaved) drops the failed write and everything behind it, even one that is in flight', async () => {
    const behind = vi.fn().mockResolvedValue(undefined)
    let release!: () => void
    saveChange('c1', 'slow', () => new Promise<void>(r => { release = r }))
    saveChange('c1', 'behind', behind)
    await flush()
    discardUnsaved('c1')
    release()
    await flush()
    expect(behind).not.toHaveBeenCalled()
    expect(useCanvasSave.getState().pending).toBe(0)
  })

  it('a conflict (409 chart-changed) stops the queue but leaves the explaining to the conflict banner', async () => {
    const after = vi.fn()
    saveChange('c1', 'edit', () => Promise.reject(new ApiError(409, { error: 'chart-changed' })))
    saveChange('c1', 'next', after)
    await flush()
    expect(after).not.toHaveBeenCalled()
    expect(useCanvasSave.getState().failure).toMatchObject({ conflict: true, retryable: false })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('charts do not block each other', async () => {
    saveChange('c1', 'x', () => Promise.reject(new TypeError('offline')))
    await flush()
    const other = vi.fn().mockResolvedValue(undefined)
    saveChange('c2', 'y', other)
    await flush()
    expect(other).toHaveBeenCalled()
  })

  it('does nothing without a chart id (unsaved scratch canvas)', () => {
    const run = vi.fn()
    saveChange('', 'x', run)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('describeFailure', () => {
  it.each([
    [429, true], [500, true], [503, true], [408, true],
    [401, false], [403, false], [404, false], [402, false], [400, false],
  ])('status %i → retryable %s', (status, retryable) => {
    expect(describeFailure(new ApiError(status, {})).retryable).toBe(retryable)
  })
  it('a network error (fetch rejected) is retryable and says so', () => {
    const d = describeFailure(new TypeError('Failed to fetch'))
    expect(d.retryable).toBe(true)
    expect(d.message).toMatch(/reach the server/i)
  })
})
