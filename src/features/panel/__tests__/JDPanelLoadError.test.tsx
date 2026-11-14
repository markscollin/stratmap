// Launch review R-11: when the job description cannot be loaded the panel says so and offers Retry, instead of showing
// a blank editor whose autosave would overwrite the real text.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/apiClient')>('../../../lib/apiClient')
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api, ApiError } from '../../../lib/apiClient'
import { JDPanel } from '../JDPanel'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { useJobDescriptionStore } from '../../../store/jobDescriptionStore'
import type { OrgNode } from '../../../types'

const node: OrgNode = { id: 'n1', name: 'Alice Smith', title: 'CTO', departmentId: 'eng', managerId: null, status: 'active', employmentType: 'full-time', x: 0, y: 0 }
const stored = { id: 'jd1', nodeId: 'n1', status: 'draft', responsibilities: '<p>Real text</p>', requirements: '', version: 1, updatedBy: 'u', updatedAt: '2026-11-01T00:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useUserStore.setState({ permission: 'owner' })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
  useJobDescriptionStore.setState({ jobDescriptions: {}, loadErrors: {}, chartId: 'c1' })
})

describe('JD load failure', () => {
  it('shows an error with Retry (and no editor) when the load fails; Retry loads the real text', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, { error: 'x' })).mockResolvedValueOnce(stored as never)
    render(<MemoryRouter><JDPanel node={node} chartId="c1" onClose={() => {}} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Responsibilities' }))
    expect(await screen.findByTestId('jd-load-error')).toBeInTheDocument()
    expect(screen.queryByTestId('jd-save-status')).toBeNull()
    expect(api.put).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByTestId('jd-load-error')).toBeNull())
    expect(useJobDescriptionStore.getState().jobDescriptions.n1.responsibilities).toBe('<p>Real text</p>')
  })
})
