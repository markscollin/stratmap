import type { RoleStatus } from './chart'

export interface JobDescription {
  id: string
  nodeId: string
  status: RoleStatus
  responsibilities: string
  requirements: string
  salaryBandMin?: number
  salaryBandMax?: number
  salaryCurrency?: string
  level?: string
  updatedAt: string
  updatedBy: string
  version: number
}
