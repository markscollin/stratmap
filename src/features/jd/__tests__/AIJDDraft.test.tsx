import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AIJDDraft } from '../AIJDDraft'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import type { OrgNode } from '../../../types'
import type { JobDescription } from '../../../types/jd'

const node: OrgNode = {
  id: 'n1', name: 'Alice Smith', title: 'Senior Engineer', departmentId: 'eng', managerId: null,
  status: 'active', employmentType: 'full-time', x: 0, y: 0,
}
const jd: JobDescription = {
  id: 'n1', nodeId: 'n1', status: 'draft', responsibilities: '', requirements: '',
  updatedAt: new Date().toISOString(), updatedBy: 'You', version: 1,
}

function open() {
  render(<MemoryRouter><AIJDDraft node={node} jd={jd} deptName="Engineering" onDraftComplete={() => {}} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /draft/i }))
}

describe('AI draft disclosure (roadmap 4.3)', () => {
  beforeEach(() => { useBillingStore.setState({ plan: PLAN_BY_TIER.growth }) })

  it('tells the user what is sent to Anthropic, and that it excludes names, emails and salaries', () => {
    open()
    const note = screen.getByTestId('ai-disclosure')
    expect(note).toHaveTextContent(/sent to Anthropic/)
    expect(note).toHaveTextContent(/no names, emails or salaries/)
    expect(note).toHaveTextContent(/personal data in the notes/)
  })

  it('never shows the person\'s name among the fields that are sent', () => {
    open()
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
    expect(screen.queryByText('Alice Smith')).toBeNull()
  })
})
