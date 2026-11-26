export type EmploymentType = 'full-time' | 'part-time' | 'contractor' | 'advisor'
export type NodeStatus = 'active' | 'open' | 'planned' | 'backfill'
export type RoleStatus = 'draft' | 'in-review' | 'approved' | 'published' | 'hired'
export type ChartStatus = 'draft' | 'editing' | 'review' | 'rejected' | 'approved' | 'live' | 'archived'
export type RoleType = 'existing' | 'new-headcount' | 'backfill' | 'contractor' | 'tbd'

export interface Department {
  id: string
  name: string
  colour: string
  /** Set when the chart department mirrors a workspace department. */
  workspaceDepartmentId?: string | null
}

export interface OrgNode {
  id: string
  name: string
  title: string
  departmentId: string
  managerId: string | null
  status: NodeStatus
  employmentType: EmploymentType
  roleType?: RoleType
  avatarUrl?: string
  location?: string
  startDate?: string
  x: number
  y: number
  isNew?: boolean
  /** R-77: the file's ID for this role, set by an import; "Update from file" matches rows by it. */
  externalId?: string | null
  /** R-77: the person's email from an import (lower case); the second way a row is matched. */
  email?: string | null
}

export interface OrgEdge {
  id: string
  sourceId: string
  targetId: string
}

export interface OrgChart {
  id: string
  name: string
  status: ChartStatus
  version: number
  isPublic: boolean
  /** An opt-in example chart: free, not counted toward the plan's chart limit (roadmap 2.7). */
  isSample?: boolean
  departments: Department[]
  nodes: OrgNode[]
  edges: OrgEdge[]
  owner: string
  creator: string
  collaborators: string[]
  createdAt: string
  updatedAt: string
  /** From the chart list endpoint, which doesn't load nodes or departments. */
  nodeCount?: number
  deptCount?: number
}
