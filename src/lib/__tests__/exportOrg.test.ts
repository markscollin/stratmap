import { describe, it, expect } from 'vitest'
import { buildChartCsv, buildHeadcountCsv, CHART_CSV_HEADERS } from '../exportOrg'
import { guardCell, unguardCell, toCsv, fileSlug } from '../csvSafe'
import { guessMapping, buildImportPlan, emptyMapping, parseStatus, parseEmployment, type ParsedSheet } from '../importOrg'
import { parseCsvText } from '../readSheetFile'
import type { OrgNode, OrgEdge, Department } from '../../types'

const node = (id: string, extra: Partial<OrgNode> = {}): OrgNode => ({
  id, name: `Person ${id}`, title: `Title ${id}`, departmentId: '', managerId: null,
  status: 'active', employmentType: 'full-time', x: 0, y: 0, ...extra,
})
const edge = (s: string, t: string): OrgEdge => ({ id: `${s}>${t}`, sourceId: s, targetId: t })
const sheet = (csv: string): ParsedSheet => parseCsvText(csv)

describe('csvSafe', () => {
  it('guards text that a spreadsheet would run as a formula, and undoes it', () => {
    for (const v of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(guardCell(v)).toBe(`'${v}`)
      expect(unguardCell(guardCell(v))).toBe(v)
    }
    expect(guardCell('Alex')).toBe('Alex')
    expect(unguardCell("it's fine")).toBe("it's fine")
    expect(unguardCell("'quoted")).toBe("'quoted") // only guarded formula starts are undone
  })

  it('writes CRLF rows with a BOM, quotes where needed, guards text but not numbers or the header', () => {
    const csv = toCsv([['=Header', 'B'], ['=evil()', -5], ['a,b', 'say "hi"'], ['line\nbreak', 1.5]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1)).toBe('=Header,B\r\n\'=evil(),-5\r\n"a,b","say ""hi"""\r\n"line\nbreak",1.5\r\n')
    expect(toCsv([['a']], { bom: false })).toBe('a\r\n')
  })

  it('makes safe file names', () => {
    expect(fileSlug('Q4 People Plan / Final!')).toBe('q4-people-plan-final')
    expect(fileSlug('Ünïcode')).toBe('unicode')
    expect(fileSlug('???', 'chart')).toBe('chart')
  })
})

describe('buildChartCsv', () => {
  const depts: Department[] = [
    { id: 'd1', name: 'Engineering', colour: '#0EA5E9' },
    { id: 'd2', name: 'Go-to-Market', colour: '#F59E0B' },
  ]

  it('exports every import column, in reading order, with IDs that follow the tree', () => {
    const nodes = [
      node('c', { x: 300, y: 200, departmentId: 'd2' }),
      node('a', { x: 100, y: 0, departmentId: 'd1' }),
      node('b', { x: 50, y: 200, departmentId: 'd1' }),
    ]
    const { csv, rows } = buildChartCsv({ nodes, edges: [edge('a', 'c'), edge('a', 'b')], departments: depts })
    const sheet = parseCsvText(csv)
    expect(sheet.headers).toEqual([...CHART_CSV_HEADERS])
    expect(rows).toBe(3)
    // a first, then its reports left to right (b at x=50, then c at x=300)
    expect(sheet.rows.map(r => r[1])).toEqual(['Person a', 'Person b', 'Person c'])
    expect(sheet.rows.map(r => r[0])).toEqual(['1', '2', '3'])
    expect(sheet.rows.map(r => r[4])).toEqual(['', '1', '1'])
    expect(sheet.rows[1].slice(10)).toEqual(['50', '200', '#0EA5E9'])
  })

  it('reads reporting lines from the drawn connections, not the stored manager', () => {
    const nodes = [node('a'), node('b', { managerId: 'a' }), node('c', { managerId: null })]
    const { csv } = buildChartCsv({ nodes, edges: [edge('c', 'b')], departments: [] })
    const rows = parseCsvText(csv).rows
    const idOf = (name: string) => rows.find(r => r[1] === name)![0]
    expect(rows.find(r => r[1] === 'Person b')![4]).toBe(idOf('Person c'))
    expect(rows.find(r => r[1] === 'Person a')![4]).toBe('') // stored manager ignored
  })

  it('leaves the name blank for unfilled roles named after their title, but not for people', () => {
    const nodes = [
      node('a', { name: 'VP Eng', title: 'VP Eng', status: 'open', roleType: 'new-headcount' }),
      node('b', { name: 'Same', title: 'Same', status: 'active' }),                // a person who happens to match
      node('c', { name: 'Jo Planner', title: 'Analyst', status: 'planned' }),      // named planned hire
    ]
    const rows = parseCsvText(buildChartCsv({ nodes, edges: [], departments: [] }).csv).rows
    const byTitle = Object.fromEntries(rows.map(r => [r[2], r]))
    expect(byTitle['VP Eng'][1]).toBe('')
    expect(byTitle['Same'][1]).toBe('Same')
    expect(byTitle['Analyst'][1]).toBe('Jo Planner')
  })

  it('exports the first manager and counts roles with several', () => {
    const nodes = [node('a', { x: 0 }), node('b', { x: 100 }), node('c', { x: 50, y: 200 })]
    const out = buildChartCsv({ nodes, edges: [edge('a', 'c'), edge('b', 'c')], departments: [] })
    expect(out.multiManager).toBe(1)
    const rows = parseCsvText(out.csv).rows
    expect(rows.find(r => r[1] === 'Person c')![4]).toBe(rows.find(r => r[1] === 'Person a')![0])
  })

  it('ignores broken or duplicate connections and survives loops', () => {
    const nodes = [node('a'), node('b', { x: 10 })]
    const out = buildChartCsv({
      nodes, departments: [],
      edges: [edge('a', 'b'), edge('a', 'b'), edge('a', 'a'), edge('ghost', 'b'), edge('b', 'a')], // a<->b loop
    })
    expect(out.rows).toBe(2)
    expect(out.multiManager).toBe(0)
  })

  it('guards formula-looking text', () => {
    const { csv } = buildChartCsv({ nodes: [node('a', { name: '=HYPERLINK("x")', title: '-cmd', location: '@home' })], edges: [], departments: [] })
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain("'-cmd")
    expect(csv).toContain("'@home")
  })

  it('exports an empty chart as just a header', () => {
    const out = buildChartCsv({ nodes: [], edges: [], departments: [] })
    expect(out.rows).toBe(0)
    expect(out.csv.trim().split('\r\n')).toHaveLength(1)
  })
})

describe('round trip: export → import gives the same chart', () => {
  const depts: Department[] = [
    { id: 'd1', name: 'Engineering', colour: '#0EA5E9' },
    { id: 'd2', name: 'Go-to-Market', colour: '#123ABC' },
  ]
  const nodes: OrgNode[] = [
    node('ceo',  { name: 'Alex Example', title: 'CEO', x: 400.5, y: 0, startDate: '2020-01-02', location: 'London' }),
    node('cto',  { name: 'Sam, "The CTO"', title: 'CTO', x: 100, y: 180, departmentId: 'd1', roleType: 'existing' }),
    node('vp',   { name: 'VP Sales', title: 'VP Sales', x: 700, y: 180, departmentId: 'd2', status: 'open', roleType: 'new-headcount' }),
    node('eng',  { name: 'Kim Dev', title: 'Engineer', x: -50, y: 360, departmentId: 'd1', employmentType: 'part-time' }),
    node('con',  { name: 'Lee Contract', title: 'Contractor', x: 250.25, y: 360, departmentId: 'd1', roleType: 'contractor', employmentType: 'contractor' }),
    node('plan', { name: 'Analyst', title: 'Analyst', x: 700, y: 360, departmentId: 'd2', status: 'planned', roleType: 'new-headcount' }),
    node('back', { name: 'Support', title: 'Support', x: 900, y: 360, status: 'backfill', roleType: 'backfill' }),
    node('adv',  { name: 'Pat Advisor', title: 'Advisor', x: 1100, y: 180, employmentType: 'advisor' }),
    node('evil', { name: '=SUM(A1)', title: '-dash', x: 0, y: 540 }),
    node('solo', { name: 'Solo', title: 'Solo', x: 1500, y: 0 }),
  ]
  const edges = [
    edge('ceo', 'cto'), edge('ceo', 'vp'), edge('ceo', 'adv'),
    edge('cto', 'eng'), edge('cto', 'con'), edge('vp', 'plan'), edge('vp', 'back'), edge('eng', 'evil'),
  ]

  /** What makes a role itself, independent of ids. */
  function describeChart(ns: OrgNode[], es: OrgEdge[], ds: Department[]) {
    const label = (n: OrgNode) => `${n.title}|${n.name}`
    const byId = new Map(ns.map(n => [n.id, n]))
    const dept = new Map(ds.map(d => [d.id, d]))
    return {
      nodes: ns.map(n => ({
        key: label(n), title: n.title, name: n.name, status: n.status, employmentType: n.employmentType,
        roleType: n.roleType ?? null, location: n.location ?? null, startDate: n.startDate ?? null, x: n.x, y: n.y,
        department: n.departmentId ? dept.get(n.departmentId)?.name ?? null : null,
        colour: n.departmentId ? dept.get(n.departmentId)?.colour ?? null : null,
      })).sort((a, b) => a.key.localeCompare(b.key)),
      lines: es.map(e => `${label(byId.get(e.sourceId)!)} -> ${label(byId.get(e.targetId)!)}`).sort(),
    }
  }

  function reimport(csv: string, origin?: { x: number; y: number }) {
    const parsed = sheet(csv)
    return buildImportPlan(parsed, guessMapping(parsed.headers), { origin })
  }

  it('keeps people, open roles, departments, colours, formatting, reporting lines and positions', () => {
    const { csv } = buildChartCsv({ nodes, edges, departments: depts })
    const plan = reimport(csv)
    expect(plan.issues).toEqual([])
    expect(plan.layout).toBe('file')
    const got = describeChart(plan.nodes, plan.edges, plan.departments)
    const want = describeChart(nodes, edges, depts)
    expect(got.lines).toEqual(want.lines)
    expect(got.nodes).toEqual(want.nodes)
  })

  it('a second round gives the byte-identical file', () => {
    const first = buildChartCsv({ nodes, edges, departments: depts })
    const plan = reimport(first.csv)
    const second = buildChartCsv({ nodes: plan.nodes, edges: plan.edges, departments: plan.departments })
    expect(second.csv).toBe(first.csv)
  })

  it('moving it into another chart keeps the shape, relative to the origin', () => {
    const { csv } = buildChartCsv({ nodes, edges, departments: depts })
    const plan = reimport(csv, { x: 2000, y: 100 })
    const src = describeChart(nodes, edges, depts).nodes
    const got = describeChart(plan.nodes, plan.edges, plan.departments).nodes
    const minX = Math.min(...src.map(n => n.x)), minY = Math.min(...src.map(n => n.y))
    got.forEach((g, i) => {
      expect(g.x).toBeCloseTo(src[i].x - minX + 2000, 2)
      expect(g.y).toBeCloseTo(src[i].y - minY + 100, 2)
    })
  })

  it('documents the one difference: an open role with no role type comes back as new headcount', () => {
    const open = node('o', { name: 'Open', title: 'Open', status: 'open' }) // roleType undefined
    const plan = reimport(buildChartCsv({ nodes: [open], edges: [], departments: [] }).csv)
    expect(plan.nodes[0]).toMatchObject({ status: 'open', roleType: 'new-headcount' })
  })
})

describe('import: the new columns', () => {
  const H = 'Name,Title,Status,Employment type,X,Y,Department,Department colour\n'

  it('guesses them from header names without stealing other columns', () => {
    const m = guessMapping(['Name', 'Title', 'Department', 'Department colour', 'Employment type (FT/PT)', 'Role type', 'Status', 'X', 'Y'])
    expect(m).toMatchObject({ department: 2, departmentColour: 3, employmentType: 4, roleType: 5, status: 6, x: 7, y: 8 })
    const m2 = guessMapping(['Name', 'Title', 'Department Colour', 'Employment Type'])
    expect(m2.department).toBeNull()
    expect(m2.roleType).toBeNull()
    expect(m2).toMatchObject({ departmentColour: 2, employmentType: 3 })
  })

  it('uses an explicit status and employment type over the derived ones, and warns on unknown values', () => {
    const s = sheet(H + 'A,x,Planned,Part-time,,,,\nB,y,banana,pt?,,,,\n')
    const plan = buildImportPlan(s, guessMapping(s.headers))
    expect(plan.nodes[0]).toMatchObject({ status: 'planned', employmentType: 'part-time' })
    expect(plan.nodes[1]).toMatchObject({ status: 'active', employmentType: 'full-time' })
    expect(plan.issues.filter(i => /not recognised/.test(i.message))).toHaveLength(2)
    expect(parseStatus('Vacant')).toBe('open')
    expect(parseEmployment('Freelance')).toBe('contractor')
  })

  it('uses X and Y exactly when every role has them, and lays out otherwise', () => {
    const all = sheet(H + 'A,x,,,10.5,-20,,\nB,y,,,300,40,,\n')
    const p1 = buildImportPlan(all, guessMapping(all.headers))
    expect(p1.layout).toBe('file')
    expect(p1.nodes.map(n => [n.x, n.y])).toEqual([[10.5, -20], [300, 40]])

    const some = sheet(H + 'A,x,,,10,20,,\nB,y,,,,,,\n')
    const p2 = buildImportPlan(some, guessMapping(some.headers))
    expect(p2.layout).toBe('auto')
    expect(p2.issues.find(i => i.row === null)?.message).toMatch(/Only 1 of 2 roles have both X and Y/)

    const none = sheet(H + 'A,x,,,,,,\n')
    const p3 = buildImportPlan(none, guessMapping(none.headers))
    expect(p3.layout).toBe('auto')
    expect(p3.issues.filter(i => i.row === null)).toEqual([]) // nothing to warn about
  })

  it('ignores X/Y that are not numbers, with a warning on the row', () => {
    const s = sheet(H + 'A,x,,,abc,5,,\n')
    const plan = buildImportPlan(s, guessMapping(s.headers))
    expect(plan.layout).toBe('auto')
    expect(plan.issues.some(i => i.row === 2 && /X position "abc"/.test(i.message))).toBe(true)
  })

  it('takes department colours from the file (first one wins) and ignores invalid ones', () => {
    const s = sheet(H + 'A,x,,,,,Eng,#112233\nB,y,,,,,eng,#445566\nC,z,,,,,Ops,red\n')
    const plan = buildImportPlan(s, guessMapping(s.headers))
    expect(plan.departments.find(d => d.name === 'Eng')!.colour).toBe('#112233')
    const ops = plan.departments.find(d => d.name === 'Ops')!
    expect(ops.colour).toMatch(/^#/) // fell back to a palette colour
    expect(plan.issues.some(i => i.row === 4 && /not a hex colour/.test(i.message))).toBe(true)
  })

  it('removes the formula guard from imported text', () => {
    const s = sheet("Name,Title\n'=SUM(A1),'-dash\n")
    const plan = buildImportPlan(s, guessMapping(s.headers))
    expect(plan.nodes[0]).toMatchObject({ name: '=SUM(A1)', title: '-dash' })
  })

  it('existing import files without the new columns still work', () => {
    const plan = buildImportPlan(sheet('Name,Title\nA,x\n'), { ...emptyMapping(), name: 0, title: 1 })
    expect(plan.blocked).toBe(false)
    expect(plan.layout).toBe('auto')
  })
})

describe('buildHeadcountCsv', () => {
  const plans = [
    { title: 'Staff Engineer', departmentName: 'Engineering', roleType: 'new-headcount' as const, targetQuarter: '2027-Q1', status: 'planned', chartId: 'c1', notes: 'Replaces =legacy' },
    { title: 'Designer', departmentName: null, roleType: 'backfill' as const, targetQuarter: '2026-Q4', status: 'approved', chartId: null, notes: null },
    { title: 'Analyst', departmentName: 'Finance', roleType: 'new-headcount' as const, targetQuarter: '2026-Q4', status: 'filled', chartId: 'gone', notes: 'a, "b"' },
  ]

  it('exports one row per plan for finance, sorted by quarter then title', () => {
    const { csv, rows } = buildHeadcountCsv(plans, id => (id === 'c1' ? 'Main chart' : undefined))
    expect(rows).toBe(3)
    const s = parseCsvText(csv)
    expect(s.headers).toEqual(['Title', 'Department', 'Role type', 'Target quarter', 'Status', 'Chart', 'Notes'])
    expect(s.rows.map(r => r[0])).toEqual(['Analyst', 'Designer', 'Staff Engineer'])
    expect(s.rows[1]).toEqual(['Designer', '', 'Backfill', '2026-Q4', 'Approved', '', ''])
    expect(s.rows[0][5]).toBe('') // a chart that no longer exists
    expect(s.rows[0][6]).toBe('a, "b"')
    expect(s.rows[2]).toEqual(['Staff Engineer', 'Engineering', 'New headcount', '2027-Q1', 'Planned', 'Main chart', 'Replaces =legacy'])
  })

  it('guards formula-looking notes', () => {
    const { csv } = buildHeadcountCsv([{ ...plans[0], notes: '=1+1' }], () => undefined)
    expect(csv).toContain("'=1+1")
  })
})
