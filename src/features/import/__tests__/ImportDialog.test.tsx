import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn() } }
})

import { api, ApiError } from '../../../lib/apiClient'
import { ImportDialog, type ImportDialogProps } from '../ImportDialog'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { useChartStore } from '../../../store/chartStore'
import type { OrgNode } from '../../../types'

const CSV = 'Name,Title,Reports to\nAlex,CEO,\nSam,CTO,Alex\n,Engineer,Sam\n'

function Where() { return <div data-testid="where">{useLocation().pathname}</div> }

function renderDialog(props: Partial<ImportDialogProps> = {}) {
  const onClose = vi.fn()
  render(
    <MemoryRouter initialEntries={['/charts']}>
      <ImportDialog onClose={onClose} {...props} />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
  return { onClose }
}

async function upload(content: string, name = 'people.csv', type = 'text/csv') {
  const input = screen.getByTestId('import-file') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([content], name, { type })] } })
}

const existingNodes = (n: number): OrgNode[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`, name: `P${i}`, title: 't', departmentId: '', managerId: null, status: 'active' as const,
    employmentType: 'full-time' as const, x: i * 100, y: 20,
  }))
const CHART = (n = 2) => ({ id: 'c1', name: 'Main chart', nodes: existingNodes(n), departments: [] })

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  useBillingStore.setState({ plan: PLAN_BY_TIER.free })
  useChartStore.setState({ charts: [], loaded: true, loading: false })
})

describe('ImportDialog', () => {
  it('walks file → columns → review, guessing the mapping, and shows a dry run', async () => {
    renderDialog({ chart: CHART() })
    await upload(CSV)

    expect(await screen.findByText(/people.csv · 3 rows/)).toBeInTheDocument()
    expect((screen.getByLabelText('Name') as HTMLSelectElement).value).toBe('0')
    expect((screen.getByLabelText('Title') as HTMLSelectElement).value).toBe('1')
    expect((screen.getByLabelText('Reports to') as HTMLSelectElement).value).toBe('2')

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByTestId('stat-imported')).toHaveTextContent('3')
    expect(screen.getByText(/No problems found/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 3 roles' })).toBeEnabled()
    // nothing was written by reviewing
    expect(api.post).not.toHaveBeenCalled()
  })

  it('adds to the current chart, then tells the page to reload', async () => {
    vi.mocked(api.post).mockResolvedValue({ imported: 3 })
    const onImported = vi.fn()
    const { onClose } = renderDialog({ chart: CHART(), onImported })
    await upload(CSV)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 roles' }))

    await waitFor(() => expect(onImported).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledTimes(1)
    const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, { nodes: OrgNode[]; edges: unknown[] }]
    expect(url).toBe('/api/charts/c1/import')
    expect(body.nodes).toHaveLength(3)
    expect(body.edges).toHaveLength(2)
    // placed to the right of the 2 existing nodes (x up to 100)
    expect(Math.min(...body.nodes.map(n => n.x))).toBeGreaterThan(100)
    expect(onClose).toHaveBeenCalled()
  })

  it('imports into a new chart and opens it', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new1', name: 'people', status: 'draft', version: 1, createdAt: '', updatedAt: '' })
    renderDialog() // opened from the chart library: always a new chart
    await upload(CSV)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByLabelText('New chart name')).toHaveValue('people')
    fireEvent.change(screen.getByLabelText('New chart name'), { target: { value: 'Q4 org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import 3 roles' }))

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/charts/new1'))
    const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, { name: string; templateNodes: unknown[]; templateEdges: unknown[] }]
    expect(url).toBe('/api/charts')
    expect(body).toMatchObject({ name: 'Q4 org' })
    expect(body.templateNodes).toHaveLength(3)
    expect(body.templateEdges).toHaveLength(2)
  })

  it('blocks the import when the file has errors, and lists them by row', async () => {
    renderDialog({ chart: CHART() })
    await upload('Name,Title,Reports to\nAlex,CEO,\nSam,CTO,Nobody\n')
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))

    const problems = await screen.findByRole('list', { name: 'Problems found' })
    expect(within(problems).getByText(/Row 3/)).toBeInTheDocument()
    expect(within(problems).getByText(/doesn't match any ID, email or name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled()
    expect(screen.queryByText(/No problems found/)).not.toBeInTheDocument()
  })

  it('blocks everything when the roles would not fit the plan', async () => {
    // Free allows 30 roles; the chart has 28 and the file adds 3.
    renderDialog({ chart: CHART(28) })
    await upload(CSV)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))

    expect(await screen.findByText(/Over your plan's limit/)).toBeInTheDocument()
    expect(screen.getByText(/this would make 31/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('lets a plan with room import the same file', async () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.starter })
    renderDialog({ chart: CHART(28) })
    await upload(CSV)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('button', { name: 'Import 3 roles' })).toBeEnabled()
  })

  it('needs a Name or Title column before continuing', async () => {
    renderDialog()
    await upload(CSV)
    await screen.findByText(/people.csv/)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/Choose a Name column or a Title column/)
  })

  it('shows the server’s reason when the import is refused', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(402, { error: 'plan-limit', message: 'Your free plan allows up to 30 roles per chart. Upgrade to add more.' }))
    const { onClose } = renderDialog({ chart: CHART() })
    await upload(CSV)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 roles' }))
    expect(await screen.findByText(/allows up to 30 roles per chart/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Import 3 roles' })).toBeEnabled() // can retry
  })

  it('rejects files it cannot read, with a reason', async () => {
    renderDialog()
    await upload('hello', 'notes.pdf', 'application/pdf')
    expect(await screen.findByRole('alert')).toHaveTextContent(/\.csv or \.xlsx/)
  })

  it('disables "new chart" at the chart limit, so the roles go into this chart', async () => {
    useChartStore.setState({
      charts: [{ id: 'c1', name: 'Main chart' } as never], loaded: true, loading: false,
    }) // Free allows 1 chart
    renderDialog({ chart: CHART() })
    await upload(CSV)
    await screen.findByText(/people.csv/)
    expect(screen.getByRole('radio', { name: /Create a new chart/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Add to this chart/ })).toBeChecked()
  })

  it('offers both targets when opened from a chart', async () => {
    renderDialog({ chart: CHART() })
    await upload(CSV)
    await screen.findByText(/people.csv/)
    fireEvent.click(screen.getByRole('radio', { name: /Create a new chart/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByLabelText('New chart name')).toBeInTheDocument()
  })

  // What "Export as CSV" writes, in a few rows: positions, formatting and reporting lines.
  const EXPORT_CSV = [
    'ID,Name,Title,Department,Reports to,Location,Start date,Role type,Status,Employment type,X,Y,Department colour',
    '1,Alex,CEO,Leadership,,,,,Active,Full-time,500,0,#64748B',
    '2,Sam,CTO,Engineering,1,,,,Active,Full-time,100.5,180,#0EA5E9',
    '3,,Engineer,Engineering,2,,,New headcount,Open,Full-time,-40,360,#0EA5E9',
  ].join('\n') + '\n'

  it('shows the layout and formatting columns open when the file has them', async () => {
    renderDialog()
    await upload(EXPORT_CSV)
    await screen.findByText(/people.csv/)
    const details = screen.getByText('Layout and formatting (optional)').closest('details')!
    expect(details).toHaveAttribute('open')
    expect((screen.getByLabelText('X position') as HTMLSelectElement).value).toBe('10')
    expect((screen.getByLabelText('Department colour') as HTMLSelectElement).value).toBe('12')
  })

  it('keeps the exact positions, colours and status when importing into a new chart', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'n1', name: 'people', status: 'draft', version: 1, createdAt: '', updatedAt: '' })
    renderDialog()
    await upload(EXPORT_CSV)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText(/keep the positions in your file/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import 3 roles' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())

    const body = vi.mocked(api.post).mock.calls[0][1] as {
      templateNodes: { title: string; x: number; y: number; status: string }[]
      templateDepts: { name: string; colour: string }[]
    }
    expect(body.templateNodes.map(n => [n.title, n.x, n.y])).toEqual([['CEO', 500, 0], ['CTO', 100.5, 180], ['Engineer', -40, 360]])
    expect(body.templateNodes[2].status).toBe('open')
    expect(body.templateDepts.find(d => d.name === 'Engineering')?.colour).toBe('#0EA5E9')
  })

  it('moves the shape to the right of the chart when adding to it, keeping relative positions', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderDialog({ chart: CHART(2), onImported: vi.fn() }) // existing nodes at x 0 and 100
    await upload(EXPORT_CSV)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 roles' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const { nodes } = vi.mocked(api.post).mock.calls[0][1] as { nodes: OrgNode[] }
    const xs = nodes.map(n => n.x)
    expect(Math.min(...xs)).toBeGreaterThan(100)                 // clear of what's there
    expect(nodes[0].x - nodes[2].x).toBeCloseTo(540, 2)          // 500 - (-40)
    expect(nodes[2].y - nodes[0].y).toBe(360)
  })
})

