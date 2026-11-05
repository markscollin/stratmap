import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {
    body: Record<string, unknown> = {}
    get userMessage() { return this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '../../lib/apiClient'
import { RolesView } from '../RolesView'

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/api/roles/search')) {
      return Promise.resolve({
        truncated: false,
        results: [
          { nodeId: 'n1', chartId: 'c1', chart: 'Current Structure', version: 2, title: 'QA Engineer', person: 'Priya', status: 'active', dept: 'Engineering' },
          { nodeId: 'n2', chartId: 'c1', chart: 'Current Structure', version: 2, title: 'QA Engineer', person: null, status: 'open', dept: null },
        ],
      }) as never
    }
    return Promise.resolve([]) as never
  })
})

async function search(q: string) {
  render(<MemoryRouter><RolesView /></MemoryRouter>)
  fireEvent.click(screen.getByText('Find roles'))
  fireEvent.change(screen.getByPlaceholderText(/Search by job title/), { target: { value: q } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

describe('Roles → search', () => {
  it('shows real results from the API for the typed query', async () => {
    await search('QA Engineer')
    expect(await screen.findByText('Priya')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/roles/search?q=QA%20Engineer')
    expect(screen.getByText('2 results across 1 chart')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Current Structure' })[0]).toHaveAttribute('href', '/charts/c1')
  })

  it('shows an empty state when nothing matches', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/api/roles/search') ? { results: [], truncated: false } : []) as never)
    await search('Astronaut')
    expect(await screen.findByText(/No roles match "Astronaut"/)).toBeInTheDocument()
  })
})
