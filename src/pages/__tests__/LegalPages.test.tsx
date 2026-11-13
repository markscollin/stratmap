import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync, existsSync } from 'node:fs'
import { PrivacyPage, TermsPage } from '../LegalPages'
import { SUB_PROCESSORS } from '../../lib/subProcessors'
import { LEGAL, missingLegalDetails, type LegalDetails } from '../../lib/legalDetails'

const original: LegalDetails = { ...LEGAL }
afterEach(() => { Object.assign(LEGAL, original) })

const FILLED: LegalDetails = {
  companyName: 'Acme StratMap Ltd',
  address: '1 High Street, London, EC1A 1AA',
  privacyEmail: 'privacy@acme.test',
  legalEmail: 'legal@acme.test',
  governingLaw: 'England and Wales',
  refundPolicy: 'We refund the unused part of an annual plan within 14 days of purchase.',
  lastUpdated: '1 January 2027',
}

const text = (el: React.ReactElement) => {
  const { container } = render(<MemoryRouter>{el}</MemoryRouter>)
  return container.textContent ?? ''
}
const pages = () => [['Privacy Policy', <PrivacyPage key="p" />], ['Terms of Service', <TermsPage key="t" />]] as const

// Launch review R-04: an unfinished policy must never look finished, and a finished one must carry no template leftovers.
describe('legal pages while the owner has not filled in the details', () => {
  it('say so: the template banner and the bracketed placeholders are shown', () => {
    expect(missingLegalDetails()).toEqual(expect.arrayContaining(['companyName', 'privacyEmail', 'legalEmail', 'governingLaw']))
    for (const [name, page] of pages()) {
      const t = text(page)
      expect(t, name).toContain('Template notice')
      expect(t, name).toMatch(/\[[^\]]+\]/)
    }
  })
})

describe('legal pages once the details are filled in', () => {
  it('show no "Template notice" and no [placeholder] on either page', () => {
    Object.assign(LEGAL, FILLED)
    expect(missingLegalDetails()).toEqual([])
    for (const [name, page] of pages()) {
      const t = text(page)
      expect(t, name).not.toContain('Template notice')
      expect(t, name).not.toMatch(/\[[^\]]*\]/)
      expect(t, name).not.toMatch(/yourdomain|Company Legal Name/)
    }
  })

  it('use the owner\'s facts', () => {
    Object.assign(LEGAL, FILLED)
    const privacy = text(<PrivacyPage />)
    expect(privacy).toContain('Acme StratMap Ltd')
    expect(privacy).toContain('privacy@acme.test')
    expect(privacy).toContain('1 High Street, London, EC1A 1AA')
    expect(privacy).toContain('Last updated: 1 January 2027')
    const terms = text(<TermsPage />)
    expect(terms).toContain('legal@acme.test')
    expect(terms).toContain('governed by the laws of England and Wales')
    expect(terms).toContain('We refund the unused part of an annual plan')
  })

  it('a single missing field brings the banner back', () => {
    Object.assign(LEGAL, FILLED, { governingLaw: '  ' })
    expect(missingLegalDetails()).toEqual(['governingLaw'])
    expect(text(<TermsPage />)).toContain('Template notice')
  })
})

describe('the sub-processor list matches what the code actually uses', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }
  const deps = Object.keys(pkg.dependencies)
  const has = (re: RegExp) => deps.some(d => re.test(d))
  const names = SUB_PROCESSORS.map(p => p.name)

  it.each([
    ['Clerk', has(/^@clerk\//)],
    ['Neon', has(/^@neondatabase\//)],
    ['Stripe', has(/^stripe$/)],
    ['Resend', has(/^resend$/)],
    ['Anthropic', has(/^@anthropic-ai\//)],
    ['Sentry', has(/^@sentry\//)],
    ['Vercel', has(/^@vercel\//) || existsSync('vercel.json')],
    ['PostHog', readFileSync('api/_lib/analytics.ts', 'utf8').includes('posthog')], // plain fetch, no SDK
  ])('%s is used by the code', (name, used) => {
    expect(used, `${name} is no longer used: remove it from the policy`).toBe(true)
    expect(names).toContain(name)
  })

  it('lists no provider the code does not use', () => {
    expect(names.sort()).toEqual(['Anthropic', 'Clerk', 'Neon', 'PostHog', 'Resend', 'Sentry', 'Stripe', 'Vercel'])
  })

  it('every sub-processor is on the rendered Privacy Policy with what it receives', () => {
    const t = text(<PrivacyPage />)
    for (const p of SUB_PROCESSORS) {
      expect(t).toContain(p.name)
      expect(t).toContain(p.data.slice(0, 30))
    }
  })

  it('the retention text covers the 3-day copy of a deleted role', () => {
    expect(text(<PrivacyPage />)).toMatch(/3 days so that Undo/)
  })
})
