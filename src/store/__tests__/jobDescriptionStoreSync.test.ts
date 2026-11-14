// Launch review R-11: a failed job-description load used to fall back to a blank one, and the next autosave then wrote
// the blank text over the real one; save failures were swallowed.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const get = vi.fn()
const put = vi.fn()
vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient')
  return { ...actual, api: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }
})

import { useJobDescriptionStore } from '../jobDescriptionStore'
import { ApiError } from '../../lib/apiClient'
import { useCanvasSave, resetCanvasSave } from '../../features/canvas/canvasSync'
import { useToastStore } from '../toastStore'

const stored = { id: 'jd1', nodeId: 'n1', status: 'draft', responsibilities: '<p>Real text</p>', requirements: '', version: 2, updatedBy: 'u', updatedAt: '2026-11-01T00:00:00Z' }
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  get.mockReset(); put.mockReset()
  resetCanvasSave()
  useToastStore.setState({ toasts: [] })
  useJobDescriptionStore.setState({ jobDescriptions: {}, loadErrors: {}, chartId: 'c1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('loading', () => {
  it('a failed load does not create a blank job description, and records the failure', async () => {
    get.mockRejectedValue(new ApiError(500, { error: 'x' }))
    await useJobDescriptionStore.getState().initJD('n1')
    const s = useJobDescriptionStore.getState()
    expect(s.jobDescriptions.n1).toBeUndefined()
    expect(s.loadErrors.n1).toBe(true)
  })

  it('a network failure is a failure too', async () => {
    get.mockRejectedValue(new TypeError('Failed to fetch'))
    await useJobDescriptionStore.getState().initJD('n1')
    expect(useJobDescriptionStore.getState().loadErrors.n1).toBe(true)
  })

  it('a failed load never issues a PUT, however much is typed afterwards', async () => {
    get.mockRejectedValue(new ApiError(503, { error: 'x' }))
    await useJobDescriptionStore.getState().initJD('n1')
    useJobDescriptionStore.getState().updateJD('n1', { responsibilities: '<p>typed over the real text</p>' })
    useJobDescriptionStore.getState().setStatus('n1', 'in-review')
    await flush()
    expect(put).not.toHaveBeenCalled()
    expect(useJobDescriptionStore.getState().jobDescriptions.n1).toBeUndefined()
  })

  it('"no job description yet" (a 200 with id null) is a normal blank draft, not a failure', async () => {
    get.mockResolvedValue({ id: null, nodeId: 'n1', status: 'draft', responsibilities: '', requirements: '', version: 1 })
    await useJobDescriptionStore.getState().initJD('n1')
    const s = useJobDescriptionStore.getState()
    expect(s.loadErrors.n1).toBeUndefined()
    expect(s.jobDescriptions.n1.responsibilities).toBe('')
  })

  it('Retry loads the real text and clears the failure', async () => {
    get.mockRejectedValueOnce(new ApiError(500, { error: 'x' })).mockResolvedValueOnce(stored)
    await useJobDescriptionStore.getState().initJD('n1')
    await useJobDescriptionStore.getState().initJD('n1')
    const s = useJobDescriptionStore.getState()
    expect(s.loadErrors.n1).toBeUndefined()
    expect(s.jobDescriptions.n1.responsibilities).toBe('<p>Real text</p>')
  })

  it('switching chart forgets the failures', async () => {
    get.mockRejectedValue(new ApiError(500, { error: 'x' }))
    await useJobDescriptionStore.getState().initJD('n1')
    useJobDescriptionStore.getState().setChartId('c2')
    expect(useJobDescriptionStore.getState().loadErrors).toEqual({})
  })
})

describe('saving goes through the canvas save queue', () => {
  beforeEach(() => { get.mockResolvedValue(stored) })

  it('sends the change, with keepalive so it survives a closing tab', async () => {
    put.mockResolvedValue({})
    await useJobDescriptionStore.getState().initJD('n1')
    useJobDescriptionStore.getState().updateJD('n1', { responsibilities: '<p>New</p>' })
    await flush()
    expect(put).toHaveBeenCalledWith('/api/charts/c1/jd/n1', { responsibilities: '<p>New</p>' }, { keepalive: true })
    expect(useCanvasSave.getState().failure).toBeNull()
    expect(useCanvasSave.getState().pending).toBe(0)
  })

  it('a failed save is shown (banner state + toast) instead of swallowed, and holds back later writes', async () => {
    put.mockRejectedValue(new ApiError(500, { error: 'x' }))
    await useJobDescriptionStore.getState().initJD('n1')
    useJobDescriptionStore.getState().updateJD('n1', { responsibilities: '<p>A</p>' })
    await flush()
    const failure = useCanvasSave.getState().failure
    expect(failure).toMatchObject({ chartId: 'c1', action: "Couldn't save the job description", retryable: true })
    expect(useToastStore.getState().toasts.some(t => /Couldn't save the job description/.test(t.message))).toBe(true)
    useJobDescriptionStore.getState().updateJD('n1', { requirements: '<p>B</p>' })
    await flush()
    expect(put).toHaveBeenCalledTimes(1) // the second write waits behind the failed one
  })

  it('a status change is queued the same way', async () => {
    put.mockResolvedValue({})
    await useJobDescriptionStore.getState().initJD('n1')
    useJobDescriptionStore.getState().setStatus('n1', 'in-review')
    await flush()
    expect(put).toHaveBeenCalledWith('/api/charts/c1/jd/n1', { status: 'in-review', version: 2 })
  })
})
