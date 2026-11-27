import type { CompanySize } from '../types'

// R-80: the onboarding question "How many people work there?" used to be stored and never used. It now picks how a new
// workspace starts: a small company gets the 5-role starter chart; a bigger one gets a fuller example structure and is
// offered the import first, because nobody should draw 50+ people by hand. Pure, so the rules are tested on their own.

export interface OnboardingStart {
  /** The chart template "Quick start" creates. */
  template: 'quickstart' | 'scaleup'
  /** How many roles that template has, for the button's description. */
  roles: number
  /** What the starter chart holds, in words. */
  summary: string
  /** Offer "Import your people" ahead of the starter chart. */
  suggestImport: boolean
}

const SMALL: OnboardingStart = {
  template: 'quickstart', roles: 5, suggestImport: false,
  summary: 'a CEO with a CTO, a CPO, a Head of Sales and a Head of Ops',
}
const LARGER: OnboardingStart = {
  template: 'scaleup', roles: 13, suggestImport: true,
  summary: 'a leadership team and four functions with their first reports',
}

export function onboardingStart(size: CompanySize): OnboardingStart {
  return size === '1-10' || size === '11-50' ? SMALL : LARGER
}
