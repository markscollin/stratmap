export interface MockRes {
  _status: number
  _body: unknown
  _ended: boolean
  _written: string
  _headers: Record<string, string>
  headersSent: boolean
  status: (code: number) => MockRes
  json: (body: unknown) => MockRes
  end: (chunk?: string) => MockRes
  setHeader: (key: string, value: string) => MockRes
  write: (chunk: string) => boolean
}

export function createRes(): MockRes {
  const r: MockRes = {
    _status: 200,
    _body: undefined,
    _ended: false,
    _written: '',
    _headers: {},
    headersSent: false,
    status(code) { r._status = code; return r },
    json(body) { r._body = body; return r },
    end(chunk) { if (chunk) { r._written += chunk; r.headersSent = true } r._ended = true; return r },
    setHeader(key, value) { r._headers[key] = value; return r },
    write(chunk) { r._written += chunk; r.headersSent = true; return true },
  }
  return r
}
