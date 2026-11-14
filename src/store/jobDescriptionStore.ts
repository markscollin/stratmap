import { create } from 'zustand'
import type { JobDescription } from '../types/jd'
import type { RoleStatus } from '../types/chart'
import { api } from '../lib/apiClient'
import { saveChange } from '../features/canvas/canvasSync'

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
  /** Roles whose job description could not be loaded (R-11). The editor stays closed for them: a blank one would overwrite the real text on the next autosave. */
  loadErrors: Record<string, true>
  setChartId: (id: string) => void
  initJD: (nodeId: string) => Promise<void>
  /** `null` clears a salary-band bound (the server stores null); locally it becomes undefined. */
  updateJD: (nodeId: string, updates: Partial<Pick<JobDescription, 'responsibilities' | 'requirements' | 'level' | 'salaryCurrency'>> & { salaryBandMin?: number | null; salaryBandMax?: number | null }) => void
  setStatus: (nodeId: string, status: RoleStatus) => void
}

export const useJobDescriptionStore = create<JDStore>((set, get) => ({
  jobDescriptions: {},
  chartId: null,
  loadErrors: {},

  setChartId(id) {
    if (get().chartId !== id) {
      set({ chartId: id, jobDescriptions: {}, loadErrors: {} })
    }
  },

  async initJD(nodeId) {
    if (get().jobDescriptions[nodeId]) return
    const chartId = get().chartId
    if (!chartId) {
      set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: makeDefault(nodeId) } }))
      return
    }
    if (get().loadErrors[nodeId]) set(s => ({ loadErrors: Object.fromEntries(Object.entries(s.loadErrors).filter(([k]) => k !== nodeId)) as Record<string, true> })) // a retry
    try {
      const raw = await api.get<Record<string, unknown>>(`/api/charts/${chartId}/jd/${nodeId}`)
      if (get().chartId !== chartId) return // the user moved to another chart while this loaded
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
      // A role with no job description yet is a 200 with `id: null` (handled above), so reaching here means the load FAILED.
      // Never fall back to a blank one: typing into it would autosave over the stored text (R-11).
      console.error('[jdStore] initJD failed:', err)
      if (get().chartId === chartId) set(s => ({ loadErrors: { ...s.loadErrors, [nodeId]: true } }))
    }
  },

  updateJD(nodeId, updates) {
    if (get().loadErrors[nodeId]) return // never write over a job description that was not loaded
    const existing = get().jobDescriptions[nodeId] ?? makeDefault(nodeId)
    const { salaryBandMin, salaryBandMax, ...rest } = updates
    const updated: JobDescription = { ...existing, ...rest, updatedAt: new Date().toISOString() }
    if (salaryBandMin !== undefined) updated.salaryBandMin = salaryBandMin ?? undefined
    if (salaryBandMax !== undefined) updated.salaryBandMax = salaryBandMax ?? undefined
    set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: updated } }))

    const chartId = get().chartId
    // Through the same queue as canvas edits (R-01): in order after the role's own save, one at a time, and a failure is
    // shown (banner, toast, Retry) instead of being swallowed.
    if (chartId) saveChange(chartId, "Couldn't save the job description", () => api.put(`/api/charts/${chartId}/jd/${nodeId}`, updates, { keepalive: true }))
  },

  setStatus(nodeId, status) {
    if (get().loadErrors[nodeId]) return
    const existing = get().jobDescriptions[nodeId] ?? makeDefault(nodeId)
    const versionBump = status === 'draft' && existing.status !== 'draft'
    const version = versionBump ? existing.version + 1 : existing.version
    const updated = { ...existing, status, version, updatedAt: new Date().toISOString() }
    set(s => ({ jobDescriptions: { ...s.jobDescriptions, [nodeId]: updated } }))

    const chartId = get().chartId
    if (chartId) saveChange(chartId, "Couldn't save the job description status", () => api.put(`/api/charts/${chartId}/jd/${nodeId}`, { status, version }))
  },
}))
