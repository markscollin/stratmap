import { describe, it, expect } from 'vitest'
import { statusChangeNeedsAdmin } from '../chartStatus'
import { STATUS_ACTIONS } from '../../constants/statusMeta'
import type { ChartStatus } from '../../types'

describe('statusChangeNeedsAdmin (R-08)', () => {
  it('is admin-only to enter approved, rejected or live', () => {
    for (const to of ['approved', 'rejected', 'live'] as ChartStatus[]) {
      expect(statusChangeNeedsAdmin('draft', to)).toBe(true)
      expect(statusChangeNeedsAdmin(null, to)).toBe(true)
    }
  })
  it('is admin-only to leave approved or live', () => {
    for (const from of ['approved', 'live'] as ChartStatus[]) {
      for (const to of ['draft', 'editing', 'review', 'archived'] as ChartStatus[]) expect(statusChangeNeedsAdmin(from, to)).toBe(true)
    }
  })
  it('is open to editors for draft, editing, review, archived and for leaving rejected', () => {
    expect(statusChangeNeedsAdmin('draft', 'review')).toBe(false)
    expect(statusChangeNeedsAdmin('editing', 'review')).toBe(false)
    expect(statusChangeNeedsAdmin('rejected', 'editing')).toBe(false)
    expect(statusChangeNeedsAdmin('draft', 'archived')).toBe(false)
    expect(statusChangeNeedsAdmin(null, 'draft')).toBe(false)
  })
  it('a no-op is never a change', () => {
    for (const s of ['draft', 'review', 'approved', 'live', 'archived'] as ChartStatus[]) expect(statusChangeNeedsAdmin(s, s)).toBe(false)
  })

  it('agrees with every action the UI offers: the minimum role shown is the minimum role the server demands', () => {
    for (const [from, actions] of Object.entries(STATUS_ACTIONS) as [ChartStatus, typeof STATUS_ACTIONS[ChartStatus]][]) {
      for (const a of actions) {
        expect(statusChangeNeedsAdmin(from, a.next), `${from} → ${a.next} (${a.label})`).toBe(a.minPermission === 'admin')
      }
    }
  })
})
