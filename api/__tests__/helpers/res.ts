export interface MockRes {
  _status: number
  _body: unknown
  _ended: boolean
  status: (code: number) => MockRes
  json: (body: unknown) => MockRes
  end: () => MockRes
}

export function createRes(): MockRes {
  const r: MockRes = {
    _status: 200,
    _body: undefined,
    _ended: false,
    status(code) { r._status = code; return r },
    json(body) { r._body = body; return r },
    end() { r._ended = true; return r },
  }
  return r
}
