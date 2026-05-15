import type { OrgChart, Department } from '../types'
import { currentStructureNodes, currentStructureEdges, q3HiringPlanNodes, q3HiringPlanEdges } from './mockNodes'

export const DEPT_COLOURS: Record<string, string> = {
  eng:     '#0EA5E9',
  product: '#10B981',
  design:  '#8B5CF6',
  go:      '#F59E0B',
  ops:     '#EF4444',
  finance: '#06B6D4',
}

export interface DepartmentWithStats extends Department {
  headcount: number
  open: number
}

export const mockDepartments: DepartmentWithStats[] = [
  { id:'eng',     name:'Engineering',  colour:DEPT_COLOURS.eng,     headcount:12, open:3 },
  { id:'product', name:'Product',      colour:DEPT_COLOURS.product,  headcount:5,  open:1 },
  { id:'design',  name:'Design',       colour:DEPT_COLOURS.design,   headcount:4,  open:2 },
  { id:'go',      name:'Go-to-Market', colour:DEPT_COLOURS.go,       headcount:7,  open:1 },
  { id:'ops',     name:'Operations',   colour:DEPT_COLOURS.ops,      headcount:3,  open:0 },
  { id:'finance', name:'Finance',      colour:DEPT_COLOURS.finance,  headcount:2,  open:1 },
]

// Display-only metadata (node/dept counts, relative timestamps) for chart cards
export const CHART_DISPLAY: Record<string, { nodeCount: number; deptCount: number; updatedDisplay: string }> = {
  '1': { nodeCount: 24, deptCount: 6, updatedDisplay: '2 days ago' },
  '2': { nodeCount: 31, deptCount: 5, updatedDisplay: '5 hours ago' },
  '3': { nodeCount: 48, deptCount: 6, updatedDisplay: 'Yesterday' },
  '4': { nodeCount: 22, deptCount: 4, updatedDisplay: '6 Apr 2026' },
  '5': { nodeCount: 18, deptCount: 3, updatedDisplay: '2 Jan 2026' },
  '6': { nodeCount: 20, deptCount: 4, updatedDisplay: '1 Dec 2024' },
}

export const mockCharts: OrgChart[] = [
  {
    id: '1',
    name: 'Current Structure',
    status: 'live',
    version: 3,
    departments: mockDepartments,
    nodes: currentStructureNodes,
    edges: currentStructureEdges,
    owner: 'Jamie D',
    creator: 'Jamie D',
    collaborators: ['JD', 'SR', 'MK'],
    createdAt: '2026-01-12T00:00:00Z',
    updatedAt: '2026-05-08T00:00:00Z',
  },
  {
    id: '2',
    name: 'Q3 Hiring Plan',
    status: 'review',
    version: 2,
    departments: mockDepartments,
    nodes: q3HiringPlanNodes,
    edges: q3HiringPlanEdges,
    owner: 'Sarah R',
    creator: 'Jamie D',
    collaborators: ['JD', 'SR'],
    createdAt: '2026-04-28T00:00:00Z',
    updatedAt: '2026-05-10T07:00:00Z',
  },
  {
    id: '3',
    name: 'Post-Series B Scenario',
    status: 'editing',
    version: 1,
    departments: mockDepartments,
    nodes: [],
    edges: [],
    owner: 'Jamie D',
    creator: 'Mark K',
    collaborators: ['MK', 'JD', 'SR', 'TL'],
    createdAt: '2026-05-03T00:00:00Z',
    updatedAt: '2026-05-09T00:00:00Z',
  },
  {
    id: '4',
    name: 'Board Overview',
    status: 'approved',
    version: 1,
    departments: mockDepartments,
    nodes: [],
    edges: [],
    owner: 'Mark K',
    creator: 'Mark K',
    collaborators: ['MK', 'JD'],
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-06T00:00:00Z',
  },
  {
    id: '5',
    name: 'Engineering Reorg',
    status: 'rejected',
    version: 2,
    departments: mockDepartments,
    nodes: [],
    edges: [],
    owner: 'Tara L',
    creator: 'Tara L',
    collaborators: ['TL', 'SR'],
    createdAt: '2025-11-10T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  {
    id: '6',
    name: '2024 Structure',
    status: 'archived',
    version: 4,
    departments: mockDepartments,
    nodes: [],
    edges: [],
    owner: 'Mark K',
    creator: 'Mark K',
    collaborators: ['MK'],
    createdAt: '2024-01-05T00:00:00Z',
    updatedAt: '2024-12-01T00:00:00Z',
  },
]
