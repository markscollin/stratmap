export type EmploymentType = 'full-time' | 'part-time' | 'contractor' | 'advisor'
export type NodeStatus = 'active' | 'open' | 'planned' | 'backfill'
export type RoleStatus = 'draft' | 'in-review' | 'approved' | 'published' | 'hired'
export type ChartStatus = 'draft' | 'editing' | 'review' | 'rejected' | 'approved' | 'live' | 'archived'
export type RoleType = 'existing' | 'new-headcount' | 'backfill' | 'contractor' | 'tbd'

export interface Department {
  id: string
  name: string
  colour: string
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
  departments: Department[]
  nodes: OrgNode[]
  edges: OrgEdge[]
  owner: string
  creator: string
  collaborators: string[]
  createdAt: string
  updatedAt: string
}
