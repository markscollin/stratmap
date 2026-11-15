// Launch review R-32 (item 2), the rendered half: in a real render of the canvas and its dialogs, every button and link has an
// accessible name by the same algorithm browsers use (dom-accessibility-api). iconButtonNames.test.ts reads the source; this one
// catches buttons that components build from props (such as the toolbar's ToolBtn).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { computeAccessibleName } from 'dom-accessibility-api'

vi.mock('../lib/apiClient', () => ({ api: { get: vi.fn().mockResolvedValue({ snapshots: [], limit: 50 }), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, ApiError: class extends Error {} }))

import { OrgChart } from '../features/canvas/OrgChart'
import { NodeModal } from '../features/nodes/NodeModal'
import { UpgradeModal } from '../components/ui/UpgradeModal'
import { useUserStore } from '../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../store/billingStore'
import { installMatchMedia, setScreen, removeMatchMedia } from './matchMedia'
import type { OrgNode } from '../types'

const node: OrgNode = { id: 'n1', name: 'Ada', title: 'CEO', departmentId: 'd1', managerId: null, status: 'active', employmentType: 'full-time', x: 0, y: 0 }

function unnamed(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea')]
    .filter(el => !el.closest('[aria-hidden="true"], [inert]'))
    .filter(el => !computeAccessibleName(el).trim())
    .map(el => `<${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? ` data-testid=${el.getAttribute('data-testid')}` : ''}> ${el.outerHTML.slice(0, 120)}`)
}

beforeEach(() => {
  installMatchMedia(); setScreen('desktop')
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  useUserStore.setState({ permission: 'owner' })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
})
afterEach(removeMatchMedia)

describe('accessible names in a rendered canvas and its dialogs', () => {
  it.each([[false], [true]])('the canvas (readOnly=%s): toolbar, zoom controls and every role card control', (readOnly) => {
    const { container } = render(
      <MemoryRouter><OrgChart chartId="c1" chartName="Org" initialNodes={[node]} initialEdges={[]} departments={[{ id: 'd1', name: 'Exec', colour: '#0EA5E9' }]} readOnly={readOnly} onVersionRestored={() => {}} commentCounts={{}} /></MemoryRouter>,
    )
    expect(unnamed(container)).toEqual([])
  })

  it('the add-role dialog', () => {
    render(<NodeModal isOpen onClose={() => {}} mode="add" departments={[]} allNodes={[node]} allEdges={[]} onAdd={() => {}} onUpdate={() => {}} onDelete={() => {}} />)
    expect(unnamed(document.body)).toEqual([])
  })

  it('the upgrade dialog', () => {
    render(<UpgradeModal isOpen onClose={() => {}} feature="PDF export" requiredTier="starter" currentTier="free" />)
    expect(unnamed(document.body)).toEqual([])
  })
})
