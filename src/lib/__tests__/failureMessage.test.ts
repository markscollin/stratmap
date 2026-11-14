import { describe, it, expect } from 'vitest'
import { failureMessage } from '../failureMessage'
import { ApiError } from '../apiClient'

describe('failureMessage (R-14)', () => {
  it("uses the server's own sentence when there is one (plan limits, admin-only)", () => {
    expect(failureMessage(new ApiError(402, { error: 'plan-feature', message: 'Upgrade to Starter.' }), 'x')).toBe('Upgrade to Starter.')
  })
  it('explains a bare 403, 404 and 401 in words', () => {
    expect(failureMessage(new ApiError(403, { error: 'forbidden' }), 'delete the chart')).toBe("You don't have permission to delete the chart.")
    expect(failureMessage(new ApiError(404, { error: 'x' }), 'delete the chart')).toMatch(/no longer exists/)
    expect(failureMessage(new ApiError(401, { error: 'x' }), 'delete the chart')).toMatch(/signed out/)
  })
  it('says try again for a 5xx and "can\'t reach the server" for a network failure', () => {
    expect(failureMessage(new ApiError(500, { error: 'x' }), 'delete the chart')).toBe("Couldn't delete the chart. Please try again.")
    expect(failureMessage(new TypeError('Failed to fetch'), 'delete the chart')).toMatch(/can't reach the server/)
  })
})
