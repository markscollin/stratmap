import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePermission } from '../usePermission'
import { useUserStore } from '../../store/userStore'
import type { Permission } from '../../types'

beforeEach(() => {
  useUserStore.setState({ permission: 'viewer' })
})

function withPermission(p: Permission) {
  useUserStore.setState({ permission: p })
  return renderHook(() => usePermission()).result.current
}

describe('usePermission', () => {
  describe('owner', () => {
    it('has all permissions', () => {
      const p = withPermission('owner')
      expect(p.isOwner).toBe(true)
      expect(p.canAdmin).toBe(true)
      expect(p.canEdit).toBe(true)
      expect(p.canComment).toBe(true)
    })
  })

  describe('admin', () => {
    it('can admin, edit, and comment but is not owner', () => {
      const p = withPermission('admin')
      expect(p.isOwner).toBe(false)
      expect(p.canAdmin).toBe(true)
      expect(p.canEdit).toBe(true)
      expect(p.canComment).toBe(true)
    })
  })

  describe('editor', () => {
    it('can edit and comment but not admin', () => {
      const p = withPermission('editor')
      expect(p.isOwner).toBe(false)
      expect(p.canAdmin).toBe(false)
      expect(p.canEdit).toBe(true)
      expect(p.canComment).toBe(true)
    })
  })

  describe('commenter', () => {
    it('can only comment', () => {
      const p = withPermission('commenter')
      expect(p.isOwner).toBe(false)
      expect(p.canAdmin).toBe(false)
      expect(p.canEdit).toBe(false)
      expect(p.canComment).toBe(true)
    })
  })

  describe('viewer', () => {
    it('has no elevated permissions', () => {
      const p = withPermission('viewer')
      expect(p.isOwner).toBe(false)
      expect(p.canAdmin).toBe(false)
      expect(p.canEdit).toBe(false)
      expect(p.canComment).toBe(false)
    })
  })

  it('reflects live store changes', () => {
    const { result, rerender } = renderHook(() => usePermission())
    expect(result.current.canEdit).toBe(false)

    useUserStore.setState({ permission: 'editor' })
    rerender()

    expect(result.current.canEdit).toBe(true)
  })
})
