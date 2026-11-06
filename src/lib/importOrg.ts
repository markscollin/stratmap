import type { OrgNode, OrgEdge, Department, RoleType, NodeStatus, EmploymentType } from '../types'
import { calculateLayout } from '../utils/layout'
import { TEMPLATE_DEPARTMENTS } from './chartTemplates'
import { unguardCell, toCsv } from './csvSafe'

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
  | 'status' | 'employmentType' | 'x' | 'y' | 'departmentColour'

export interface ImportFieldInfo {
  field: ImportField
  label: string
  hint: string
  /** Shown under "Layout and formatting" in the mapping step. Files exported from StratMap carry these. */
  advanced?: boolean
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
  { field: 'status',     label: 'Status',      hint: 'Optional: active, open, planned or backfill.', advanced: true },
  { field: 'employmentType', label: 'Employment type', hint: 'Optional: full-time, part-time, contractor or advisor.', advanced: true },
  { field: 'x',          label: 'X position',  hint: 'Optional. With Y, keeps the chart\'s shape. Otherwise the tree is laid out for you.', advanced: true },
  { field: 'y',          label: 'Y position',  hint: 'Optional. Use with X.', advanced: true },
  { field: 'departmentColour', label: 'Department colour', hint: 'Optional: a hex colour such as #0EA5E9.', advanced: true },
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
  /**
   * Top-left corner for the tree. A laid-out tree always starts here (default 60, 50).
   * Positions from X/Y columns are kept exactly unless an origin is given, in which
   * case the whole shape is moved there.
   */
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
  /** "file": positions came from the X and Y columns. "auto": the tree was laid out. */
  layout: 'file' | 'auto'
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
  status:     ['status', 'role status', 'node status'],
  employmentType: ['employment type', 'employment', 'contract type', 'worker type'],
  x:          ['x', 'x position', 'pos x', 'position x'],
  y:          ['y', 'y position', 'pos y', 'position y'],
  departmentColour: ['department colour', 'department color', 'dept colour', 'dept color', 'colour', 'color'],
}

// "manager" must claim its columns before "name"/"email" can match "Manager Name".
const GUESS_ORDER: ImportField[] = [
  'rowId', 'manager', 'email', 'name', 'title', 'departmentColour', 'department', 'location', 'startDate',
  'roleType', 'status', 'employmentType', 'x', 'y',
]

export function emptyMapping(): ColumnMapping {
  return {
    rowId: null, name: null, title: null, department: null, manager: null, email: null, location: null, startDate: null, roleType: null,
    status: null, employmentType: null, x: null, y: null, departmentColour: null,
  }
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
        // "Department colour" is not the department, "Employment type" is not the role type.
        if (field !== 'departmentColour' && /colou?r/.test(h)) return false
        if (field === 'roleType' && /employ/.test(h)) return false
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

/** Maps free text like "Open" or "Planned" to a node status; null if unrecognised. */
export function parseStatus(raw: string): NodeStatus | null {
  const v = norm(raw)
  if (!v) return null
  if (/backfill/.test(v)) return 'backfill'
  if (/open|vacant/.test(v)) return 'open'
  if (/plan/.test(v)) return 'planned'
  if (/active|filled|current|employed/.test(v)) return 'active'
  return null
}

/** Maps free text like "Full-time" to an employment type; null if unrecognised. */
export function parseEmployment(raw: string): EmploymentType | null {
  const v = norm(raw)
  if (!v) return null
  if (/part/.test(v)) return 'part-time'
  if (/contract|freelanc/.test(v)) return 'contractor'
  if (/advis/.test(v)) return 'advisor'
  if (/full/.test(v)) return 'full-time'
  return null
}

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const COORD_MAX = 1_000_000

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
  /** Explicit status from the file; otherwise derived from role type and whether the role has a name. */
  status: NodeStatus | undefined
  employmentType: EmploymentType | undefined
  x: number | null
  y: number | null
  colour: string
}

export function buildImportPlan(sheet: ParsedSheet, mapping: ColumnMapping, options: ImportOptions = {}): ImportPlan {
  const issues: ImportIssue[] = []
  const issue = (row: number | null, severity: ImportIssue['severity'], message: string) =>
    issues.push({ row, severity, message })
  const cell = (r: string[], idx: number | null) => (idx === null ? '' : unguardCell((r[idx] ?? '').trim()))

  const empty = (): ImportPlan => ({
    nodes: [], edges: [], departments: [], issues,
    stats: { rows: 0, imported: 0, skipped: 0, vacant: 0, roots: 0, departments: 0, newDepartments: 0 },
    overLimit: null, blocked: issues.some(i => i.severity === 'error'), layout: 'auto',
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

    const statusRaw = cell(r, mapping.status)
    const status = statusRaw ? parseStatus(statusRaw) ?? undefined : undefined
    if (statusRaw && !status) issue(row, 'warning', `Status "${statusRaw}" not recognised, so it was worked out from the role type.`)

    const empRaw = cell(r, mapping.employmentType)
    const employmentType = empRaw ? parseEmployment(empRaw) ?? undefined : undefined
    if (empRaw && !employmentType) issue(row, 'warning', `Employment type "${empRaw}" not recognised, so it was left as full-time.`)

    const coord = (idx: number | null, label: string): number | null => {
      const raw = cell(r, idx)
      if (!raw) return null
      const n = Number(raw)
      if (!Number.isFinite(n) || Math.abs(n) > COORD_MAX) {
        issue(row, 'warning', `${label} "${raw}" is not a usable number.`)
        return null
      }
      return n
    }
    const x = coord(mapping.x, 'X position')
    const y = coord(mapping.y, 'Y position')

    const colourRaw = cell(r, mapping.departmentColour)
    const colour = HEX_COLOUR.test(colourRaw) ? colourRaw : ''
    if (colourRaw && !colour) issue(row, 'warning', `Department colour "${colourRaw}" is not a hex colour like #0EA5E9, so it was ignored.`)

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
      roleType, status, employmentType, x, y, colour,
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
  // The first colour given in the file for a department wins.
  const fileColour = new Map<string, string>()
  for (const rec of recs) {
    const key = rec.department.toLowerCase()
    if (rec.department && rec.colour && !fileColour.has(key)) fileColour.set(key, rec.colour)
  }
  const deptFor = (name: string): string => {
    if (!name) return ''
    const key = name.toLowerCase()
    let d = deptByName.get(key)
    if (!d) {
      const colour = fileColour.get(key) ?? pickColour(name, usedColours, departments.length)
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
    status: rec.status ?? statusFor(rec.roleType, rec.vacant),
    employmentType: rec.employmentType ?? (rec.roleType === 'contractor' ? 'contractor' : 'full-time'),
    ...(rec.roleType ? { roleType: rec.roleType } : {}),
    ...(rec.location ? { location: rec.location } : {}),
    ...(rec.startDate ? { startDate: rec.startDate } : {}),
    x: 0, y: 0,
  }))
  const edges: OrgEdge[] = []
  managerOf.forEach((m, i) => {
    if (m !== null) edges.push({ id: `imp-e${i}`, sourceId: ids[m], targetId: ids[i] })
  })

  // 6. Positions: from the file when every role has X and Y, else laid out ----
  const given = recs.filter(r => r.x !== null && r.y !== null).length
  const useFile = mapping.x !== null && mapping.y !== null && recs.length > 0 && given === recs.length
  if (mapping.x !== null && mapping.y !== null && given > 0 && !useFile) {
    issue(null, 'warning', `Only ${given} of ${recs.length} roles have both X and Y, so the positions were ignored and the chart was laid out automatically.`)
  }
  if (useFile) {
    nodes.forEach((n, i) => { n.x = recs[i].x!; n.y = recs[i].y! })
    if (options.origin) {
      const dx = options.origin.x - Math.min(...nodes.map(n => n.x))
      const dy = options.origin.y - Math.min(...nodes.map(n => n.y))
      for (const n of nodes) { n.x = Math.round((n.x + dx) * 100) / 100; n.y = Math.round((n.y + dy) * 100) / 100 }
    }
  } else {
    const positions = calculateLayout(nodes, edges)
    let minX = Infinity, minY = Infinity
    positions.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y) })
    const origin = options.origin ?? { x: 60, y: 50 }
    for (const n of nodes) {
      const p = positions.get(n.id)
      if (p) { n.x = Math.round(p.x - minX + origin.x); n.y = Math.round(p.y - minY + origin.y) }
    }
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
    layout: useFile ? 'file' : 'auto',
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
  return toCsv(rows)
}
