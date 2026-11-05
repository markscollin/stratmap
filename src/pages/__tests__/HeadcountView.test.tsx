import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {}
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '../../lib/apiClient'
import { HeadcountView } from '../HeadcountView'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'
import { useUserStore } from '../../store/userStore'
import { useHeadcountStore } from '../../store/headcountStore'

const YEAR = new Date().getFullYear()
const PLAN = {
  id: 'hp-1', workspaceId: 'ws', title: 'Platform Engineer', departmentId: null, departmentName: null, departmentColour: null,
  roleType: 'new-headcount', targetQuarter: `${YEAR}-Q2`, chartId: null, status: 'planned', notes: null,
  createdBy: 'u', createdAt: '2026-01-01', updatedAt: '2026-01-01',
}

beforeEach(() => {
  vi.mocked(api.get).mockImplementation((path: string) => Promise.resolve(path === '/api/headcount' ? [PLAN] : []) as never)
  useHeadcountStore.setState({ plans: [], loading: false })
  useUserStore.setState({ permission: 'admin' })
})

function renderView() {
  return render(<MemoryRouter><HeadcountView /></MemoryRouter>)
}

describe('HeadcountView plan gating', () => {
  it('Starter: explains what Growth unlocks and shows existing plans read-only', async () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.starter })
    renderView()
    expect(await screen.findByText('Platform Engineer')).toBeInTheDocument()
    expect(screen.getByTestId('locked-headcount-planning')).toBeInTheDocument()
    expect(screen.getByText(/Plan hires quarter by quarter/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock with Growth' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add hire/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByTitle('Edit')).toBeNull()
  })

  it('Growth: full board with add, edit and approve', async () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
    renderView()
    expect(await screen.findByText('Platform Engineer')).toBeInTheDocument()
    expect(screen.queryByTestId('locked-headcount-planning')).toBeNull()
    expect(screen.getAllByRole('button', { name: /Add hire/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('Growth but a viewer: read-only without an upgrade prompt', async () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
    useUserStore.setState({ permission: 'viewer' })
    renderView()
    expect(await screen.findByText('Platform Engineer')).toBeInTheDocument()
    expect(screen.queryByTestId('locked-headcount-planning')).toBeNull()
    expect(screen.queryByRole('button', { name: /Add hire/ })).toBeNull()
  })
})
