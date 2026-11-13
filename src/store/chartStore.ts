import { create } from 'zustand'
import type { OrgChart, OrgNode, OrgEdge, ChartStatus, Department } from '../types'
import { api, ApiError } from '../lib/apiClient'
import { useToastStore } from './toastStore'
import { buildChartTemplate } from '../lib/chartTemplates'

/** Charts that count toward the plan's limit: everything except the sample (roadmap 2.7). */
export const countOwnCharts = (charts: { isSample?: boolean }[]) => charts.filter(c => !c.isSample).length

export const SAMPLE_CHART_NAME = 'Sample org chart'

interface ChartStore {
  charts: OrgChart[]
  loading: boolean
  loaded: boolean

  fetchCharts: () => Promise<void>
  createChart: (name: string, nodes: OrgNode[], edges: OrgEdge[], departments: Department[], opts?: { isSample?: boolean }) => Promise<OrgChart | null>
  /** Adds the opt-in sample chart (free; at most one). */
  createSampleChart: () => Promise<OrgChart | null>
  deleteChart: (id: string) => Promise<void>
  setActiveChart: (id: string | null) => void
  updateChartStatus: (id: string, status: ChartStatus) => void
  updateChartPublic: (id: string, isPublic: boolean) => Promise<void>
  duplicateChart: (id: string) => Promise<void>

  // kept for backwards compat (canvas uses this to merge fetched data)
}

export const useChartStore = create<ChartStore>((set, get) => ({
  charts: [],
  loading: false,
  loaded: false,

  async fetchCharts() {
    if (get().loading) return
    set({ loading: true })
    try {
      const raw = await api.get<Record<string, unknown>[]>('/api/charts')
      const charts: OrgChart[] = raw.map(c => ({
        id: String(c.id),
        name: String(c.name),
        status: c.status as ChartStatus,
        version: Number(c.version ?? 1),
        isPublic: Boolean(c.isPublic ?? false),
        isSample: Boolean(c.isSample ?? false),
        departments: [],
        nodes: [],
        edges: [],
        owner: String(c.ownerId ?? ''),
        creator: String(c.creatorId ?? ''),
        collaborators: [],
        createdAt: String(c.createdAt),
        updatedAt: String(c.updatedAt),
        nodeCount: Number(c.nodeCount ?? 0),
        deptCount: Number(c.deptCount ?? 0),
      }))
      set({ charts, loaded: true })
    } catch (err) {
      console.error('[chartStore] fetchCharts failed:', err)
    } finally {
      set({ loading: false })
    }
  },

  async createChart(name, nodes, edges, departments, opts) {
    try {
      const raw = await api.post<Record<string, unknown>>('/api/charts', {
        name,
        templateNodes: nodes,
        templateEdges: edges,
        templateDepts: departments,
        ...(opts?.isSample ? { isSample: true } : {}),
      })
      const chart: OrgChart = {
        id: String(raw.id),
        name: String(raw.name),
        status: raw.status as ChartStatus,
        version: Number(raw.version ?? 1),
        isPublic: Boolean(raw.isPublic ?? false),
        isSample: Boolean(raw.isSample ?? false),
        departments,
        nodes,
        edges,
        owner: String(raw.ownerId ?? ''),
        creator: String(raw.creatorId ?? ''),
        collaborators: [],
        createdAt: String(raw.createdAt),
        updatedAt: String(raw.updatedAt),
      }
      set(s => ({ charts: [chart, ...s.charts] }))
      return chart
    } catch (err) {
      console.error('[chartStore] createChart failed:', err)
      // Surface server-side refusals (plan limit, permissions) to the user.
      if (err instanceof ApiError && (err.status === 402 || err.status === 403 || err.status === 409)) {
        useToastStore.getState().addToast(err.userMessage === 'forbidden'
          ? 'You do not have permission to create charts.'
          : err.userMessage, 'warning')
      }
      return null
    }
  },

  async createSampleChart() {
    const { nodes, edges, departments } = buildChartTemplate('quickstart')
    return get().createChart(SAMPLE_CHART_NAME, nodes, edges, departments, { isSample: true })
  },

  async deleteChart(id) {
    set(s => ({ charts: s.charts.filter(c => c.id !== id) }))
    try {
      await api.delete(`/api/charts/${id}`)
    } catch (err) {
      console.error('[chartStore] deleteChart failed:', err)
    }
  },

  setActiveChart: () => {},

  updateChartStatus(id, status) {
    set(s => ({
      charts: s.charts.map(c =>
        c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c
      ),
    }))
    api.put(`/api/charts/${id}`, { status }).catch(err =>
      console.error('[chartStore] updateChartStatus failed:', err)
    )
  },

  async updateChartPublic(id, isPublic) {
    set(s => ({
      charts: s.charts.map(c =>
        c.id === id ? { ...c, isPublic, updatedAt: new Date().toISOString() } : c
      ),
    }))
    await api.put(`/api/charts/${id}`, { isPublic })
  },

  // The server makes the copy (the list only holds counts, not roles; copying what the list holds gave an empty chart, R-10).
  async duplicateChart(id) {
    try {
      const raw = await api.post<Record<string, unknown>>(`/api/charts/${id}/duplicate`, {})
      const source = get().charts.find(c => c.id === id)
      const chart: OrgChart = {
        id: String(raw.id),
        name: String(raw.name),
        status: raw.status as ChartStatus,
        version: Number(raw.version ?? 1),
        isPublic: Boolean(raw.isPublic ?? false),
        isSample: false,
        departments: [],
        nodes: [],
        edges: [],
        owner: String(raw.ownerId ?? ''),
        creator: String(raw.creatorId ?? ''),
        collaborators: [],
        createdAt: String(raw.createdAt),
        updatedAt: String(raw.updatedAt),
        nodeCount: source?.nodeCount,
        deptCount: source?.deptCount,
      }
      set(s => ({ charts: [chart, ...s.charts] }))
      useToastStore.getState().addToast(`Created “${chart.name}”.`, 'success')
    } catch (err) {
      console.error('[chartStore] duplicateChart failed:', err)
      const refused = err instanceof ApiError && [402, 403, 409].includes(err.status)
      useToastStore.getState().addToast(
        refused ? (err.userMessage === 'forbidden' ? 'You do not have permission to create charts.' : err.userMessage) : "Couldn't duplicate the chart. Please try again.",
        refused ? 'warning' : 'error',
      )
    }
  },
}))
