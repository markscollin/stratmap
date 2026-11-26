import { describe, it, expect } from 'vitest'
import { buildUpdatePlan, type UpdateCurrent } from '../updateFromFile'
import { guessMapping, type ParsedSheet } from '../importOrg'
import { parseCsvText } from '../readSheetFile'
import type { OrgNode, OrgEdge } from '../../types'

const node = (id: string, extra: Partial<OrgNode> = {}): OrgNode => ({
  id, name: `Person ${id}`, title: `Title ${id}`, departmentId: '', managerId: null,
  status: 'active', employmentType: 'full-time', x: 0, y: 0, ...extra,
})
const edge = (s: string, t: string, id = `e-${s}-${t}`): OrgEdge => ({ id, sourceId: s, targetId: t })
const sheet = (csv: string): ParsedSheet => parseCsvText(csv)

let seq = 0
const ids = () => { seq = 0; return (p: string) => `${p}-new${++seq}` }

function plan(csv: string, current: UpdateCurrent, opts: Parameters<typeof buildUpdatePlan>[3] = {}) {
  const s = sheet(csv)
  return buildUpdatePlan(s, guessMapping(s.headers), current, { newId: ids(), ...opts })
}

// A small chart that came from a file: Ada runs it, Bo and Cy report to her.
const chart = (): UpdateCurrent => ({
  nodes: [
    node('a', { name: 'Ada', title: 'CEO', externalId: '1', email: 'ada@x.com', departmentId: 'd-lead', x: 300, y: 0 }),
    node('b', { name: 'Bo', title: 'CTO', externalId: '2', departmentId: 'd-eng', x: 100, y: 200 }),
    node('c', { name: 'Cy', title: 'Engineer', externalId: '3', departmentId: 'd-eng', location: 'London', x: 500, y: 200 }),
  ],
  edges: [edge('a', 'b'), edge('a', 'c')],
  departments: [{ id: 'd-lead', name: 'Leadership', colour: '#000000' }, { id: 'd-eng', name: 'Engineering', colour: '#111111' }],
})

const HEAD = 'ID,Name,Title,Department,Reports to,Email,Location'

describe('buildUpdatePlan: matching', () => {
  it('the same file again changes nothing', () => {
    const p = plan(`${HEAD}\n1,Ada,CEO,Leadership,,ada@x.com,\n2,Bo,CTO,Engineering,1,,\n3,Cy,Engineer,Engineering,1,,London`, chart())
    expect(p.blocked).toBe(false)
    expect(p.hasChanges).toBe(false)
    expect(p.unchanged).toBe(3)
    expect(p.matchedBy).toEqual({ id: 3, email: 0, name: 0 })
    expect(p.result.nodes.map(n => [n.id, n.x, n.y])).toEqual([['a', 300, 0], ['b', 100, 200], ['c', 500, 200]])
    expect(p.result.edges).toEqual(chart().edges)
  })

  it('matches by ID, then email, then a unique name for roles that have no key yet', () => {
    const current = chart()
    current.nodes[0].externalId = null // Ada has only her email
    current.nodes.push(node('d', { name: 'Di', title: 'Designer' })) // made by hand: no key
    const p = plan(`ID,Name,Title,Email\n91,Ada,CEO,ADA@x.com\n2,Bo,CTO,\n3,Cy,Engineer,\n77,Di,Designer,`, current)
    expect(p.matchedBy).toEqual({ id: 2, email: 1, name: 1 })
    expect(p.joiners).toEqual([])
    // The keys are stored, so the next update matches by ID.
    expect(p.result.nodes.find(n => n.id === 'a')).toMatchObject({ externalId: '91', email: 'ada@x.com' })
    expect(p.result.nodes.find(n => n.id === 'd')).toMatchObject({ externalId: '77' })
  })

  it('never matches by a name that two roles share', () => {
    const current: UpdateCurrent = { nodes: [node('a', { name: 'Sam' }), node('b', { name: 'Sam' })], edges: [], departments: [] }
    const p = plan('Name,Title\nSam,Title a', current)
    expect(p.matchedBy.name).toBe(0)
    expect(p.joiners).toHaveLength(1)
    expect(p.leavers.map(l => l.id)).toEqual(['a', 'b'])
  })

  it('refuses two rows that land on the same role', () => {
    const p = plan('ID,Name,Title,Email\n1,Ada,CEO,\n9,Ada Two,CEO,ada@x.com', chart())
    expect(p.blocked).toBe(true)
    expect(p.issues.map(i => i.message).join()).toMatch(/Two rows in the file match the same role, Ada/)
  })

  it('a file the importer refuses is refused, with its errors', () => {
    const p = plan('ID,Name,Title,Reports to\n1,Ada,CEO,99', chart())
    expect(p.blocked).toBe(true)
    expect(p.issues[0].message).toMatch(/doesn't match any ID/)
    expect(p.result.nodes).toEqual(chart().nodes)
  })
})

describe('buildUpdatePlan: what changes', () => {
  it('finds joiners, leavers, moves and field changes', () => {
    const csv = `${HEAD}\n1,Ada,CEO,Leadership,,ada@x.com,\n2,Bo,Chief Technology Officer,Engineering,1,,\n4,Eve,Engineer,Platform,2,eve@x.com,Paris`
    const p = plan(csv, chart())
    expect(p.blocked).toBe(false)
    expect(p.joiners).toEqual([{ id: 'n-new1', label: 'Eve', manager: 'Bo' }])
    expect(p.leavers).toEqual([{ id: 'c', label: 'Cy', removed: true }])
    expect(p.edits).toEqual([{ id: 'b', label: 'Bo', changes: [{ field: 'title', from: 'CTO', to: 'Chief Technology Officer' }] }])
    expect(p.moves).toEqual([])
    expect(p.unchanged).toBe(1)
    // Eve's department is new; she sits under Bo, with her email kept.
    expect(p.result.newDepartments).toEqual([{ id: 'd-new3', name: 'Platform', colour: expect.stringMatching(/^#/) }])
    const eve = p.result.nodes.find(n => n.id === 'n-new1')!
    expect(eve).toMatchObject({ departmentId: 'd-new3', managerId: 'b', email: 'eve@x.com', externalId: '4', location: 'Paris', y: 200 + 80 + 80 })
    expect(p.result.nodes.map(n => n.id)).toEqual(['a', 'b', 'n-new1'])
    expect(p.result.edges.map(e => `${e.sourceId}>${e.targetId}`)).toEqual(['a>b', 'b>n-new1'])
  })

  it('a move replaces the first line in, and keeps a dotted line someone drew', () => {
    const current = chart()
    current.edges.push(edge('b', 'c', 'z-dotted')) // Cy also has a dotted line to Bo
    const p = plan('ID,Name,Title,Reports to\n1,Ada,CEO,\n2,Bo,CTO,1\n3,Cy,Engineer,2', current)
    expect(p.moves).toEqual([{ id: 'c', label: 'Cy', from: 'Ada', to: 'Bo' }])
    expect(p.result.edges.map(e => `${e.sourceId}>${e.targetId}`)).toEqual(['a>b', 'b>c'])
    expect(p.result.nodes.find(n => n.id === 'c')!.managerId).toBe('b')
  })

  it('only changes the columns the file has', () => {
    const p = plan('ID,Name\n1,Ada\n2,Bo\n3,Cy', chart())
    expect(p.hasChanges).toBe(false)
    expect(p.result.nodes.find(n => n.id === 'c')).toMatchObject({ location: 'London', title: 'Engineer', departmentId: 'd-eng' })
    expect(p.result.edges).toHaveLength(2) // no "Reports to" column: lines untouched
  })

  it('a person leaving a role that stays makes it an open role; a filled open role becomes active', () => {
    const current = chart()
    current.nodes.push(node('o', { name: 'Designer', title: 'Designer', status: 'open', externalId: '5' }))
    const p = plan('ID,Name,Title,Reports to\n1,Ada,CEO,\n2,Bo,CTO,1\n3,,Engineer,1\n5,Fay,Designer,1', current)
    const c = p.result.nodes.find(n => n.id === 'c')!
    expect(c).toMatchObject({ name: 'Engineer', status: 'open' })
    expect(p.result.nodes.find(n => n.id === 'o')).toMatchObject({ name: 'Fay', status: 'active' })
    expect(p.edits.find(e => e.id === 'c')!.changes).toEqual([
      { field: 'name', from: 'Cy', to: 'Engineer' }, { field: 'status', from: 'active', to: 'open' },
    ])
  })

  it('keeps open and planned roles made in StratMap, and removes people or file roles the file lacks', () => {
    const current = chart()
    current.nodes.push(node('p', { name: 'Analyst', title: 'Analyst', status: 'planned' }))                 // planned here: kept
    current.nodes.push(node('q', { name: 'Recruiter', title: 'Recruiter', status: 'open', externalId: '8' })) // came from a file: gone
    current.edges.push(edge('c', 'p'))
    const p = plan('ID,Name,Title,Reports to\n1,Ada,CEO,\n2,Bo,CTO,1', current)
    expect(p.leavers.map(l => l.id)).toEqual(['c', 'q'])
    expect(p.kept).toBe(1)
    const analyst = p.result.nodes.find(n => n.id === 'p')!
    expect(analyst.managerId).toBeNull() // their manager left; the line went with them
    expect(p.result.edges.some(e => e.targetId === 'p')).toBe(false)
  })

  it('can list leavers without removing them', () => {
    const p = plan('ID,Name,Title\n1,Ada,CEO\n2,Bo,CTO', chart(), { removeLeavers: false })
    expect(p.leavers).toEqual([{ id: 'c', label: 'Cy', removed: false }])
    expect(p.hasChanges).toBe(false)
    expect(p.result.nodes.map(n => n.id)).toContain('c')
  })

  it('uses a workspace department by name instead of making a new one', () => {
    const current = chart()
    current.departments.push({ id: 'ws-sales', name: 'Sales', colour: '#222222' })
    const p = plan('ID,Name,Title,Department\n1,Ada,CEO,Leadership\n2,Bo,CTO,sales\n3,Cy,Engineer,Engineering', current)
    expect(p.result.newDepartments).toEqual([])
    expect(p.edits).toEqual([{ id: 'b', label: 'Bo', changes: [{ field: 'department', from: 'Engineering', to: 'Sales' }] }])
  })

  it('a loop in the file is refused; a line drawn on the chart cannot sneak one in', () => {
    const p0 = plan('ID,Name,Title,Reports to\n1,Ada,CEO,3\n2,Bo,CTO,1\n3,Cy,Engineer,2', chart())
    expect(p0.blocked).toBe(true) // the importer's own rule
    const withDotted = chart()
    withDotted.edges.unshift(edge('c', 'a', 'a-first')) // Ada's first line in comes from Cy
    const p = plan('ID,Name,Title,Reports to\n1,Ada,CEO,\n2,Bo,CTO,1\n3,Cy,Engineer,1', withDotted)
    expect(p.blocked).toBe(false) // the file says Ada reports to nobody, so that line goes
    expect(p.moves).toEqual([{ id: 'a', label: 'Ada', from: 'Cy', to: null }])
    expect(p.result.edges.map(e => `${e.sourceId}>${e.targetId}`)).toEqual(['a>b', 'a>c'])
  })

  it('refuses a loop made with a second line drawn on the chart', () => {
    const current = chart()
    current.edges.push(edge('c', 'b', 'z-dotted')) // Bo also has a dotted line from Cy
    const p = plan('ID,Name,Title,Reports to\n1,Ada,CEO,\n2,Bo,CTO,1\n3,Cy,Engineer,2', current)
    expect(p.blocked).toBe(true)
    expect(p.issues.at(-1)!.message).toMatch(/reporting loop: .*Bo.*Cy|reporting loop: .*Cy.*Bo/)
  })

  it('refuses an update that takes the chart over the plan limit', () => {
    const p = plan('ID,Name,Title\n1,Ada,CEO\n2,Bo,CTO\n3,Cy,Engineer\n4,Di,Designer', chart(), { maxNodes: 3 })
    expect(p.blocked).toBe(true)
    expect(p.overLimit).toEqual({ max: 3, wouldHave: 4 })
  })
})
