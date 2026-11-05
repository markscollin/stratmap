import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Dev-bypass mode, so no Clerk token is needed for the headers.
vi.mock('../../features/auth/useAuth', () => ({ IS_DEV_BYPASS: true }))

import { api, ApiError } from '../apiClient'
import { getSelectedWorkspaceId, setSelectedWorkspaceId } from '../workspaceSelection'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn()

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

function sentHeaders(call: number): Record<string, string> {
  return fetchMock.mock.calls[call][1].headers as Record<string, string>
}

describe('selected workspace (roadmap 1.2)', () => {
  it('sends X-Workspace-Id for the remembered workspace', async () => {
    setSelectedWorkspaceId('ws-b')
    fetchMock.mockResolvedValue(json(200, { ok: true }))
    await api.get('/api/charts')
    expect(sentHeaders(0)['X-Workspace-Id']).toBe('ws-b')
  })

  it('sends no header before a workspace is chosen', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await api.get('/api/workspace')
    expect(sentHeaders(0)).not.toHaveProperty('X-Workspace-Id')
  })

  it('forgets a workspace the user was removed from and retries with the default', async () => {
    setSelectedWorkspaceId('ws-gone')
    fetchMock
      .mockResolvedValueOnce(json(403, { error: 'not-a-member' }))
      .mockResolvedValueOnce(json(200, { id: 'ws-a' }))
    const ws = await api.get<{ id: string }>('/api/workspace')
    expect(ws.id).toBe('ws-a')
    expect(getSelectedWorkspaceId()).toBeNull()
    expect(sentHeaders(1)).not.toHaveProperty('X-Workspace-Id')
  })

  it('does not retry other 403s', async () => {
    setSelectedWorkspaceId('ws-b')
    fetchMock.mockResolvedValue(json(403, { error: 'forbidden' }))
    await expect(api.get('/api/charts')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getSelectedWorkspaceId()).toBe('ws-b')
  })
})
