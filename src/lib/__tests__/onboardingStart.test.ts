import { describe, it, expect } from 'vitest'
import { onboardingStart } from '../onboardingStart'
import { buildChartTemplate } from '../chartTemplates'
import { PLAN_LIMITS } from '../plans'

describe('onboardingStart (R-80)', () => {
  it('small companies get the 5-role starter chart and no import nudge', () => {
    for (const size of ['1-10', '11-50'] as const) {
      expect(onboardingStart(size)).toMatchObject({ template: 'quickstart', roles: 5, suggestImport: false })
    }
  })

  it('companies of 51 and up are offered the import first and a fuller example', () => {
    for (const size of ['51-200', '201-1000', '1000+'] as const) {
      expect(onboardingStart(size)).toMatchObject({ template: 'scaleup', suggestImport: true })
    }
  })

  it("the role counts it states are the templates' real sizes, and fit the Free plan", () => {
    for (const size of ['1-10', '51-200'] as const) {
      const s = onboardingStart(size)
      const n = buildChartTemplate(s.template).nodes.length
      expect(n).toBe(s.roles)
      expect(n).toBeLessThanOrEqual(PLAN_LIMITS.free.maxNodesPerChart)
    }
  })
})
