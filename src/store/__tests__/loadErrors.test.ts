// Launch review R-46: a failed load is its own state. The stores never leave an empty default that reads as "no data",
// and a failed refresh keeps what was loaded before.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient')
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '../../lib/apiClient'
import { useHeadcountStore } from '../headcountStore'
import { useTemplateStore } from '../templateStore'
import { useWorkspaceDepartmentStore } from '../workspaceDepartmentStore'

const get = vi.mocked(api.get)

const PLAN = { id: 'hp-1', workspaceId: 'ws', title: 'Platform Engineer', roleType: 'new-headcount', targetQuarter: '2026-Q2', status: 'planned' }
const TEMPLATE = { id: 't-1', title: 'Engineer', department: 'Engineering', tags: [], responsibilities: '', requirements: '', uses: 0 }
const DEPT = { id: 'd-1', workspaceId: 'ws', name: 'Engineering', colour: '#0EA5E9' }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  get.mockReset()
  useHeadcountStore.setState({ plans: [], loading: false, loaded: false, error: false })
  useTemplateStore.setState({ templates: {}, loading: false, loaded: false, error: false })
  useWorkspaceDepartmentStore.setState({ departments: [], loading: false, loaded: false, error: false })
})

const stores = [
  {
    name: 'headcount plans',
    fetch: () => useHeadcountStore.getState().fetch(),
    state: () => useHeadcountStore.getState(),
    data: () => useHeadcountStore.getState().plans.length,
    reply: [PLAN],
  },
  {
    name: 'templates',
    fetch: () => useTemplateStore.getState().fetchTemplates(),
    state: () => useTemplateStore.getState(),
    data: () => Object.keys(useTemplateStore.getState().templates).length,
    reply: [TEMPLATE],
  },
  {
    name: 'workspace departments',
    fetch: () => useWorkspaceDepartmentStore.getState().fetch(),
    state: () => useWorkspaceDepartmentStore.getState(),
    data: () => useWorkspaceDepartmentStore.getState().departments.length,
    reply: [DEPT],
  },
]

describe.each(stores)('$name store', ({ fetch, state, data, reply }) => {
  it('a failed first load sets error and not loaded, so a page can say "could not load" instead of "empty"', async () => {
    get.mockRejectedValueOnce(new Error('Failed to fetch'))
    await fetch()
    expect(state().error).toBe(true)
    expect(state().loaded).toBe(false)
    expect(state().loading).toBe(false)
    expect(data()).toBe(0)
  })

  it('a retry that works clears the error and marks the store loaded', async () => {
    get.mockRejectedValueOnce(new Error('Failed to fetch'))
    await fetch()
    get.mockResolvedValueOnce(reply as never)
    await fetch()
    expect(state().error).toBe(false)
    expect(state().loaded).toBe(true)
    expect(data()).toBe(1)
  })

  it('a refresh that fails keeps the data already loaded', async () => {
    get.mockResolvedValueOnce(reply as never)
    await fetch()
    get.mockRejectedValueOnce(new Error('Failed to fetch'))
    await fetch()
    expect(data()).toBe(1)
    expect(state().loaded).toBe(true) // pages only show the error when nothing was ever loaded
  })

  it('a genuinely empty reply is loaded with no error: that is the only time a page may say "none yet"', async () => {
    get.mockResolvedValueOnce([] as never)
    await fetch()
    expect(state().loaded).toBe(true)
    expect(state().error).toBe(false)
    expect(data()).toBe(0)
  })
})
