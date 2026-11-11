import { describe, it, expect } from 'vitest'
import { diffSnapshots, roleLabel, type DiffNode, type DiffState } from '../snapshotDiff'

const node = (id: string, over: Partial<DiffNode> = {}): DiffNode => ({
  id, name: `Name ${id}`, title: `Title ${id}`, departmentId: null, status: 'active', roleType: null, employmentType: 'full-time', location: null, startDate: null, ...over,
})
const state = (nodes: DiffNode[], edges: [string, string][] = [], departments: { id: string; name: string }[] = []): DiffState =>
  ({ nodes, edges: edges.map(([sourceId, targetId]) => ({ sourceId, targetId })), departments })

describe('roleLabel', () => {
  it('shows the person and title, or just the title for an open role', () => {
    expect(roleLabel({ name: 'Ada', title: 'CTO', status: 'active' })).toBe('Ada, CTO')
    expect(roleLabel({ name: 'Engineer', title: 'Engineer', status: 'open' })).toBe('Engineer (open)')
    expect(roleLabel({ name: 'Someone', title: 'Analyst', status: 'planned' })).toBe('Analyst (open)')
    expect(roleLabel({ name: '', title: 'Analyst', status: 'active' })).toBe('Analyst')
  })
})

describe('diffSnapshots', () => {
  it('says identical when nothing but positions differ', () => {
    const a = state([node('1'), node('2')], [['1', '2']])
    const moved = state([{ ...node('1'), ...{ x: 500 } } as DiffNode, node('2')], [['1', '2']])
    expect(diffSnapshots(a, moved).identical).toBe(true)
    expect(diffSnapshots(a, a)).toMatchObject({ added: [], removed: [], changed: [], identical: true })
  })

  it('finds roles added and removed, with their department, sorted', () => {
    const deps = [{ id: 'd1', name: 'Engineering' }]
    const before = state([node('1'), node('old', { departmentId: 'd1', name: 'Zed', title: 'Dev' })], [], deps)
    const after = state([node('1'), node('new', { departmentId: 'd1', name: 'Amy', title: 'Dev' }), node('new2', { name: 'Bea', title: 'PM' })], [], deps)
    const d = diffSnapshots(before, after)
    expect(d.removed).toEqual([{ id: 'old', label: 'Zed, Dev', department: 'Engineering' }])
    expect(d.added.map(r => r.label)).toEqual(['Amy, Dev', 'Bea, PM'])
    expect(d.added[1].department).toBe('No department')
    expect(d.identical).toBe(false)
  })

  it('reports every changed field with before and after', () => {
    const deps = [{ id: 'd1', name: 'Eng' }, { id: 'd2', name: 'Ops' }]
    const before = state([node('1', { departmentId: 'd1', status: 'open', roleType: 'new-headcount', location: 'London' })], [], deps)
    const after = state([node('1', { title: 'Senior', departmentId: 'd2', status: 'active', roleType: null, location: 'Paris', startDate: '2027-01-01', employmentType: 'contractor' })], [], deps)
    const [role] = diffSnapshots(before, after).changed
    expect(Object.fromEntries(role.changes.map(c => [c.field, `${c.from} -> ${c.to}`]))).toEqual({
      title: 'Title 1 -> Senior', department: 'Eng -> Ops', status: 'open -> active', 'role type': 'new-headcount -> (none)',
      'employment type': 'full-time -> contractor', location: 'London -> Paris', 'start date': '(none) -> 2027-01-01',
    })
  })

  it('reports who a role reports to, from the lines, and notices a role that changed manager', () => {
    const nodes = [node('boss', { name: 'Bo', title: 'CEO' }), node('lead', { name: 'Lee', title: 'Lead' }), node('dev', { name: 'Di', title: 'Dev' })]
    const before = state(nodes, [['boss', 'lead'], ['lead', 'dev']])
    const after = state(nodes, [['boss', 'lead'], ['boss', 'dev']])
    const d = diffSnapshots(before, after)
    expect(d.changed).toEqual([{ id: 'dev', label: 'Di, Dev', changes: [{ field: 'reports to', from: 'Lee, Lead', to: 'Bo, CEO' }] }])
  })

  it('a role that becomes the top of the chart reports to "nobody"', () => {
    const nodes = [node('a'), node('b')]
    const d = diffSnapshots(state(nodes, [['a', 'b']]), state(nodes, []))
    expect(d.changed[0].changes).toEqual([{ field: 'reports to', from: 'Name a, Title a', to: 'nobody (top of the chart)' }])
  })

  it('the answer does not depend on the order of the lines', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const one = diffSnapshots(state(nodes, [['a', 'c'], ['b', 'c']]), state(nodes, [['b', 'c'], ['a', 'c']]))
    expect(one.identical).toBe(true)
  })

  it('ignores lines that point at roles that do not exist, and self lines', () => {
    const nodes = [node('a'), node('b')]
    expect(diffSnapshots(state(nodes, [['a', 'b']]), state(nodes, [['a', 'b'], ['ghost', 'b'], ['b', 'b']])).identical).toBe(true)
  })

  it('counts headcount by department, including open roles, before and after', () => {
    const deps = [{ id: 'e', name: 'Eng' }, { id: 'o', name: 'Ops' }]
    const before = state([node('1', { departmentId: 'e' }), node('2', { departmentId: 'e', status: 'open' }), node('3', { departmentId: 'o' })], [], deps)
    const after = state([node('1', { departmentId: 'e' }), node('2', { departmentId: 'e', status: 'open' }), node('4', { departmentId: 'e', status: 'planned' }), node('5')], [], deps)
    const { headcount } = diffSnapshots(before, after)
    expect(headcount.roles).toEqual({ before: 3, after: 4 })
    expect(headcount.open).toEqual({ before: 1, after: 2 })
    expect(headcount.byDepartment).toEqual([
      { name: 'Eng', before: 2, after: 3 }, { name: 'No department', before: 0, after: 1 }, { name: 'Ops', before: 1, after: 0 },
    ])
  })

  it('handles two empty charts, and a chart compared with an empty one', () => {
    expect(diffSnapshots(state([]), state([])).identical).toBe(true)
    const d = diffSnapshots(state([node('1')]), state([]))
    expect(d.removed).toHaveLength(1)
    expect(d.headcount.roles).toEqual({ before: 1, after: 0 })
  })
})
