import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuth } from '../useAuth'
import { useUserStore, MOCK_USER } from '../../../store/userStore'

beforeEach(() => {
  useUserStore.setState({
    user: null,
    permission: 'viewer',
    isAuthenticated: false,
    workspace: null,
  })
})

describe('useAuth', () => {
  it('returns null user when not signed in', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.user).toBeNull()
    expect(result.current.isSignedIn).toBe(false)
    expect(result.current.isLoaded).toBe(true)
  })

  it('returns user data when signed in', () => {
    useUserStore.setState({ user: MOCK_USER, isAuthenticated: true, permission: 'owner' })
    const { result } = renderHook(() => useAuth())

    expect(result.current.isSignedIn).toBe(true)
    expect(result.current.user?.id).toBe('u-1')
    expect(result.current.user?.name).toBe('Dev User')
    expect(result.current.user?.email).toBe('dev@example.com')
  })

  it('computes initials from full name', () => {
    useUserStore.setState({ user: { id: 'u-2', name: 'Sarah Chen', email: 's@c.com' }, isAuthenticated: true, permission: 'editor' })
    const { result } = renderHook(() => useAuth())
    expect(result.current.user?.initials).toBe('SC')
  })

  it('computes initials from single word name', () => {
    useUserStore.setState({ user: { id: 'u-3', name: 'Zara', email: 'z@c.com' }, isAuthenticated: true, permission: 'editor' })
    const { result } = renderHook(() => useAuth())
    expect(result.current.user?.initials).toBe('Z')
  })

  it('caps initials at 2 characters', () => {
    useUserStore.setState({ user: { id: 'u-4', name: 'Alice Bob Carol', email: 'a@c.com' }, isAuthenticated: true, permission: 'editor' })
    const { result } = renderHook(() => useAuth())
    expect(result.current.user?.initials).toBe('AB')
  })

  it('exposes the current permission', () => {
    useUserStore.setState({ user: MOCK_USER, isAuthenticated: true, permission: 'admin' })
    const { result } = renderHook(() => useAuth())
    expect(result.current.permission).toBe('admin')
  })

  it('permission reflects store state', () => {
    useUserStore.setState({ permission: 'admin' })
    const { result, rerender } = renderHook(() => useAuth())
    expect(result.current.permission).toBe('admin')

    useUserStore.setState({ permission: 'viewer' })
    rerender()
    expect(result.current.permission).toBe('viewer')
  })
})
