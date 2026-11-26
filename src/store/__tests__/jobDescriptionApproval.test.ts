// D-7 (R-68): an editor's edit of an approved job description's text sends it back to review, on screen at once.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../features/canvas/canvasSync', () => ({ saveChange: vi.fn() }))

import { useJobDescriptionStore } from '../jobDescriptionStore'
import { useUserStore } from '../userStore'
import type { JobDescription } from '../../types/jd'

const approved = { id: 'jd', nodeId: 'n1', status: 'approved', responsibilities: '<p>Old</p>', requirements: '', version: 1, updatedBy: 'u', updatedAt: '2026-01-01' } as JobDescription

beforeEach(() => {
  useJobDescriptionStore.setState({ jobDescriptions: { n1: approved }, chartId: 'c1', loadErrors: {} })
})

describe('jobDescriptionStore.updateJD (R-68)', () => {
  it('an editor changing the text moves it to in review', () => {
    useUserStore.setState({ permission: 'editor' })
    useJobDescriptionStore.getState().updateJD('n1', { responsibilities: '<p>New</p>' })
    expect(useJobDescriptionStore.getState().jobDescriptions.n1.status).toBe('in-review')
  })
  it('an admin changing it keeps it approved; a salary change keeps it approved too', () => {
    useUserStore.setState({ permission: 'admin' })
    useJobDescriptionStore.getState().updateJD('n1', { responsibilities: '<p>New</p>' })
    expect(useJobDescriptionStore.getState().jobDescriptions.n1.status).toBe('approved')
    useUserStore.setState({ permission: 'editor' })
    useJobDescriptionStore.setState({ jobDescriptions: { n1: approved } })
    useJobDescriptionStore.getState().updateJD('n1', { salaryCurrency: 'GBP' })
    expect(useJobDescriptionStore.getState().jobDescriptions.n1.status).toBe('approved')
  })
})
