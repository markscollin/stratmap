import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {}
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

vi.mock('../../lib/csvSafe', async (orig) => ({ ...(await orig<typeof import('../../lib/csvSafe')>()), downloadText: vi.fn() }))

import { api } from '../../lib/apiClient'
import { downloadText } from '../../lib/csvSafe'
import { useToastStore } from '../../store/toastStore'
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
  vi.mocked(downloadText).mockReset()
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

describe('HeadcountView CSV export (roadmap 2.2)', () => {
  it('downloads the plans on the board for finance', async () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
    renderView()
    await screen.findByText('Platform Engineer')
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(downloadText).toHaveBeenCalledTimes(1)
    const [name, csv] = vi.mocked(downloadText).mock.calls[0]
    expect(name).toBe(`headcount-plan-${YEAR}.csv`)
    expect(csv).toContain('Title,Department,Role type,Target quarter,Status,Chart,Notes')
    expect(csv).toContain(`Platform Engineer,,New headcount,${YEAR}-Q2,Planned,,`)
  })

  it('stays available when editing is locked, because it only reads', async () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.starter })
    renderView()
    await screen.findByText('Platform Engineer')
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(downloadText).toHaveBeenCalledTimes(1)
  })

  it('says so instead of downloading an empty file', async () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
    vi.mocked(api.get).mockImplementation(() => Promise.resolve([]) as never)
    useToastStore.setState({ toasts: [] })
    renderView()
    await screen.findByRole('button', { name: /Export CSV/ })
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(downloadText).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/no plans for/)
  })
})
