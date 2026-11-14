// Launch review R-14: optimistic writes outside the canvas used to leave the screen out of step with the server when
// they failed, with no message. Each now puts things back and says why.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient')
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api, ApiError } from '../../lib/apiClient'
import { useChartStore } from '../chartStore'
import { useTemplateStore, type Template } from '../templateStore'
import { useHeadcountStore } from '../headcountStore'
import { useToastStore } from '../toastStore'
import type { OrgChart } from '../../types'

const chart = (id: string, over: Partial<OrgChart> = {}) => ({ id, name: `Chart ${id}`, status: 'draft', isPublic: false, version: 1, nodes: [], edges: [], departments: [], updatedAt: '2026-01-01T00:00:00Z', ...over }) as unknown as OrgChart
const toasts = () => useToastStore.getState().toasts.map(t => t.message)
const boom = () => new ApiError(500, { error: 'x' })

beforeEach(() => {
  vi.mocked(api.get).mockReset(); vi.mocked(api.post).mockReset(); vi.mocked(api.put).mockReset(); vi.mocked(api.delete).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useToastStore.setState({ toasts: [] })
  useChartStore.setState({ charts: [chart('a'), chart('b'), chart('c')], loaded: true, loading: false, error: false })
})

describe('chart list', () => {
  it('delete: a failure puts the chart back in its place and says why', async () => {
    vi.mocked(api.delete).mockRejectedValue(new ApiError(403, { error: 'forbidden' }))
    await useChartStore.getState().deleteChart('b')
    expect(useChartStore.getState().charts.map(c => c.id)).toEqual(['a', 'b', 'c'])
    expect(toasts()).toEqual(["You don't have permission to delete the chart."])
  })

  it('delete: success removes it and says nothing', async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined)
    await useChartStore.getState().deleteChart('b')
    expect(useChartStore.getState().charts.map(c => c.id)).toEqual(['a', 'c'])
    expect(toasts()).toEqual([])
  })

  it('status change: a refusal puts the old status back and shows the server message', async () => {
    vi.mocked(api.put).mockRejectedValue(new ApiError(402, { error: 'plan-feature', message: 'Approval workflows need Starter.' }))
    expect(await useChartStore.getState().updateChartStatus('a', 'review')).toBe(false)
    expect(useChartStore.getState().charts[0]).toMatchObject({ status: 'draft', updatedAt: '2026-01-01T00:00:00Z' })
    expect(toasts()).toEqual(['Approval workflows need Starter.'])
  })

  it('status change: success keeps the new status', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    expect(await useChartStore.getState().updateChartStatus('a', 'review')).toBe(true)
    expect(useChartStore.getState().charts[0].status).toBe('review')
  })

  it('sharing: a failure puts isPublic back and says so', async () => {
    vi.mocked(api.put).mockRejectedValue(boom())
    expect(await useChartStore.getState().updateChartPublic('a', true)).toBe(false)
    expect(useChartStore.getState().charts[0].isPublic).toBe(false)
    expect(toasts()).toEqual(["Couldn't change sharing. Please try again."])
  })

  it('a failed list load sets error (not "no charts"), and a retry clears it', async () => {
    useChartStore.setState({ charts: [], loaded: false })
    vi.mocked(api.get).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await useChartStore.getState().fetchCharts()
    expect(useChartStore.getState()).toMatchObject({ error: true, loaded: false, loading: false })
    vi.mocked(api.get).mockResolvedValueOnce([])
    await useChartStore.getState().fetchCharts()
    expect(useChartStore.getState()).toMatchObject({ error: false, loaded: true })
  })
})

describe('templates', () => {
  const t = (id: string): Template => ({ id, title: `T ${id}`, department: 'Eng', responsibilities: '', requirements: '', tags: [], uses: 0, updatedBy: 'x', updatedAt: '2026-01-01T00:00:00Z', createdBy: 'x' } as unknown as Template)
  beforeEach(() => { useTemplateStore.setState({ templates: { t1: t('t1'), t2: t('t2') } }) })
  const flush = () => new Promise(r => setTimeout(r, 0))

  it('edit: a failure restores the previous text and says why', async () => {
    vi.mocked(api.put).mockRejectedValue(boom())
    useTemplateStore.getState().updateTemplate('t1', { title: 'Renamed' })
    expect(useTemplateStore.getState().templates.t1.title).toBe('Renamed') // optimistic
    await flush()
    expect(useTemplateStore.getState().templates.t1.title).toBe('T t1')
    expect(toasts()).toEqual(["Couldn't save the template. Please try again."])
  })

  it('delete: a failure brings the template back', async () => {
    vi.mocked(api.delete).mockRejectedValue(boom())
    useTemplateStore.getState().deleteTemplate('t2')
    expect(useTemplateStore.getState().templates.t2).toBeUndefined()
    await flush()
    expect(useTemplateStore.getState().templates.t2.title).toBe('T t2')
    expect(toasts()).toEqual(["Couldn't delete the template. Please try again."])
  })

  it('add: a failure says so', async () => {
    vi.mocked(api.post).mockRejectedValue(boom())
    await useTemplateStore.getState().addTemplate({ title: 'N', department: 'Eng', responsibilities: '', requirements: '', tags: [], uses: 0, updatedBy: 'x' } as never)
    expect(Object.keys(useTemplateStore.getState().templates)).toEqual(['t1', 't2'])
    expect(toasts()).toEqual(["Couldn't save the template. Please try again."])
  })
})

describe('headcount', () => {
  it('a failed create returns null and says why (the form keeps what was typed)', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(402, { error: 'plan-feature', message: 'Headcount planning needs Growth.' }))
    expect(await useHeadcountStore.getState().create({ title: 'X', roleType: 'new-headcount', targetQuarter: '2026-Q2' } as never)).toBeNull()
    expect(toasts()).toEqual(['Headcount planning needs Growth.'])
  })
})
