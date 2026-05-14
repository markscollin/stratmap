import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { JobDescription } from '../types/jd'
import type { RoleStatus } from '../types/chart'

function makeDefault(nodeId: string): JobDescription {
  return {
    id: nodeId,
    nodeId,
    status: 'draft',
    responsibilities: '',
    requirements: '',
    updatedAt: new Date().toISOString(),
    updatedBy: 'You',
    version: 1,
  }
}

interface JDStore {
  jobDescriptions: Record<string, JobDescription>
  initJD: (nodeId: string) => void
  updateJD: (nodeId: string, updates: Partial<Pick<JobDescription, 'responsibilities' | 'requirements' | 'level' | 'salaryBandMin' | 'salaryBandMax' | 'salaryCurrency'>>) => void
  setStatus: (nodeId: string, status: RoleStatus) => void
}

export const useJobDescriptionStore = create<JDStore>()(
  persist(
    (set, get) => ({
      jobDescriptions: {},

      initJD(nodeId) {
        if (!get().jobDescriptions[nodeId]) {
          set(s => ({
            jobDescriptions: { ...s.jobDescriptions, [nodeId]: makeDefault(nodeId) },
          }))
        }
      },

      updateJD(nodeId, updates) {
        const existing = get().jobDescriptions[nodeId] ?? makeDefault(nodeId)
        set(s => ({
          jobDescriptions: {
            ...s.jobDescriptions,
            [nodeId]: { ...existing, ...updates, updatedAt: new Date().toISOString() },
          },
        }))
      },

      setStatus(nodeId, status) {
        const existing = get().jobDescriptions[nodeId] ?? makeDefault(nodeId)
        const versionBump = status === 'draft' && existing.status !== 'draft'
        set(s => ({
          jobDescriptions: {
            ...s.jobDescriptions,
            [nodeId]: {
              ...existing,
              status,
              version: versionBump ? existing.version + 1 : existing.version,
              updatedAt: new Date().toISOString(),
            },
          },
        }))
      },
    }),
    { name: 'stratmap-jd' }
  )
)
