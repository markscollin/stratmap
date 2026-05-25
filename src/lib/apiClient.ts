import { IS_DEV_BYPASS } from '../features/auth/useAuth'

async function getAuthHeaders(): Promise<HeadersInit> {
  if (IS_DEV_BYPASS) {
    return { 'X-Dev-User': 'true' }
  }
  // Get Clerk session token from the global Clerk singleton
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = await (window as any).Clerk?.session?.getToken?.()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
  })

  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
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
