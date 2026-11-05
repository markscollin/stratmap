import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { JDPanel } from '../JDPanel'
import { useUserStore } from '../../../store/userStore'
import { useJobDescriptionStore } from '../../../store/jobDescriptionStore'
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

const draftJD = {
  id: 'n1',
  nodeId: 'n1',
  status: 'draft' as const,
  responsibilities: '',
  requirements: '',
  updatedAt: new Date().toISOString(),
  updatedBy: 'You',
  version: 1,
}

beforeEach(() => {
  localStorage.clear()
  useUserStore.setState({ permission: 'viewer' })
  useJobDescriptionStore.setState({ jobDescriptions: {} })
  // These tests cover the paid JD workflow; Free-plan locking is tested at the end.
  useBillingStore.setState({ plan: PLAN_BY_TIER.starter })
})

function renderPanel(permission: Permission) {
  useUserStore.setState({ permission })
  return render(<MemoryRouter><JDPanel node={mockNode} onClose={() => {}} /></MemoryRouter>)
}

describe('JDPanel footer actions', () => {
  it('shows no footer for viewer', () => {
    renderPanel('viewer')
    expect(screen.queryByRole('button', { name: /edit role/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull()
  })

  it('shows no footer for commenter', () => {
    renderPanel('commenter')
    expect(screen.queryByRole('button', { name: /edit role/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull()
  })

  it('shows Edit role and Submit for review for editor with draft JD', async () => {
    useJobDescriptionStore.setState({ jobDescriptions: { n1: draftJD } })
    renderPanel('editor')
    expect(screen.getByRole('button', { name: /edit role/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('shows Edit role and Submit for review for admin with draft JD', async () => {
    useJobDescriptionStore.setState({ jobDescriptions: { n1: draftJD } })
    renderPanel('admin')
    expect(screen.getByRole('button', { name: /edit role/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeTruthy()
  })

  it('shows Approve for admin when JD is in-review', () => {
    useJobDescriptionStore.setState({
      jobDescriptions: { n1: { ...draftJD, status: 'in-review' } },
    })
    renderPanel('admin')
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
  })

  it('shows Approve for owner when JD is in-review', () => {
    useJobDescriptionStore.setState({
      jobDescriptions: { n1: { ...draftJD, status: 'in-review' } },
    })
    renderPanel('owner')
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
  })

  it('shows Publish for admin when JD is approved', () => {
    useJobDescriptionStore.setState({
      jobDescriptions: { n1: { ...draftJD, status: 'approved' } },
    })
    renderPanel('admin')
    expect(screen.getByRole('button', { name: /publish/i })).toBeTruthy()
  })

  it('shows no status action for editor when JD is in-review (awaiting review)', () => {
    useJobDescriptionStore.setState({
      jobDescriptions: { n1: { ...draftJD, status: 'in-review' } },
    })
    renderPanel('editor')
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(screen.getByText(/awaiting review/i)).toBeTruthy()
  })

  it('initialises JD on mount and shows submit for review for editor', async () => {
    // No pre-set JD — relies on initJD being called in useEffect
    renderPanel('editor')
    // After act(), useEffect has run and initialized the JD
    await act(async () => {})
    expect(screen.getByRole('button', { name: /edit role/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeTruthy()
  })
})

describe('JDPanel renders node info', () => {
  it('renders the node title in the heading', () => {
    renderPanel('viewer')
    const headings = screen.getAllByText('Senior Engineer')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('renders person info for active nodes', () => {
    renderPanel('viewer')
    expect(screen.getByText('Alice Smith')).toBeTruthy()
  })

  it('renders overview tab fields', () => {
    renderPanel('viewer')
    expect(screen.getByText(/employment type/i)).toBeTruthy()
  })
})

describe('JDPanel on the Free plan', () => {
  beforeEach(() => { useBillingStore.setState({ plan: PLAN_BY_TIER.free }) })

  it('shows what job descriptions unlock instead of the editor', async () => {
    useJobDescriptionStore.setState({ jobDescriptions: { n1: draftJD } })
    renderPanel('owner')
    fireEvent.click(screen.getByRole('button', { name: /responsibilities/i }))
    expect(screen.getByTestId('locked-jd-editor')).toBeInTheDocument()
    expect(screen.getByText(/Write a versioned job description for every role/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock with Starter' })).toBeInTheDocument()
    expect(screen.queryByText(/Apply a template/)).toBeNull()
  })

  it('keeps JDs written before a downgrade readable', async () => {
    useJobDescriptionStore.setState({ jobDescriptions: { n1: { ...draftJD, responsibilities: '<p>Ship things</p>' } } })
    renderPanel('owner')
    fireEvent.click(screen.getByRole('button', { name: /responsibilities/i }))
    expect(await screen.findByText('Ship things')).toBeInTheDocument()
  })

  it('submit for review is locked and opens the upgrade modal explaining approvals', async () => {
    useJobDescriptionStore.setState({ jobDescriptions: { n1: draftJD } })
    renderPanel('editor')
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    expect(screen.getByText('Unlock Approval workflows')).toBeInTheDocument()
    expect(screen.getByText(/have admins approve and publish them/)).toBeInTheDocument()
    expect(useJobDescriptionStore.getState().jobDescriptions.n1.status).toBe('draft')
  })
})

