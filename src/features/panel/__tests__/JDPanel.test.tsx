import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JDPanel } from '../JDPanel'
import { useUserStore } from '../../../store/userStore'
import type { OrgNode, Permission } from '../../../types'

const mockNode: OrgNode = {
  id: 'n1',
  name: 'Alice Smith',
  title: 'Senior Engineer',
  departmentId: 'eng',
  managerId: null,
  status: 'active',
  employmentType: 'full-time',
  x: 0,
  y: 0,
}

beforeEach(() => {
  useUserStore.setState({ permission: 'viewer' })
})

function renderPanel(permission: Permission) {
  useUserStore.setState({ permission })
  return render(<JDPanel node={mockNode} onClose={() => {}} />)
}

describe('JDPanel footer actions', () => {
  it('shows no footer for viewer', () => {
    renderPanel('viewer')
    expect(screen.queryByRole('button', { name: /edit role/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('shows no footer for commenter', () => {
    renderPanel('commenter')
    expect(screen.queryByRole('button', { name: /edit role/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('shows only Edit role for editor', () => {
    renderPanel('editor')
    expect(screen.getByRole('button', { name: /edit role/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('shows both Edit role and Approve for admin', () => {
    renderPanel('admin')
    expect(screen.getByRole('button', { name: /edit role/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
  })

  it('shows both Edit role and Approve for owner', () => {
    renderPanel('owner')
    expect(screen.getByRole('button', { name: /edit role/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
  })
})
