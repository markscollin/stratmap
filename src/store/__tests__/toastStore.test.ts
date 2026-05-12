import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore } from '../toastStore'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('addToast', () => {
  it('adds a toast with the default info variant', () => {
    useToastStore.getState().addToast('Hello')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: 'Hello', variant: 'info' })
  })

  it('adds a toast with the specified variant', () => {
    useToastStore.getState().addToast('Oops', 'error')
    expect(useToastStore.getState().toasts[0].variant).toBe('error')
  })

  it('generates a unique id for each toast', () => {
    useToastStore.getState().addToast('A')
    useToastStore.getState().addToast('B')
    const { toasts } = useToastStore.getState()
    expect(toasts[0].id).not.toBe(toasts[1].id)
  })

  it('caps at 3 toasts, dropping the oldest when a 4th is added', () => {
    useToastStore.getState().addToast('one')
    useToastStore.getState().addToast('two')
    useToastStore.getState().addToast('three')
    useToastStore.getState().addToast('four')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(3)
    expect(toasts.map(t => t.message)).toEqual(['two', 'three', 'four'])
  })

  it('auto-dismisses after 3 seconds', () => {
    useToastStore.getState().addToast('Temp')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('does not dismiss before 3 seconds', () => {
    useToastStore.getState().addToast('Temp')
    vi.advanceTimersByTime(2999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})

describe('removeToast', () => {
  it('removes a toast by id', () => {
    useToastStore.getState().addToast('Hello')
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().removeToast(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('does not affect other toasts', () => {
    useToastStore.getState().addToast('A')
    useToastStore.getState().addToast('B')
    const idA = useToastStore.getState().toasts[0].id
    useToastStore.getState().removeToast(idA)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0].message).toBe('B')
  })

  it('is a no-op for an unknown id', () => {
    useToastStore.getState().addToast('Hello')
    useToastStore.getState().removeToast('does-not-exist')
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})
