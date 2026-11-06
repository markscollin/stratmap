import type { OrgNode, OrgEdge, Department, RoleType, NodeStatus } from '../types'
import { calculateLayout } from '../utils/layout'
import { TEMPLATE_DEPARTMENTS } from './chartTemplates'

// Roadmap 2.1: turn a spreadsheet of people into a reporting tree.
//
// Pure functions only (no DOM, no network), so every rule below is unit tested.
// The flow is: parse the file into a ParsedSheet → the user maps columns →
// buildImportPlan() produces nodes, edges and a list of issues. That plan is the
// "dry run": nothing is written until the user confirms it. The server re-checks
// plan limits and permissions when the plan is committed.

/** Same cap as the API's seed limit (api/_lib/schemas.ts MAX_TEMPLATE_NODES). */
export const MAX_IMPORT_ROWS = 5000
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

const NAME_MAX = 200
const DATE_MAX = 40
const FALLBACK_TITLE = 'Team member'

export type ImportField =
  | 'rowId' | 'name' | 'title' | 'department' | 'manager' | 'email' | 'location' | 'startDate' | 'roleType'

export interface ImportFieldInfo {
  field: ImportField
  label: string
  hint: string
}

/** Order here is the order of the mapping step. */
export const IMPORT_FIELDS: ImportFieldInfo[] = [
  { field: 'name',       label: 'Name',        hint: 'Leave a cell blank for a role nobody holds yet.' },
  { field: 'title',      label: 'Title',       hint: 'A row needs a name or a title (or both).' },
  { field: 'manager',    label: 'Reports to',  hint: 'Who this person reports to: an ID, an email or a full name.' },
  { field: 'rowId',      label: 'ID',          hint: 'Optional. Lets "Reports to" point at a role that has no name or email.' },
  { field: 'email',      label: 'Email',       hint: 'Optional. Used to match "Reports to" without ambiguity.' },
  { field: 'department', label: 'Department',  hint: 'Optional. New departments are created for you.' },
  { field: 'location',   label: 'Location',    hint: 'Optional.' },
  { field: 'startDate',  label: 'Start date',  hint: 'Optional. Use YYYY-MM-DD.' },
  { field: 'roleType',   label: 'Role type',   hint: 'Optional: existing, new headcount, backfill, contractor or TBD.' },
]

export type ColumnMapping = Record<ImportField, number | null>

export interface ParsedSheet {
  headers: string[]
  /** Every cell as trimmed-or-raw text; rows are padded to the header width. */
  rows: string[][]
}

export interface ImportIssue {
  /** Spreadsheet row number (the header is row 1), or null for file-level issues. */
  row: number | null
  severity: 'error' | 'warning'
  message: string
}

export interface ImportOptions {
  /** Roles already on the target chart (0 when importing into a new chart). */
  existingNodeCount?: number
  /** The plan's per-chart role limit; -1 or undefined for unlimited. */
  maxNodes?: number
  /** Departments already on the target chart, to report which ones are new. */
  existingDepartments?: { name: string }[]
  /** Top-left corner for the laid-out tree. */
  origin?: { x: number; y: number }
}

export interface ImportStats {
  /** Non-empty data rows in the file. */
  rows: number
  imported: number
  skipped: number
  vacant: number
  /** Roles with no manager (top of a tree). */
  roots: number
  departments: number
  newDepartments: number
}

export interface ImportPlan {
  nodes: OrgNode[]
  edges: OrgEdge[]
  /** Every department the nodes use. The server reuses same-named ones on an existing chart. */
  departments: Department[]
  issues: ImportIssue[]
  stats: ImportStats
  /** Set when the import would take the chart over its plan limit. */
  overLimit: { max: number; wouldHave: number } | null
  /** Any error blocks the import: nothing is written until the file is fixed. */
  blocked: boolean
}

// ─── Column guessing ─────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const SYNONYMS: Record<ImportField, string[]> = {
  rowId:      ['id', 'row id', 'employee id', 'emp id', 'staff id', 'position id', 'role id', 'employee number', 'employee no'],
  manager:    ['manager', 'reports to', 'report to', 'reports to id', 'manager id', 'manager email', 'manager name',
               'supervisor', 'line manager', 'direct manager', 'boss', 'manager employee id'],
  email:      ['email', 'e mail', 'work email', 'email address', 'employee email'],
  name:       ['name', 'full name', 'employee', 'employee name', 'person', 'person name', 'team member'],
  title:      ['title', 'job title', 'role', 'position', 'job', 'role title', 'position title'],
  department: ['department', 'dept', 'team', 'function', 'division'],
  location:   ['location', 'office', 'city', 'site', 'country'],
  startDate:  ['start date', 'hire date', 'joined', 'date hired', 'start', 'date joined', 'joining date'],
  roleType:   ['role type', 'type', 'headcount type', 'hiring status'],
}

// "manager" must claim its columns before "name"/"email" can match "Manager Name".
const GUESS_ORDER: ImportField[] = ['rowId', 'manager', 'email', 'name', 'title', 'department', 'location', 'startDate', 'roleType']

export function emptyMapping(): ColumnMapping {
  return { rowId: null, name: null, title: null, department: null, manager: null, email: null, location: null, startDate: null, roleType: null }
}

/** Best-effort column mapping from the header names. The user can change every choice. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping = emptyMapping()
  const used = new Set<number>()
  const normed = headers.map(norm)

  // Pass 1: exact header matches. Pass 2: the header contains a synonym.
  for (const pass of [1, 2] as const) {
    for (const field of GUESS_ORDER) {
      if (mapping[field] !== null) continue
      const idx = normed.findIndex((h, i) => {
        if (used.has(i) || !h) return false
        if (pass === 1) return SYNONYMS[field].includes(h)
        if (field !== 'manager' && /manager|reports/.test(h)) return false
        return SYNONYMS[field].some(s => s.length >= 4 && h.includes(s))
      })
      if (idx >= 0) { mapping[field] = idx; used.add(idx) }
    }
  }
  return mapping
}

// ─── Value parsing ───────────────────────────────────────────────────────────

/** Maps free text like "New headcount" or "Backfill" to a role type; null if unrecognised. */
export function parseRoleType(raw: string): RoleType | null {
  const v = norm(raw)
  if (!v) return null
  if (/backfill|replacement/.test(v)) return 'backfill'
  if (/contract|freelanc/.test(v)) return 'contractor'
  if (/\btb[da]\b/.test(v)) return 'tbd'
  if (/\bnew\b|headcount|\bhc\b|planned|\bopen\b|\bhire\b/.test(v)) return 'new-headcount'
  if (/exist|current|filled|active|employee/.test(v)) return 'existing'
  return null
}

function statusFor(roleType: RoleType | undefined, vacant: boolean): NodeStatus {
  if (roleType === 'backfill') return 'backfill'
  if (vacant) return 'open'
  if (roleType === 'new-headcount') return 'planned'
  return 'active'
}

/** ISO dates pass through (validated); anything else is kept as the user wrote it. */
function normaliseDate(raw: string): { value: string; looksOdd: boolean } {
  const v = raw.trim()
  if (!v) return { value: '', looksOdd: false }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(v)
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
    const valid = d.getUTCFullYear() === +iso[1] && d.getUTCMonth() === +iso[2] - 1 && d.getUTCDate() === +iso[3]
    return { value: `${iso[1]}-${iso[2]}-${iso[3]}`, looksOdd: !valid }
  }
  return { value: v, looksOdd: true }
}

const PALETTE = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#64748B']

function pickColour(name: string, used: Set<string>, index: number): string {
  const known = TEMPLATE_DEPARTMENTS.find(d => d.name.toLowerCase() === name.toLowerCase())
  if (known) return known.colour
  for (let i = 0; i < PALETTE.length; i++) {
    const c = PALETTE[(index + i) % PALETTE.length]
    if (!used.has(c)) return c
  }
  return PALETTE[index % PALETTE.length]
}

// ─── The plan (dry run) ──────────────────────────────────────────────────────

interface Rec {
  row: number
  rowId: string
  name: string
  title: string
  vacant: boolean
  department: string
  managerRef: string
  email: string
  location: string
  startDate: string
  roleType: RoleType | undefined
}

export function buildImportPlan(sheet: ParsedSheet, mapping: ColumnMapping, options: ImportOptions = {}): ImportPlan {
  const issues: ImportIssue[] = []
  const issue = (row: number | null, severity: ImportIssue['severity'], message: string) =>
    issues.push({ row, severity, message })
  const cell = (r: string[], idx: number | null) => (idx === null ? '' : (r[idx] ?? '').trim())

  const empty = (): ImportPlan => ({
    nodes: [], edges: [], departments: [], issues,
    stats: { rows: 0, imported: 0, skipped: 0, vacant: 0, roots: 0, departments: 0, newDepartments: 0 },
    overLimit: null, blocked: issues.some(i => i.severity === 'error'),
  })

  if (mapping.name === null && mapping.title === null) {
    issue(null, 'error', 'Choose a Name column or a Title column.')
    return empty()
  }
  if (sheet.rows.length > MAX_IMPORT_ROWS) {
    issue(null, 'error', `This file has ${sheet.rows.length.toLocaleString()} rows. The limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import.`)
    return empty()
  }

  // 1. Read rows ------------------------------------------------------------
  const recs: Rec[] = []
  let dataRows = 0
  let skipped = 0
  sheet.rows.forEach((r, i) => {
    const row = i + 2 // header is row 1
    if (r.every(c => !c || !c.trim())) return // blank line: ignore silently
    dataRows++

    let name = cell(r, mapping.name)
    let title = cell(r, mapping.title)
    if (!name && !title) {
      skipped++
      issue(row, 'warning', 'Skipped: no name and no title.')
      return
    }
    const clip = (value: string, max: number, what: string) => {
      if (value.length <= max) return value
      issue(row, 'warning', `${what} is longer than ${max} characters and was shortened.`)
      return value.slice(0, max)
    }
    name = clip(name, NAME_MAX, 'Name')
    title = clip(title, NAME_MAX, 'Title')

    const vacant = !name
    if (!title) {
      title = FALLBACK_TITLE
      issue(row, 'warning', `No title, so "${FALLBACK_TITLE}" was used.`)
    }
    if (vacant) name = title // open roles in StratMap carry their title as the card name

    const rtRaw = cell(r, mapping.roleType)
    let roleType: RoleType | undefined
    if (rtRaw) {
      const parsed = parseRoleType(rtRaw)
      if (parsed) roleType = parsed
      else issue(row, 'warning', `Role type "${rtRaw}" not recognised, so it was left as the default.`)
    }
    if (!roleType) roleType = vacant ? 'new-headcount' : undefined

    const dateRaw = cell(r, mapping.startDate)
    const date = normaliseDate(dateRaw)
    if (dateRaw && date.looksOdd) issue(row, 'warning', `Start date "${dateRaw}" is not YYYY-MM-DD; kept as written.`)

    recs.push({
      row, rowId: cell(r, mapping.rowId), name, title, vacant,
      department: clip(cell(r, mapping.department), NAME_MAX, 'Department'),
      managerRef: cell(r, mapping.manager),
      email: cell(r, mapping.email).toLowerCase(),
      location: clip(cell(r, mapping.location), NAME_MAX, 'Location'),
      startDate: clip(date.value, DATE_MAX, 'Start date'),
      roleType,
    })
  })

  // 2. Indexes for "Reports to" ----------------------------------------------
  const byId = new Map<string, number>()
  const byEmail = new Map<string, number[]>()
  const byName = new Map<string, number[]>()
  recs.forEach((rec, i) => {
    if (rec.rowId) {
      const key = rec.rowId.toLowerCase()
      if (byId.has(key)) {
        issue(rec.row, 'error', `Duplicate ID "${rec.rowId}" (also on row ${recs[byId.get(key)!].row}).`)
      } else byId.set(key, i)
    }
    if (rec.email) byEmail.set(rec.email, [...(byEmail.get(rec.email) ?? []), i])
    // Open roles are named after their title, so they can't be found by name.
    if (!rec.vacant) byName.set(rec.name.toLowerCase(), [...(byName.get(rec.name.toLowerCase()) ?? []), i])
  })

  // 3. Resolve each manager: ID, then email, then name ------------------------
  const managerOf: (number | null)[] = recs.map(() => null)
  recs.forEach((rec, i) => {
    const ref = rec.managerRef
    if (!ref) return
    const key = ref.toLowerCase()

    let found: number | null = null
    if (byId.has(key)) found = byId.get(key)!
    else {
      const byMail = byEmail.get(key)
      const byNm = byName.get(key)
      const pool = byMail ?? byNm
      if (pool && pool.length === 1) found = pool[0]
      else if (pool && pool.length > 1) {
        const kind = byMail ? 'email' : 'name'
        issue(rec.row, 'error',
          `"${ref}" matches ${pool.length} people (rows ${pool.map(p => recs[p].row).join(', ')}). ` +
          `Add an ID column, or use ${kind === 'name' ? 'an email or ' : ''}an ID in "Reports to".`)
        return
      }
    }
    if (found === null) {
      issue(rec.row, 'error', `"Reports to" value "${ref}" doesn't match any ID, email or name in the file.`)
      return
    }
    if (found === i) {
      issue(rec.row, 'error', 'A person can\'t report to themselves.')
      return
    }
    managerOf[i] = found
  })

  // 4. Reporting loops --------------------------------------------------------
  const state = new Array<0 | 1 | 2>(recs.length).fill(0) // 0 new, 1 on this walk, 2 done
  for (let start = 0; start < recs.length; start++) {
    if (state[start] !== 0) continue
    const path: number[] = []
    let cur: number | null = start
    while (cur !== null && state[cur] === 0) {
      state[cur] = 1
      path.push(cur)
      cur = managerOf[cur]
    }
    if (cur !== null && state[cur] === 1) {
      const loop = path.slice(path.indexOf(cur))
      issue(recs[cur].row, 'error',
        `Reporting loop: ${[...loop, cur].map(p => `row ${recs[p].row}`).join(' → ')}. Someone ends up reporting to themselves.`)
      managerOf[cur] = null // break it so the preview and layout still work
    }
    path.forEach(p => { state[p] = 2 })
  }

  // 5. Departments, nodes and edges -------------------------------------------
  const deptByName = new Map<string, Department>()
  const usedColours = new Set<string>()
  const departments: Department[] = []
  const deptFor = (name: string): string => {
    if (!name) return ''
    const key = name.toLowerCase()
    let d = deptByName.get(key)
    if (!d) {
      const colour = pickColour(name, usedColours, departments.length)
      usedColours.add(colour)
      d = { id: `dept-${departments.length}`, name, colour }
      deptByName.set(key, d)
      departments.push(d)
    }
    return d.id
  }

  const ids = recs.map((_, i) => `imp-${i}`)
  const nodes: OrgNode[] = recs.map((rec, i) => ({
    id: ids[i],
    name: rec.name,
    title: rec.title,
    departmentId: deptFor(rec.department),
    managerId: managerOf[i] === null ? null : ids[managerOf[i]!],
    status: statusFor(rec.roleType, rec.vacant),
    employmentType: rec.roleType === 'contractor' ? 'contractor' : 'full-time',
    ...(rec.roleType ? { roleType: rec.roleType } : {}),
    ...(rec.location ? { location: rec.location } : {}),
    ...(rec.startDate ? { startDate: rec.startDate } : {}),
    x: 0, y: 0,
  }))
  const edges: OrgEdge[] = []
  managerOf.forEach((m, i) => {
    if (m !== null) edges.push({ id: `imp-e${i}`, sourceId: ids[m], targetId: ids[i] })
  })

  // 6. Lay the tree out -------------------------------------------------------
  const positions = calculateLayout(nodes, edges)
  let minX = Infinity, minY = Infinity
  positions.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y) })
  const origin = options.origin ?? { x: 60, y: 50 }
  for (const n of nodes) {
    const p = positions.get(n.id)
    if (p) { n.x = Math.round(p.x - minX + origin.x); n.y = Math.round(p.y - minY + origin.y) }
  }

  // 7. Plan limit: all or nothing ---------------------------------------------
  const max = options.maxNodes ?? -1
  const wouldHave = (options.existingNodeCount ?? 0) + nodes.length
  let overLimit: ImportPlan['overLimit'] = null
  if (max !== -1 && wouldHave > max) {
    overLimit = { max, wouldHave }
    const existing = options.existingNodeCount ?? 0
    issue(null, 'error',
      `This import adds ${nodes.length} role${nodes.length === 1 ? '' : 's'}` +
      (existing ? ` to a chart that already has ${existing}` : '') +
      `, but your plan allows ${max} per chart. Nothing was imported.`)
  }

  const existingDeptNames = new Set((options.existingDepartments ?? []).map(d => d.name.toLowerCase()))
  const stats: ImportStats = {
    rows: dataRows,
    imported: nodes.length,
    skipped,
    vacant: recs.filter(r => r.vacant).length,
    roots: managerOf.filter(m => m === null).length,
    departments: departments.length,
    newDepartments: departments.filter(d => !existingDeptNames.has(d.name.toLowerCase())).length,
  }
  if (nodes.length === 0 && !issues.some(i => i.severity === 'error')) {
    issue(null, 'error', 'No importable rows were found in this file.')
  }

  return {
    nodes, edges, departments, issues, stats, overLimit,
    blocked: issues.some(i => i.severity === 'error'),
  }
}

// ─── Template ────────────────────────────────────────────────────────────────

/** A starter file that shows each way of saying who reports to whom. */
export function buildTemplateCsv(): string {
  const rows = [
    ['ID', 'Name', 'Title', 'Department', 'Reports to', 'Email', 'Location', 'Start date', 'Role type'],
    ['1', 'Alex Example', 'CEO', 'Leadership', '', 'alex@example.com', 'London', '2021-03-01', 'Existing'],
    ['2', 'Sam Example', 'CTO', 'Engineering', '1', 'sam@example.com', 'London', '2022-01-10', 'Existing'],
    ['3', '', 'Software Engineer', 'Engineering', '2', '', 'Remote', '', 'New headcount'],
    ['4', 'Jo Example', 'Head of Sales', 'Go-to-Market', 'alex@example.com', 'jo@example.com', 'New York', '2023-05-15', 'Existing'],
  ]
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
