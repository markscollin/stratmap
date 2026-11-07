import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NodeCard } from '../NodeCard'
import type { OrgNode } from '../../../types'

const node: OrgNode = { id: 'n1', name: 'Alice Smith', title: 'CTO', departmentId: 'eng', managerId: null, status: 'active', employmentType: 'full-time', x: 0, y: 0 }
const props = { node, selected: false, connecting: false, isConnectTarget: false, onPointerDown: () => {}, onClick: () => {}, onDoubleClick: () => {} }

describe('NodeCard comment badge (roadmap 5)', () => {
  it('shows how many open threads a role has, and is left out of exports', () => {
    render(<NodeCard {...props} commentCount={3} />)
    const badge = screen.getByTestId('comment-badge')
    expect(badge).toHaveTextContent('3')
    expect(badge).toHaveAttribute('title', '3 open comment threads')
    expect(badge).toHaveAttribute('data-export-ignore')
  })
  it('uses the singular for one thread', () => {
    render(<NodeCard {...props} commentCount={1} />)
    expect(screen.getByTestId('comment-badge')).toHaveAttribute('title', '1 open comment thread')
  })
  it('shows nothing for a role with no open threads', () => {
    const { rerender } = render(<NodeCard {...props} />)
    expect(screen.queryByTestId('comment-badge')).toBeNull()
    rerender(<NodeCard {...props} commentCount={0} />)
    expect(screen.queryByTestId('comment-badge')).toBeNull()
  })
})
