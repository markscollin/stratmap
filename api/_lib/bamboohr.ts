import type { ColumnMapping, ParsedSheet } from '../../src/lib/importOrg'
import { emptyMapping } from '../../src/lib/importOrg'

// R-78: reading a company's people from BambooHR (owner decision D-8: BambooHR first). Everything BambooHR-specific is in
// this file; the rest of the sync turns the result into a spreadsheet-shaped table and runs the same rules as "Update from
// file" (src/lib/updateFromFile.ts).
//
// The request follows BambooHR's public API as the builder knows it. It could not be checked against the documentation from
// the build sandbox (the docs host was unreachable), so check these against https://documentation.bamboohr.com before launch
// and with a real key (docs/OWNER_CHECKLIST.md, O-16):
//   - base URL https://api.bamboohr.com/api/gateway.php/<subdomain>/v1/
//   - HTTP Basic auth: the API key is the user name, the password can be any text ("x")
//   - POST reports/custom?format=JSON&onlyCurrent=true with {"fields": [...]} answers {"fields": [...], "employees": [{...}]},
//     every value a string or null
//   - the supervisor's employee id is the field "supervisorEId"; "status" is "Active" or "Inactive"
//   - 401/403: the key is wrong or lacks access; 404: no such company; 429/503: too many requests (Retry-After)

export const BAMBOO_FIELDS = [
  'id', 'firstName', 'lastName', 'preferredName', 'displayName', 'jobTitle', 'department', 'location', 'workEmail',
  'supervisorEId', 'hireDate', 'status',
] as const

export type BambooEmployee = Partial<Record<(typeof BAMBOO_FIELDS)[number], string | null>>

export type BambooFailure = 'bad-key' | 'no-such-company' | 'rate-limited' | 'unavailable' | 'bad-reply'

export class BambooError extends Error {
  constructor(public readonly kind: BambooFailure, message: string) { super(message) }
}

/** What a person is told for each failure. Never the key, never BambooHR's raw reply. */
export const BAMBOO_FAILURE_TEXT: Record<BambooFailure, string> = {
  'bad-key': 'BambooHR refused the API key. Check it, and that the BambooHR user it belongs to can see employees and their managers.',
  'no-such-company': 'BambooHR has no company with that subdomain. It is the part before .bamboohr.com in your BambooHR address.',
  'rate-limited': 'BambooHR asked us to slow down. Try again in a few minutes.',
  'unavailable': "BambooHR didn't answer. Try again later.",
  'bad-reply': 'BambooHR answered in a way we did not expect. Nothing was changed.',
}

/** A BambooHR company subdomain: lower-case letters, digits and hyphens. Anything else never reaches a URL. */
export function validSubdomain(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)
}

const TIMEOUT_MS = 15_000

export async function fetchBambooEmployees(subdomain: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<BambooEmployee[]> {
  if (!validSubdomain(subdomain)) throw new BambooError('no-such-company', 'invalid subdomain')
  const url = `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/reports/custom?format=JSON&onlyCurrent=true`
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString('base64')}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: BAMBOO_FIELDS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error', // never follow a redirect with the key on it
    })
  } catch {
    throw new BambooError('unavailable', 'request failed')
  }
  if (res.status === 401 || res.status === 403) throw new BambooError('bad-key', `status ${res.status}`)
  if (res.status === 404) throw new BambooError('no-such-company', 'status 404')
  if (res.status === 429 || res.status === 503) throw new BambooError('rate-limited', `status ${res.status}`)
  if (!res.ok) throw new BambooError('unavailable', `status ${res.status}`)
  let body: unknown
  try { body = await res.json() } catch { throw new BambooError('bad-reply', 'not JSON') }
  const employees = (body as { employees?: unknown })?.employees
  if (!Array.isArray(employees)) throw new BambooError('bad-reply', 'no employees list')
  return employees.filter((e): e is BambooEmployee => !!e && typeof e === 'object')
}

const HEADERS = ['ID', 'Name', 'Title', 'Department', 'Reports to', 'Email', 'Location', 'Start date'] as const

/**
 * BambooHR's people as the table "Update from file" reads, with its columns already chosen. Only current, active employees;
 * a manager who is not in the list (left, or outside the report) is dropped from "Reports to", so the row becomes a top role
 * instead of blocking the whole sync.
 */
export function bambooSheet(employees: BambooEmployee[]): { sheet: ParsedSheet; mapping: ColumnMapping } {
  const text = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : '')
  const active = employees.filter(e => text(e.id) && (!text(e.status) || text(e.status).toLowerCase() === 'active'))
  const ids = new Set(active.map(e => text(e.id)))
  const name = (e: BambooEmployee) => {
    const first = text(e.preferredName) || text(e.firstName)
    const full = [first, text(e.lastName)].filter(Boolean).join(' ')
    return full || text(e.displayName)
  }
  const rows = active.map(e => {
    const boss = text(e.supervisorEId)
    return [
      text(e.id), name(e), text(e.jobTitle), text(e.department), boss && ids.has(boss) && boss !== text(e.id) ? boss : '',
      text(e.workEmail).toLowerCase(), text(e.location), text(e.hireDate) === '0000-00-00' ? '' : text(e.hireDate),
    ]
  })
  const mapping = emptyMapping()
  HEADERS.forEach((h, i) => {
    const field = ({ ID: 'rowId', Name: 'name', Title: 'title', Department: 'department', 'Reports to': 'manager', Email: 'email', Location: 'location', 'Start date': 'startDate' } as const)[h]
    mapping[field] = i
  })
  return { sheet: { headers: [...HEADERS], rows }, mapping }
}
