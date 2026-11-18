// Launch review R-47: a role's card takes its department colour from the chart's own departments. On a public share page there are
// no workspace departments at all, so before the fix every card there was the default grey.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => ({ api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, ApiError: class extends Error {} }))

import { OrgChart } from '../OrgChart'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { useWorkspaceDepartmentStore } from '../../../store/workspaceDepartmentStore'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../../test/matchMedia'
import type { OrgNode } from '../../../types'

const NODE: OrgNode = {
  id: 'n1', name: 'Alice Smith', title: 'CTO', departmentId: 'chart-dept-1', managerId: null,
  status: 'active', employmentType: 'full-time', x: 100, y: 100,
}

beforeEach(() => {
  installMatchMedia(); setScreen('desktop')
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  useUserStore.setState({ permission: 'viewer' })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
  // No workspace departments: what a public share page has.
  useWorkspaceDepartmentStore.setState({ departments: [], loaded: true, error: false, loading: false, fetch: vi.fn().mockResolvedValue(undefined) } as never)
})
afterEach(removeMatchMedia)

describe('role card colour (R-47)', () => {
  it("uses the chart's own department colour when there are no workspace departments", () => {
    render(
      <MemoryRouter>
        <OrgChart chartId="c1" chartName="Org" initialNodes={[NODE]} initialEdges={[]} departments={[{ id: 'chart-dept-1', name: 'Engineering', colour: '#112233' }]} readOnly />
      </MemoryRouter>,
    )
    const card = screen.getByTestId('node-card')
    expect(card.innerHTML).toContain('rgb(17, 34, 51)') // #112233
    expect(card.innerHTML).not.toContain('rgb(148, 163, 184)') // the default grey #94A3B8
  })

  it('a department no list knows keeps the default grey', () => {
    render(
      <MemoryRouter>
        <OrgChart chartId="c1" chartName="Org" initialNodes={[NODE]} initialEdges={[]} departments={[]} readOnly />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('node-card').innerHTML).toContain('rgb(148, 163, 184)')
  })
})
