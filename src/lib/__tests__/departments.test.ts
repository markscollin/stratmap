// Launch review R-47: a role's department is found in the chart's own departments first, then the workspace's, and is never shown as an id.
import { describe, it, expect } from 'vitest'
import { mergeDepartments, findDepartment, departmentLabel } from '../departments'

const CHART = [{ id: 'c-1', name: 'Leadership', colour: '#111111' }]
const WORKSPACE = [{ id: 'w-1', name: 'Engineering', colour: '#222222' }, { id: 'c-1', name: 'Workspace copy', colour: '#333333' }]

describe('mergeDepartments', () => {
  it('puts the chart\'s departments first and adds workspace ones the chart does not have', () => {
    expect(mergeDepartments(CHART, WORKSPACE).map(d => d.id)).toEqual(['c-1', 'w-1'])
  })
  it('on the same id the chart\'s department wins', () => {
    expect(findDepartment(mergeDepartments(CHART, WORKSPACE), 'c-1')?.name).toBe('Leadership')
  })
  it('works with no workspace departments (a public share page) and with no chart departments', () => {
    expect(findDepartment(mergeDepartments(CHART, []), 'c-1')?.colour).toBe('#111111')
    expect(findDepartment(mergeDepartments([], WORKSPACE), 'w-1')?.name).toBe('Engineering')
  })
})

describe('findDepartment', () => {
  it('finds nothing for an empty or unknown id', () => {
    expect(findDepartment(CHART, '')).toBeUndefined()
    expect(findDepartment(CHART, null)).toBeUndefined()
    expect(findDepartment(CHART, 'nope')).toBeUndefined()
  })
})

describe('departmentLabel', () => {
  it('is the name when the department is known', () => {
    expect(departmentLabel({ name: 'Leadership' }, 'c-1')).toBe('Leadership')
  })
  it('never shows an id: a deleted department is "Unknown department", no department is "Not set"', () => {
    expect(departmentLabel(undefined, '16841415-5204-43b5-9b73-960440ebdd80')).toBe('Unknown department')
    expect(departmentLabel(undefined, '')).toBe('Not set')
    expect(departmentLabel(undefined, null)).toBe('Not set')
  })
})
