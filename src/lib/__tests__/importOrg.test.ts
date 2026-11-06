import { describe, it, expect } from 'vitest'
import {
  guessMapping, buildImportPlan, parseRoleType, buildTemplateCsv, emptyMapping,
  type ParsedSheet, type ColumnMapping,
} from '../importOrg'
import { parseCsvText, toParsedSheet, cellToText } from '../readSheetFile'

const sheet = (headers: string[], ...rows: string[][]): ParsedSheet => ({ headers, rows })
const map = (m: Partial<ColumnMapping>): ColumnMapping => ({ ...emptyMapping(), ...m })

describe('guessMapping', () => {
  it('maps common header names', () => {
    const m = guessMapping(['Employee ID', 'Full Name', 'Job Title', 'Department', 'Manager', 'Work Email', 'Office', 'Hire Date', 'Role Type'])
    expect(m).toMatchObject({ rowId: 0, name: 1, title: 2, department: 3, manager: 4, email: 5, location: 6, startDate: 7, roleType: 8 })
    expect([m.status, m.employmentType, m.x, m.y, m.departmentColour]).toEqual([null, null, null, null, null])
  })

  it('gives "Manager Email" to the manager, not to email', () => {
    const m = guessMapping(['Name', 'Title', 'Manager Email', 'Email'])
    expect(m.manager).toBe(2)
    expect(m.email).toBe(3)
  })

  it('leaves columns it cannot place unmapped and never reuses a column', () => {
    const m = guessMapping(['Foo', 'Bar'])
    expect(Object.values(m).every(v => v === null)).toBe(true)
  })

  it('matches headers that only contain a known word', () => {
    expect(guessMapping(['Job Title (Primary)', 'Full name']).title).toBe(0)
  })
})

describe('parseRoleType', () => {
  it.each([
    ['Existing', 'existing'], ['New headcount', 'new-headcount'], ['Backfill', 'backfill'],
    ['Contractor', 'contractor'], ['TBD', 'tbd'], ['open', 'new-headcount'],
  ])('%s → %s', (raw, want) => expect(parseRoleType(raw)).toBe(want))
  it('returns null for unknown or blank', () => {
    expect(parseRoleType('banana')).toBeNull()
    expect(parseRoleType('')).toBeNull()
  })
})

describe('buildImportPlan: rows', () => {
  const m = map({ name: 0, title: 1 })

  it('requires a name or title column', () => {
    const plan = buildImportPlan(sheet(['A'], ['x']), emptyMapping())
    expect(plan.blocked).toBe(true)
    expect(plan.issues[0].message).toMatch(/Name column or a Title column/)
  })

  it('imports with only a title: the role is open and named after the title', () => {
    const plan = buildImportPlan(sheet(['Name', 'Title'], ['', 'Head of Design']), m)
    expect(plan.blocked).toBe(false)
    expect(plan.nodes[0]).toMatchObject({ name: 'Head of Design', title: 'Head of Design', status: 'open', roleType: 'new-headcount' })
    expect(plan.stats.vacant).toBe(1)
  })

  it('imports with only a name: warns and uses a fallback title', () => {
    const plan = buildImportPlan(sheet(['Name', 'Title'], ['Ada Lovelace', '']), m)
    expect(plan.blocked).toBe(false)
    expect(plan.nodes[0]).toMatchObject({ name: 'Ada Lovelace', title: 'Team member', status: 'active' })
    expect(plan.issues.some(i => i.severity === 'warning' && /No title/.test(i.message))).toBe(true)
  })

  it('skips rows with neither, ignores blank lines, and numbers rows from the header', () => {
    const plan = buildImportPlan(sheet(['Name', 'Title', 'Notes'],
      ['A', 'x', ''], ['', '', 'just a note'], ['', '', ''], ['', '  ', ' '], ['B', 'y', '']), map({ name: 0, title: 1 }))
    expect(plan.nodes).toHaveLength(2)
    // blank lines don't count; the note-only row is a real row that can't be imported
    expect(plan.stats).toMatchObject({ rows: 3, imported: 2, skipped: 1 })
    expect(plan.issues.find(i => /Skipped/.test(i.message))?.row).toBe(3)
  })

  it('reports an empty file as an error', () => {
    const plan = buildImportPlan(sheet(['Name', 'Title'], ['', '']), m)
    expect(plan.blocked).toBe(true)
  })

  it('applies role type to status and employment type', () => {
    const mm = map({ name: 0, title: 1, roleType: 2 })
    const plan = buildImportPlan(sheet(['n', 't', 'r'],
      ['A', 'x', 'Backfill'], ['B', 'y', 'Contractor'], ['C', 'z', 'New headcount'], ['', 'v', 'Backfill'], ['D', 'w', 'nonsense']), mm)
    expect(plan.nodes.map(n => n.status)).toEqual(['backfill', 'active', 'planned', 'backfill', 'active'])
    expect(plan.nodes[1].employmentType).toBe('contractor')
    expect(plan.issues.some(i => /not recognised/.test(i.message))).toBe(true)
  })

  it('keeps ISO dates, warns on other formats, carries location', () => {
    const mm = map({ name: 0, title: 1, startDate: 2, location: 3 })
    const plan = buildImportPlan(sheet(['n', 't', 'd', 'l'], ['A', 'x', '2024-02-30', 'Paris'], ['B', 'y', '3/4/2024', ''], ['C', 'z', '2024-05-01', '']), mm)
    expect(plan.nodes[0]).toMatchObject({ startDate: '2024-02-30', location: 'Paris' })
    expect(plan.issues.filter(i => /Start date/.test(i.message))).toHaveLength(2) // impossible date + non-ISO
    expect(plan.nodes[2].startDate).toBe('2024-05-01')
  })

  it('shortens over-long values with a warning', () => {
    const plan = buildImportPlan(sheet(['n', 't'], ['x'.repeat(250), 'CEO']), m)
    expect(plan.nodes[0].name).toHaveLength(200)
    expect(plan.issues.some(i => /shortened/.test(i.message))).toBe(true)
  })
})

describe('buildImportPlan: reporting lines', () => {
  const m = map({ rowId: 0, name: 1, title: 2, manager: 3, email: 4 })
  const H = ['ID', 'Name', 'Title', 'Reports to', 'Email']

  it('builds the tree from IDs, emails and names, and lays it out', () => {
    const plan = buildImportPlan(sheet(H,
      ['1', 'Alex', 'CEO', '', 'alex@x.com'],
      ['2', 'Sam', 'CTO', '1', 'sam@x.com'],
      ['3', 'Jo', 'Head of Sales', 'ALEX@x.com', 'jo@x.com'],
      ['4', 'Kim', 'Engineer', 'Sam', 'kim@x.com'],
    ), m)
    expect(plan.blocked).toBe(false)
    const byName = Object.fromEntries(plan.nodes.map(n => [n.name, n]))
    expect(byName.Alex.managerId).toBeNull()
    expect(byName.Sam.managerId).toBe(byName.Alex.id)
    expect(byName.Jo.managerId).toBe(byName.Alex.id)
    expect(byName.Kim.managerId).toBe(byName.Sam.id)
    expect(plan.edges).toHaveLength(3)
    expect(plan.edges.find(e => e.targetId === byName.Kim.id)?.sourceId).toBe(byName.Sam.id)
    expect(plan.stats.roots).toBe(1)
    // laid out: reports are below their manager and nothing overlaps at the origin
    expect(byName.Sam.y).toBeGreaterThan(byName.Alex.y)
    expect(Math.min(...plan.nodes.map(n => n.x))).toBe(60)
    expect(Math.min(...plan.nodes.map(n => n.y))).toBe(50)
  })

  it('lets a vacant role be a manager through its ID', () => {
    const plan = buildImportPlan(sheet(H,
      ['1', '', 'VP Engineering', '', ''],
      ['2', 'Sam', 'Engineer', '1', ''],
    ), m)
    expect(plan.blocked).toBe(false)
    expect(plan.nodes[1].managerId).toBe(plan.nodes[0].id)
  })

  it('does not match a vacant role by its (synthetic) name', () => {
    const plan = buildImportPlan(sheet(H,
      ['1', '', 'VP Engineering', '', ''],
      ['2', 'Sam', 'Engineer', 'VP Engineering', ''],
    ), m)
    expect(plan.blocked).toBe(true)
    expect(plan.issues.find(i => i.row === 3)?.message).toMatch(/doesn't match/)
  })

  it('flags an unknown manager as an error on its row', () => {
    const plan = buildImportPlan(sheet(H, ['1', 'Alex', 'CEO', 'Nobody', '']), m)
    expect(plan.blocked).toBe(true)
    expect(plan.issues[0]).toMatchObject({ row: 2, severity: 'error' })
  })

  it('flags an ambiguous name and says how to fix it', () => {
    const plan = buildImportPlan(sheet(H,
      ['1', 'John Smith', 'A', '', ''], ['2', 'John Smith', 'B', '', ''], ['3', 'Kim', 'C', 'John Smith', '']), m)
    const err = plan.issues.find(i => i.severity === 'error')!
    expect(err.row).toBe(4)
    expect(err.message).toMatch(/matches 2 people \(rows 2, 3\)/)
    expect(err.message).toMatch(/ID/)
  })

  it('flags duplicate IDs, self-reporting and loops', () => {
    const dup = buildImportPlan(sheet(H, ['1', 'A', 'x', '', ''], ['1', 'B', 'y', '', '']), m)
    expect(dup.issues.some(i => /Duplicate ID/.test(i.message))).toBe(true)

    const self = buildImportPlan(sheet(H, ['1', 'A', 'x', '1', '']), m)
    expect(self.issues.some(i => /themselves/.test(i.message))).toBe(true)

    const loop = buildImportPlan(sheet(H, ['1', 'A', 'x', '2', ''], ['2', 'B', 'y', '1', '']), m)
    expect(loop.blocked).toBe(true)
    expect(loop.issues.filter(i => /Reporting loop/.test(i.message))).toHaveLength(1)
    expect(loop.nodes).toHaveLength(2) // still laid out for the preview
  })

  it('treats several roots as fine and counts them', () => {
    const plan = buildImportPlan(sheet(H, ['1', 'A', 'x', '', ''], ['2', 'B', 'y', '', '']), m)
    expect(plan.blocked).toBe(false)
    expect(plan.stats.roots).toBe(2)
  })
})

describe('buildImportPlan: departments', () => {
  const m = map({ name: 0, title: 1, department: 2 })

  it('creates one department per distinct name (case-insensitive) and reports new ones', () => {
    const plan = buildImportPlan(sheet(['n', 't', 'd'],
      ['A', 'x', 'Engineering'], ['B', 'y', 'engineering'], ['C', 'z', 'Legal'], ['D', 'w', '']),
      m, { existingDepartments: [{ name: 'ENGINEERING' }] })
    expect(plan.departments.map(d => d.name)).toEqual(['Engineering', 'Legal'])
    expect(plan.nodes[0].departmentId).toBe(plan.nodes[1].departmentId)
    expect(plan.nodes[3].departmentId).toBe('')
    expect(plan.stats).toMatchObject({ departments: 2, newDepartments: 1 })
    expect(new Set(plan.departments.map(d => d.colour)).size).toBe(2)
  })

  it('reuses the template colour for well-known department names', () => {
    const plan = buildImportPlan(sheet(['n', 't', 'd'], ['A', 'x', 'Engineering']), m)
    expect(plan.departments[0].colour).toBe('#0EA5E9')
  })
})

describe('buildImportPlan: plan limits and placement', () => {
  const m = map({ name: 0, title: 1 })
  const rows = Array.from({ length: 5 }, (_, i) => [`P${i}`, 'x'])

  it('blocks the whole import when it would go over the limit', () => {
    const plan = buildImportPlan(sheet(['n', 't'], ...rows), m, { maxNodes: 30, existingNodeCount: 27 })
    expect(plan.blocked).toBe(true)
    expect(plan.overLimit).toEqual({ max: 30, wouldHave: 32 })
    expect(plan.issues.find(i => i.row === null)?.message).toMatch(/allows 30 per chart.*Nothing was imported/)
  })

  it('allows exactly the limit, and unlimited plans', () => {
    expect(buildImportPlan(sheet(['n', 't'], ...rows), m, { maxNodes: 5 }).blocked).toBe(false)
    expect(buildImportPlan(sheet(['n', 't'], ...rows), m, { maxNodes: -1, existingNodeCount: 9999 }).blocked).toBe(false)
  })

  it('places the tree at the requested origin', () => {
    const plan = buildImportPlan(sheet(['n', 't'], ...rows), m, { origin: { x: 1000, y: 200 } })
    expect(Math.min(...plan.nodes.map(n => n.x))).toBe(1000)
    expect(Math.min(...plan.nodes.map(n => n.y))).toBe(200)
  })

  it('rejects files over the row cap', () => {
    const big = Array.from({ length: 5001 }, () => ['A', 'b'])
    const plan = buildImportPlan(sheet(['n', 't'], ...big), m)
    expect(plan.blocked).toBe(true)
    expect(plan.nodes).toHaveLength(0)
  })
})

describe('reading files', () => {
  it('parses CSV with quotes, a BOM and ragged rows', () => {
    const s = parseCsvText('\uFEFFName,Title,Notes\r\n"Smith, Jo",CEO,"said ""hi"""\r\nAda,CTO\r\n')
    expect(s.headers).toEqual(['Name', 'Title', 'Notes'])
    expect(s.rows).toEqual([['Smith, Jo', 'CEO', 'said "hi"'], ['Ada', 'CTO', '']])
  })

  it('skips leading blank rows and names blank headers', () => {
    const s = toParsedSheet([[], ['Name', '', 'Title'], ['A', 'x', 'y']])
    expect(s.headers).toEqual(['Name', 'Column 2', 'Title'])
  })

  it('rejects empty files and header-only files', () => {
    expect(() => parseCsvText('')).toThrow(/empty/)
    expect(() => parseCsvText('Name,Title\n')).toThrow(/no data rows/)
  })

  it('turns spreadsheet cell values into text', () => {
    expect(cellToText(new Date(Date.UTC(2024, 4, 1)))).toBe('2024-05-01')
    expect(cellToText(12)).toBe('12')
    expect(cellToText(null)).toBe('')
    expect(cellToText(true)).toBe('TRUE')
  })

  it('the template file imports cleanly and round-trips its structure', () => {
    const parsed = parseCsvText(buildTemplateCsv())
    const m = guessMapping(parsed.headers)
    expect(m).toMatchObject({ rowId: 0, name: 1, title: 2, department: 3, manager: 4, email: 5 })
    const plan = buildImportPlan(parsed, m)
    expect(plan.blocked).toBe(false)
    expect(plan.issues).toEqual([])
    expect(plan.nodes).toHaveLength(4)
    expect(plan.edges).toHaveLength(3)
    expect(plan.stats).toMatchObject({ vacant: 1, roots: 1, departments: 3 })
  })
})
