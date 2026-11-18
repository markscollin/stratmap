// R-52: the template library says who updated a template by name, never by the stored user id.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error { body: Record<string, unknown> = {}; get userMessage() { return this.message } }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '../../lib/apiClient'
import { useUserStore, MOCK_USER, MOCK_WORKSPACE } from '../../store/userStore'
import { RolesView } from '../RolesView'

const tpl = (id: string, title: string, updatedBy: string) => ({
  id, title, department: 'Engineering', responsibilities: '', requirements: '', tags: [], createdBy: updatedBy, updatedBy,
  updatedAt: '2026-11-01T10:00:00Z', uses: 0,
})

beforeEach(() => {
  useUserStore.setState({
    user: { ...MOCK_USER, id: 'user_me' },
    workspace: { ...MOCK_WORKSPACE, members: [
      { user: { id: 'user_me', name: 'Me Myself', email: 'me@x.test' }, permission: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
      { user: { id: 'user_ada', name: 'Ada Lovelace', email: 'ada@x.test' }, permission: 'editor', joinedAt: '2026-01-01T00:00:00Z' },
    ] },
  })
  vi.mocked(api.get).mockImplementation((path: string) => Promise.resolve(
    path.startsWith('/api/templates') ? [tpl('t1', 'By me', 'user_me'), tpl('t2', 'By Ada', 'user_ada'), tpl('t3', 'By a leaver', 'user_2LeftTheCompany')] : [],
  ) as never)
})

describe('Roles → template byline (R-52)', () => {
  it('shows You, the member name, or "a former member", and never a user id', async () => {
    render(<MemoryRouter><RolesView /></MemoryRouter>)
    expect(await screen.findByText(/Updated by You ·/)).toBeInTheDocument()
    expect(screen.getByText(/Updated by Ada Lovelace ·/)).toBeInTheDocument()
    expect(screen.getByText(/Updated by a former member ·/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/user_2|user_ada|user_me/)
  })
})
