import type { OrgNode, OrgEdge, Department, RoleType, NodeStatus, EmploymentType } from '../types'
import { toCsv, type CsvCell } from './csvText'

// Roadmap 2.2: CSV export of a chart (and of the headcount plan, for finance).
//
// The chart file is also an import file: it has every column the importer reads, so
// export → import gives the same chart, including where each role sits on the canvas
// (X, Y) and each department's colour. Pure functions; the browser download is done by
// the caller.

export const CHART_CSV_HEADERS = [
  'ID', 'Name', 'Title', 'Department', 'Reports to', 'Location', 'Start date',
  'Role type', 'Status', 'Employment type', 'X', 'Y', 'Department colour',
] as const

const ROLE_TYPE_LABEL: Record<RoleType, string> = {
  existing: 'Existing', 'new-headcount': 'New headcount', backfill: 'Backfill', contractor: 'Contractor', tbd: 'TBD',
}
const STATUS_LABEL: Record<NodeStatus, string> = { active: 'Active', open: 'Open', planned: 'Planned', backfill: 'Backfill' }
const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  'full-time': 'Full-time', 'part-time': 'Part-time', contractor: 'Contractor', advisor: 'Advisor',
}

export interface ChartExportInput {
  nodes: OrgNode[]
  edges: OrgEdge[]
  departments: Department[]
}

export interface ChartExport {
  csv: string
  rows: number
  /** Roles with more than one connected manager; a CSV cell holds one, so the first is exported. */
  multiManager: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Roles with no name of their own (open roles are named after their title) export a blank Name. */
function isUnfilled(n: OrgNode): boolean {
  return n.name === n.title && (n.status === 'open' || n.status === 'planned' || n.status === 'backfill')
}

export function buildChartCsv(input: ChartExportInput): ChartExport {
  const { rows, multiManager } = chartRows(input)
  return { csv: toCsv([[...CHART_CSV_HEADERS], ...rows]), rows: rows.length, multiManager }
}

/**
 * Every role of every chart in one file (workspace export, roadmap 4.2): the chart file's columns with the chart's name
 * in front. Role numbers (ID, Reports to) are prefixed with the chart's position (1-3, 2-1...) so they stay unique, which
 * also lets the importer read the whole file as one chart with every reporting line intact.
 */
export function buildWorkspaceRolesCsv(charts: (ChartExportInput & { name: string })[]): { csv: string; rows: number } {
  const out: CsvCell[][] = [['Chart', ...CHART_CSV_HEADERS]]
  charts.forEach((chart, i) => {
    for (const row of chartRows(chart).rows) {
      const cells = [...row]
      cells[0] = `${i + 1}-${cells[0]}`
      if (cells[4] !== '') cells[4] = `${i + 1}-${cells[4]}`
      out.push([chart.name, ...cells])
    }
  })
  return { csv: toCsv(out), rows: out.length - 1 }
}

function chartRows({ nodes, edges, departments }: ChartExportInput): { rows: CsvCell[][]; multiManager: number } {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const deptById = new Map(departments.map(d => [d.id, d]))

  // Reporting lines are the connections drawn on the canvas.
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const e of edges) {
    if (!byId.has(e.sourceId) || !byId.has(e.targetId) || e.sourceId === e.targetId) continue
    if (parents.get(e.targetId)?.includes(e.sourceId)) continue // duplicate line
    parents.set(e.targetId, [...(parents.get(e.targetId) ?? []), e.sourceId])
    children.set(e.sourceId, [...(children.get(e.sourceId) ?? []), e.targetId])
  }

  // Top to bottom, left to right, so the file reads like the chart and IDs follow it.
  const order = (a: string, b: string) => {
    const na = byId.get(a)!, nb = byId.get(b)!
    return na.x - nb.x || na.y - nb.y || na.name.localeCompare(nb.name)
  }
  for (const list of children.values()) list.sort(order)

  const emitted: { id: string; parent: string | null }[] = []
  const seen = new Set<string>()
  const walk = (id: string, parent: string | null) => {
    if (seen.has(id)) return
    seen.add(id)
    emitted.push({ id, parent })
    for (const c of children.get(id) ?? []) walk(c, id)
  }
  nodes.map(n => n.id).filter(id => !parents.has(id)).sort(order).forEach(id => walk(id, null))
  // Anything left is in a loop with no top: start from each, with no manager.
  nodes.map(n => n.id).filter(id => !seen.has(id)).sort(order).forEach(id => walk(id, null))

  const rowId = new Map(emitted.map((e, i) => [e.id, String(i + 1)]))
  const multiManager = [...parents.values()].filter(p => p.length > 1).length

  const rows: CsvCell[][] = []
  for (const { id, parent } of emitted) {
    const n = byId.get(id)!
    const dept = n.departmentId ? deptById.get(n.departmentId) : undefined
    rows.push([
      rowId.get(id)!,
      isUnfilled(n) ? '' : n.name,
      n.title,
      dept?.name ?? '',
      parent ? rowId.get(parent)! : '',
      n.location ?? '',
      n.startDate ?? '',
      n.roleType ? ROLE_TYPE_LABEL[n.roleType] : '',
      STATUS_LABEL[n.status] ?? '',
      EMPLOYMENT_LABEL[n.employmentType] ?? '',
      round2(n.x),
      round2(n.y),
      dept?.colour ?? '',
    ])
  }
  return { rows, multiManager }
}

// ─── Headcount plan ──────────────────────────────────────────────────────────

export const HEADCOUNT_CSV_HEADERS = ['Title', 'Department', 'Role type', 'Target quarter', 'Status', 'Chart', 'Notes'] as const

export interface HeadcountExportPlan {
  title: string
  departmentName: string | null
  roleType: RoleType
  targetQuarter: string
  status: string
  chartId: string | null
  notes: string | null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** For finance: one row per planned role, sorted by target quarter. */
export function buildHeadcountCsv(plans: HeadcountExportPlan[], chartName: (id: string) => string | undefined): { csv: string; rows: number } {
  const sorted = [...plans].sort((a, b) => a.targetQuarter.localeCompare(b.targetQuarter) || a.title.localeCompare(b.title))
  const rows: CsvCell[][] = [[...HEADCOUNT_CSV_HEADERS]]
  for (const p of sorted) {
    rows.push([
      p.title,
      p.departmentName ?? '',
      ROLE_TYPE_LABEL[p.roleType] ?? p.roleType,
      p.targetQuarter,
      cap(p.status),
      (p.chartId && chartName(p.chartId)) || '',
      p.notes ?? '',
    ])
  }
  return { csv: toCsv(rows), rows: sorted.length }
}
