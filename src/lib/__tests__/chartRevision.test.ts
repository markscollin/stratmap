import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { structuralChartId, chartIdOfPath, resetChartRevisions, useChartConflict } from '../chartRevision'
import { api, ApiError } from '../apiClient'

describe('structuralChartId', () => {
  it.each([
    ['POST', '/api/charts/c1/nodes', 'c1'],
    ['PUT', '/api/charts/c1/nodes/n1', 'c1'],
    ['DELETE', '/api/charts/c1/nodes/n1', 'c1'],
    ['POST', '/api/charts/c1/edges', 'c1'],
    ['DELETE', '/api/charts/c1/edges/e1', 'c1'],
    ['POST', '/api/charts/c1/import', 'c1'],
    ['POST', '/api/charts/c1/nodes/n1/restore', 'c1'],   // Undo of a role delete
    ['PUT', '/api/charts/c1', 'c1'],
  ])('%s %s is structural', (method, path, id) => expect(structuralChartId(method, path)).toBe(id))

  it.each([
    ['PUT', '/api/charts/c1/nodes'],          // moving boxes
    ['GET', '/api/charts/c1'],
    ['DELETE', '/api/charts/c1'],
    ['POST', '/api/charts/c1/share'],
    ['GET', '/api/charts/c1/nodes/n1/restore'],
    ['PUT', '/api/charts/c1/jd/n1'],
    ['POST', '/api/charts'],
    ['GET', '/api/workspace'],
  ])('%s %s is not', (method, path) => expect(structuralChartId(method, path)).toBeNull())

  it('finds the chart id under any chart route but not share or jd', () => {
    expect(chartIdOfPath('/api/charts/c1/nodes')).toBe('c1')
    expect(chartIdOfPath('/api/charts/c1?x=1')).toBe('c1')
    expect(chartIdOfPath('/api/charts/c1/share')).toBeNull()
  })
})

type Reply = { status: number; body?: unknown; revision?: number }

function mockFetch(replies: Reply[]) {
  const calls: { url: string; revision: string | null }[] = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const reply = replies.shift() ?? { status: 204 }
    calls.push({ url, revision: new Headers(init.headers).get('X-Chart-Revision') })
    const headers = new Headers()
    if (reply.revision !== undefined) headers.set('X-Chart-Revision', String(reply.revision))
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), { status: reply.status, headers })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

describe('api client revisions', () => {
  beforeEach(() => resetChartRevisions())
  afterEach(() => vi.unstubAllGlobals())

  it('learns the revision from loading a chart and sends it with the next edit', async () => {
    const calls = mockFetch([{ status: 200, body: { id: 'c1', revision: 7 } }, { status: 201, body: {}, revision: 8 }])
    await api.get('/api/charts/c1')
    await api.post('/api/charts/c1/nodes', {})
    expect(calls[0].revision).toBeNull()
    expect(calls[1].revision).toBe('7')
  })

  it('sends no revision header before it knows one', async () => {
    const calls = mockFetch([{ status: 201, revision: 1 }])
    await api.post('/api/charts/c1/nodes', {})
    expect(calls[0].revision).toBeNull()
  })

  it('back-to-back edits go one at a time, each with the revision the last one returned', async () => {
    const calls = mockFetch([
      { status: 200, body: { revision: 0 } },
      { status: 201, revision: 1 }, { status: 201, revision: 2 }, { status: 204, revision: 3 },
    ])
    await api.get('/api/charts/c1')
    await Promise.all([
      api.post('/api/charts/c1/nodes', {}),
      api.post('/api/charts/c1/edges', {}),
      api.delete('/api/charts/c1/edges/e1'),
    ])
    expect(calls.slice(1).map(c => c.revision)).toEqual(['0', '1', '2'])
  })

  it('moving boxes sends no revision and is not queued', async () => {
    const calls = mockFetch([{ status: 200, body: { revision: 4 } }, { status: 204 }])
    await api.get('/api/charts/c1')
    await api.put('/api/charts/c1/nodes', [])
    expect(calls[1].revision).toBeNull()
  })

  it('a 409 chart-changed flags the chart and later edits are not sent', async () => {
    const calls = mockFetch([
      { status: 200, body: { revision: 1 } },
      { status: 409, body: { error: 'chart-changed', revision: 5 }, revision: 5 },
    ])
    await api.get('/api/charts/c1')
    await expect(api.post('/api/charts/c1/nodes', {})).rejects.toMatchObject({ status: 409, message: 'chart-changed' })
    expect(useChartConflict.getState().chartId).toBe('c1')
    const again = api.post('/api/charts/c1/edges', {})
    await expect(again).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(2) // the second edit never left the browser
  })

  it('other 409s do not flag a conflict', async () => {
    mockFetch([{ status: 409, body: { error: 'something-else' } }])
    await expect(api.post('/api/charts/c1/nodes', {})).rejects.toBeInstanceOf(ApiError)
    expect(useChartConflict.getState().chartId).toBeNull()
  })

  it('a failed edit does not block the next one', async () => {
    const calls = mockFetch([{ status: 400, body: { error: 'bad' } }, { status: 201, revision: 1 }])
    await expect(api.post('/api/charts/c1/nodes', {})).rejects.toBeInstanceOf(ApiError)
    await api.post('/api/charts/c1/nodes', {})
    expect(calls).toHaveLength(2)
  })
})
