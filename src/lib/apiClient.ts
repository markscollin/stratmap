import { IS_DEV_BYPASS } from '../features/auth/useAuth'
import { getSelectedWorkspaceId, setSelectedWorkspaceId } from './workspaceSelection'
import { devUserHeader } from './devIdentity'
import {
  REVISION_HEADER, chartIdOfPath, isChartRead, structuralChartId, rememberRevision,
  revisionHeader, inOrder, hasConflict, useChartConflict,
} from './chartRevision'

async function getAuthHeaders(): Promise<Record<string, string>> {
  // The selected workspace (roadmap 1.2). The server checks membership.
  const workspaceId = getSelectedWorkspaceId()
  const ws: Record<string, string> = workspaceId ? { 'X-Workspace-Id': workspaceId } : {}
  if (IS_DEV_BYPASS) {
    return { 'X-Dev-User': devUserHeader(), ...ws }
  }
  // Get Clerk session token from the global Clerk singleton
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = await (window as any).Clerk?.session?.getToken?.()
  return token ? { Authorization: `Bearer ${token}`, ...ws } : ws
}

/** Error thrown for non-2xx API responses. `message` is the server's `error` code
 *  (e.g. 'no-workspace', 'plan-limit', 'forbidden'); `body.message`, when present,
 *  is a human-readable explanation suitable for a toast. */
export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : `API error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
  /** Human-readable message if the server supplied one, else the error code. */
  get userMessage(): string {
    return typeof this.body.message === 'string' ? this.body.message : this.message
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const editedChart = structuralChartId(method, path)
  if (!editedChart) return send<T>(path, method, options)
  // Structural edits to one chart go out one at a time so each carries the revision the
  // previous one returned (roadmap 2.4). After a conflict nothing more is sent.
  return inOrder(editedChart, () => {
    if (hasConflict(editedChart)) {
      throw new ApiError(409, { error: 'chart-changed', message: 'This chart was changed by someone else. Reload to see the latest version.' })
    }
    return send<T>(path, method, options)
  })
}

async function send<T>(
  path: string,
  method: string,
  options: RequestInit,
  retried = false,
): Promise<T> {
  const authHeaders = await getAuthHeaders()
  const chartId = chartIdOfPath(path)
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(chartId && structuralChartId(method, path) ? revisionHeader(chartId) : {}),
      ...options.headers,
    },
  })

  // Every response from a chart route says which revision the chart is now at.
  if (chartId) rememberRevision(chartId, res.headers.get(REVISION_HEADER))

  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Removed from the remembered workspace: forget it and retry with the default one.
    if (res.status === 403 && body.error === 'not-a-member' && getSelectedWorkspaceId() && !retried) {
      setSelectedWorkspaceId(null)
      return send<T>(path, method, options, true)
    }
    // Someone else edited this chart: stop sending edits until the user reloads it.
    if (res.status === 409 && body.error === 'chart-changed' && chartId) useChartConflict.getState().flag(chartId)
    throw new ApiError(res.status, body)
  }
  const data = await res.json()
  if (chartId && isChartRead(method, path)) rememberRevision(chartId, data?.revision)
  return data as T
}

// Returns the raw Response so callers can read a streaming body (res.body).
// Does not throw on non-2xx — the caller inspects res.status / res.ok itself.
async function postStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const authHeaders = await getAuthHeaders()
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
    signal,
  })
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postStream,
}
