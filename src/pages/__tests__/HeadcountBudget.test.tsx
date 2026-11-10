import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {}
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})
vi.mock('../../lib/csvSafe', async (orig) => ({ ...(await orig<typeof import('../../lib/csvSafe')>()), downloadText: vi.fn() }))

import { api } from '../../lib/apiClient'
import { downloadText } from '../../lib/csvSafe'
import { HeadcountView } from '../HeadcountView'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'
import { useUserStore } from '../../store/userStore'
import { useHeadcountStore } from '../../store/headcountStore'
import type { Permission } from '../../types'

const YEAR = new Date().getFullYear()
const plan = (id: string, title: string, quarter: string, extra: Record<string, unknown> = {}) => ({
  id, workspaceId: 'ws', title, departmentId: null, departmentName: null, departmentColour: null,
  roleType: 'new-headcount', targetQuarter: `${YEAR}-${quarter}`, chartId: null, status: 'planned', notes: null,
  createdBy: 'u', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra,
})
const USD = { salaryMin: 100_000, salaryMax: 140_000, salaryCurrency: 'USD' }

function setup(permission: Permission, plans: Record<string, unknown>[]) {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(api.get).mockImplementation((path: string) => Promise.resolve(path === '/api/headcount' ? plans : []) as never)
  vi.mocked(api.post).mockResolvedValue(plan('new', 'x', 'Q1') as never)
  vi.mocked(api.put).mockResolvedValue({} as never)
  useHeadcountStore.setState({ plans: [], loading: false })
  useUserStore.setState({ permission })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
  render(<MemoryRouter><HeadcountView /></MemoryRouter>)
}

describe('Headcount budget (roadmap 5)', () => {
  it('an admin sees the budget by quarter, with the range, per currency', async () => {
    setup('admin', [plan('a', 'Data Engineer', 'Q2', USD), plan('b', 'Designer', 'Q1', { salaryMin: 80_000, salaryMax: 80_000, salaryCurrency: 'GBP' })])
    expect(await screen.findByTestId('headcount-budget')).toBeInTheDocument()
    // Q2 hire: a quarter of 120k expected in Q2, Q3 and Q4, nothing in Q1; year = 90k; run-rate = 120k.
    expect(screen.getByTestId('budget-USD-q1')).toHaveTextContent('USD 0')
    expect(screen.getByTestId('budget-USD-q2')).toHaveTextContent('USD 30,000')
    expect(screen.getByTestId('budget-USD-q2')).toHaveTextContent('25,000–35,000')
    expect(screen.getByTestId('budget-USD-year')).toHaveTextContent('USD 90,000')
    expect(screen.getByTestId('budget-USD-run')).toHaveTextContent('USD 120,000')
    // A different currency is its own table, never converted into USD.
    expect(screen.getByTestId('budget-GBP-year')).toHaveTextContent('GBP 80,000')
  })

  it.each(['editor', 'commenter', 'viewer'] as const)('%s never sees the budget or any salary', async (role) => {
    // (the server would not even send these fields to them; this proves the screen does not show them either)
    setup(role, [plan('a', 'Data Engineer', 'Q2', USD)])
    expect(await screen.findByText('Data Engineer')).toBeInTheDocument()
    expect(screen.queryByTestId('headcount-budget')).toBeNull()
    expect(screen.queryByTestId('plan-salary')).toBeNull()
    expect(document.body.textContent).not.toMatch(/100,000|140,000|120,000/)
  })

  it('shows each hire\'s range on its card, for admins', async () => {
    setup('owner', [plan('a', 'Data Engineer', 'Q2', USD)])
    expect(await screen.findByTestId('plan-salary')).toHaveTextContent('USD 100,000 – 140,000 / yr')
  })

  it('lists hires with no salary as "no cost yet" and leaves them out of the totals', async () => {
    setup('admin', [plan('a', 'Data Engineer', 'Q1', USD), plan('b', 'Recruiter', 'Q2')])
    const note = await screen.findByTestId('budget-uncosted')
    expect(note).toHaveTextContent('1 hire has no salary yet')
    expect(note).toHaveTextContent('Recruiter')
    expect(screen.getByTestId('budget-USD-year')).toHaveTextContent('USD 120,000')
  })

  it('with hires but no salaries at all, says how to get a budget', async () => {
    setup('admin', [plan('a', 'Recruiter', 'Q2')])
    expect(await screen.findByText(/Add a salary range to a hire/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /budget csv/i })).toBeNull()
  })

  it('does not count hires from another year', async () => {
    setup('admin', [plan('a', 'Data Engineer', 'Q1', USD), { ...plan('b', 'Next year', 'Q1', USD), targetQuarter: `${YEAR + 1}-Q1` }])
    await screen.findByTestId('budget-USD-year')
    expect(screen.getByTestId('budget-USD-year')).toHaveTextContent('USD 120,000')
    expect(within(screen.getByTestId('budget-USD')).getByText(/1 hire$/)).toBeInTheDocument()
  })

  it('downloads the budget as CSV', async () => {
    setup('admin', [plan('a', 'Data Engineer', 'Q2', USD)])
    fireEvent.click(await screen.findByRole('button', { name: /budget csv/i }))
    expect(downloadText).toHaveBeenCalledTimes(1)
    const [name, text] = vi.mocked(downloadText).mock.calls[0]
    expect(name).toBe(`headcount-budget-${YEAR}.csv`)
    expect(text).toContain('USD,Expected,0,30000,30000,30000,90000,120000')
  })
})

describe('Headcount budget across years', () => {
  const earlier = (id: string) => ({ ...plan(id, 'Earlier hire', 'Q1', USD), targetQuarter: `${YEAR - 1}-Q1` })

  it('earlier years are left out until you ask for them, then count as a full year each', async () => {
    setup('admin', [plan('a', 'Data Engineer', 'Q2', USD), earlier('e')])
    expect(await screen.findByTestId('budget-USD-year')).toHaveTextContent('USD 90,000')
    fireEvent.click(screen.getByLabelText(/Include hires from earlier years/))
    await waitFor(() => expect(screen.getByTestId('budget-USD-year')).toHaveTextContent('USD 210,000'))   // 90k + a full 120k
    fireEvent.click(screen.getByLabelText(/Include hires from earlier years/))
    await waitFor(() => expect(screen.getByTestId('budget-USD-year')).toHaveTextContent('USD 90,000'))
  })

  it('shows the budget for a year that only has earlier hires, once they are included', async () => {
    setup('admin', [earlier('e')])
    expect(await screen.findByLabelText(/Include hires from earlier years/)).toBeInTheDocument()
    expect(screen.queryByTestId('budget-USD')).toBeNull()
    fireEvent.click(screen.getByLabelText(/Include hires from earlier years/))
    await waitFor(() => expect(screen.getByTestId('budget-USD-year')).toHaveTextContent('USD 120,000'))
  })

  it('offers no toggle when there are no earlier hires', async () => {
    setup('admin', [plan('a', 'Data Engineer', 'Q2', USD)])
    await screen.findByTestId('headcount-budget')
    expect(screen.queryByLabelText(/Include hires from earlier years/)).toBeNull()
  })
})

describe('Hire form: salary fields', () => {
  const openForm = async () => { fireEvent.click((await screen.findAllByRole('button', { name: /Add hire/ }))[0]) }
  // The form's own submit button shares its name with the header and column "Add hire" buttons, so look inside the form.
  const form = () => within(screen.getByPlaceholderText('Job title *').parentElement!.parentElement as HTMLElement)

  it('admins get salary fields; editors do not', async () => {
    setup('admin', [])
    await openForm()
    expect(screen.getByLabelText('Minimum salary')).toBeInTheDocument()
  })

  it('editors can add a hire but see no salary fields and send none', async () => {
    setup('editor', [])
    await openForm()
    expect(screen.queryByLabelText('Minimum salary')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Job title *'), { target: { value: 'Analyst' } })
    fireEvent.click(form().getByRole('button', { name: 'Add hire' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const sent = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>
    expect(sent).not.toHaveProperty('salaryMin')
    expect(sent).not.toHaveProperty('salaryCurrency')
  })

  it('an admin saves a range with an upper-case currency, and it is remembered for next time', async () => {
    setup('admin', [])
    await openForm()
    fireEvent.change(screen.getByPlaceholderText('Job title *'), { target: { value: 'Analyst' } })
    fireEvent.change(screen.getByLabelText('Minimum salary'), { target: { value: '90,000' } })
    fireEvent.change(screen.getByLabelText('Maximum salary'), { target: { value: '110000' } })
    fireEvent.change(screen.getByLabelText('Salary currency'), { target: { value: 'gbp' } })
    fireEvent.click(form().getByRole('button', { name: 'Add hire' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ salaryMin: 90_000, salaryMax: 110_000, salaryCurrency: 'GBP' })
    expect(localStorage.getItem('stratmap_headcount_currency')).toBe('GBP')
  })

  it('blocks a minimum above the maximum, a bad currency and fractions, with a reason', async () => {
    setup('admin', [])
    await openForm()
    fireEvent.change(screen.getByPlaceholderText('Job title *'), { target: { value: 'Analyst' } })
    const save = form().getByRole('button', { name: 'Add hire' })
    fireEvent.change(screen.getByLabelText('Minimum salary'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Maximum salary'), { target: { value: '100' } })
    expect(screen.getByRole('alert')).toHaveTextContent('minimum cannot be above')
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Minimum salary'), { target: { value: '50.5' } })
    expect(screen.getByRole('alert')).toHaveTextContent('whole numbers')
    fireEvent.change(screen.getByLabelText('Minimum salary'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Salary currency'), { target: { value: 'US' } })
    expect(screen.getByRole('alert')).toHaveTextContent('3-letter')
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Salary currency'), { target: { value: 'EUR' } })
    expect(save).toBeEnabled()
  })

  it('editing a hire and clearing the amounts removes the salary', async () => {
    setup('admin', [plan('a', 'Data Engineer', 'Q2', USD)])
    fireEvent.click(await screen.findByTitle('Edit'))
    fireEvent.change(screen.getByLabelText('Minimum salary'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Maximum salary'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({ salaryMin: null, salaryMax: null, salaryCurrency: null })
  })

  it('a plan without a salary adds none when saved with the amounts left blank', async () => {
    setup('admin', [])
    await openForm()
    fireEvent.change(screen.getByPlaceholderText('Job title *'), { target: { value: 'Analyst' } })
    fireEvent.click(form().getByRole('button', { name: 'Add hire' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(vi.mocked(api.post).mock.calls[0][1]).not.toHaveProperty('salaryMin')
  })
})
