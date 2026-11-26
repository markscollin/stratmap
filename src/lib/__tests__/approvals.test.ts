import { describe, it, expect } from 'vitest'
import { jdEditSendsBackToReview, headcountPlanLocked } from '../approvals'

// D-7 (2026-11-26): editors may un-approve; an editor's text edit of an approved JD goes back to review; approved hire plans are
// read-only for editors apart from their status.
describe('approval rules (R-68)', () => {
  it('an editor editing an approved, published or hired JD sends it back to review; an admin does not', () => {
    for (const s of ['approved', 'published', 'hired']) {
      expect(jdEditSendsBackToReview(s, false)).toBe(true)
      expect(jdEditSendsBackToReview(s, true)).toBe(false)
    }
    for (const s of ['draft', 'in-review']) expect(jdEditSendsBackToReview(s, false)).toBe(false)
  })
  it('an approved hire plan is locked for editors only', () => {
    expect(headcountPlanLocked('approved', false)).toBe(true)
    expect(headcountPlanLocked('approved', true)).toBe(false)
    expect(headcountPlanLocked('planned', false)).toBe(false)
    expect(headcountPlanLocked('filled', false)).toBe(false)
  })
})
