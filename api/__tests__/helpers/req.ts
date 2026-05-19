export interface MockReq {
  method: string
  body: unknown
  query: Record<string, string>
  headers: Record<string, string>
}

export function createReq({
  method = 'GET',
  body = {},
  query = {},
  headers = {},
}: {
  method?: string
  body?: unknown
  query?: Record<string, string>
  headers?: Record<string, string>
} = {}): MockReq {
  return { method, body, query, headers }
}
