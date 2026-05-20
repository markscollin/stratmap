import { create } from 'zustand'
import type { JobDescription } from '../types/jd'
import type { RoleStatus } from '../types/chart'
import { api } from '../lib/apiClient'

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
  chartId: string | null
  setChartId: (id: string) => void
  initJD: (nodeId: string) => Promise<void>
  updateJD: (nodeId: string, updates: Partial<Pick<JobDescription, 'responsibilities' | 'requirements' | 'level' | 'salaryBandMin' | 'salaryBandMax' | 'salaryCurrency'>>) => void
  setStatus: (nodeId: string, status: RoleStatus) => void
}

export const useJobDescriptionStore = create<JDStore>((set, get) => ({
  jobDescriptions: {},
  chartId: null,

  setChartId(id) {
    if (get().chartId !== id) {
      set({ chartId: id, jobDescriptions: {} })
    }
  },

  async initJD(nodeId) {
    if (get().jobDescriptions[nodeId]) return
    const chartId = get().chartId
    if (!chartId) {
      set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: makeDefault(nodeId) } }))
      return
    }
    try {
      const raw = await api.get<Record<string, unknown>>(`/api/charts/${chartId}/jd/${nodeId}`)
      // id === null means no DB row yet — treat as default
      if (raw.id === null) {
        set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: makeDefault(nodeId) } }))
        return
      }
      const jd: JobDescription = {
        id:               String(raw.id),
        nodeId:           String(raw.nodeId ?? nodeId),
        status:           (raw.status as RoleStatus) ?? 'draft',
        responsibilities: String(raw.responsibilities ?? ''),
        requirements:     String(raw.requirements ?? ''),
        level:            raw.level != null ? String(raw.level) : undefined,
        salaryBandMin:    raw.salaryBandMin != null ? Number(raw.salaryBandMin) : undefined,
        salaryBandMax:    raw.salaryBandMax != null ? Number(raw.salaryBandMax) : undefined,
        salaryCurrency:   raw.salaryCurrency != null ? String(raw.salaryCurrency) : undefined,
        updatedAt:        raw.updatedAt ? String(raw.updatedAt) : new Date().toISOString(),
        updatedBy:        String(raw.updatedBy ?? 'You'),
        version:          Number(raw.version ?? 1),
      }
      set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: jd } }))
    } catch (err) {
      console.error('[jdStore] initJD failed:', err)
      set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: makeDefault(nodeId) } }))
    }
  },

  updateJD(nodeId, updates) {
    const existing = get().jobDescriptions[nodeId] ?? makeDefault(nodeId)
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: updated } }))

    const chartId = get().chartId
    if (chartId) {
      api.put(`/api/charts/${chartId}/jd/${nodeId}`, updates).catch(err =>
        console.error('[jdStore] updateJD failed:', err)
      )
    }
  },

  setStatus(nodeId, status) {
    const existing = get().jobDescriptions[nodeId] ?? makeDefault(nodeId)
    const versionBump = status === 'draft' && existing.status !== 'draft'
    const version = versionBump ? existing.version + 1 : existing.version
    const updated = { ...existing, status, version, updatedAt: new Date().toISOString() }
    set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: updated } }))

    const chartId = get().chartId
    if (chartId) {
      api.put(`/api/charts/${chartId}/jd/${nodeId}`, { status, version }).catch(err =>
        console.error('[jdStore] setStatus failed:', err)
      )
    }
  },
}))
