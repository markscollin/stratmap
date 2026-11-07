import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => {
  class ApiError extends Error {}
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '../../../lib/apiClient'
import { JDPanel } from '../JDPanel'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import type { OrgNode } from '../../../types'

const node: OrgNode = { id: 'n1', name: 'Alice Smith', title: 'CTO', departmentId: 'eng', managerId: null, status: 'active', employmentType: 'full-time', x: 0, y: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.get).mockResolvedValue({ comments: [] } as never)
  useUserStore.setState({ permission: 'commenter' })
  useBillingStore.setState({ plan: PLAN_BY_TIER.free })           // comments are free on every plan
})

const renderPanel = (props: Partial<React.ComponentProps<typeof JDPanel>> = {}) =>
  render(<MemoryRouter><JDPanel node={node} onClose={() => {}} {...props} /></MemoryRouter>)

describe('JDPanel Comments tab (roadmap 5)', () => {
  it('has no Comments tab where there is no chart to comment on (e.g. a public share page)', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /^Comments/ })).toBeNull()
  })

  it('opens the discussion for the role, even on the Free plan', async () => {
    renderPanel({ chartId: 'chart-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }))
    expect(await screen.findByTestId('comments-tab')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/charts/chart-1/comments?nodeId=n1')
  })

  it('shows the number of open threads on the tab', () => {
    renderPanel({ chartId: 'chart-1', commentCount: 2 })
    expect(screen.getByRole('button', { name: 'Comments (2)' })).toBeInTheDocument()
  })

  it('opens straight on the comments when a comment email linked here', async () => {
    renderPanel({ chartId: 'chart-1', initialTab: 'comments' })
    expect(await screen.findByTestId('comments-tab')).toBeInTheDocument()
  })
})
