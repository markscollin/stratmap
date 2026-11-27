// Launch review R-18: the landing page must not promise more than the product does, and must say which plan each feature is on.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from '../LandingPage'

const mount = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

describe('LandingPage', () => {
  it('marks which plan each feature is on', () => {
    mount()
    expect(screen.getAllByTestId('feature-plan').map(e => e.textContent)).toEqual(['Free', 'Starter and up', 'Growth'])
  })

  it('mentions the trial, and does not claim real-time sync or a "collaborative" editor that does not exist', () => {
    mount()
    expect(screen.getByText(/starts with 14 days of Growth/)).toBeTruthy()
    expect(screen.queryByText(/stay in sync/i)).toBeNull()
    expect(screen.queryByText(/collaborative org chart/i)).toBeNull()
  })
})

// R-62: a real picture of the product, a how-it-works strip, a pricing teaser and an FAQ, with numbers from plans.ts.
describe('LandingPage (R-62)', () => {
  it('shows the example chart in both themes, labelled as an example with made-up names', () => {
    mount()
    const imgs = screen.getAllByRole('img', { name: /example org chart/i })
    expect(imgs.map(i => i.getAttribute('src'))).toEqual(['/landing/chart-dark.png', '/landing/chart-light.png'])
    expect(imgs.map(i => i.className)).toEqual(['theme-dark-only', 'theme-light-only'])
    expect(screen.getByText(/names are made up/i)).toBeTruthy()
  })

  it('has how it works, a pricing teaser linking to /pricing, and the FAQ', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See plans and pricing' }).getAttribute('href')).toBe('/pricing')
    expect(screen.getAllByTestId('faq-item').length).toBeGreaterThanOrEqual(4)
  })

  it('takes every number from plans.ts', async () => {
    const { PLAN_LIMITS, PLAN_PRICES } = await import('../../lib/plans')
    mount()
    const teaser = screen.getByTestId('pricing-teaser').textContent ?? ''
    expect(teaser).toContain(`up to ${PLAN_LIMITS.free.maxNodesPerChart} roles`)
    expect(teaser).toContain(`£${PLAN_PRICES.starter.monthly} a month`)
    expect(teaser).toContain(`Growth £${PLAN_PRICES.growth.monthly}`)
    expect(teaser).toContain(`Scale £${PLAN_PRICES.scale.monthly}`)
  })

  it('no longer promises a chart that keeps itself current, and invents no social proof', () => {
    mount()
    expect(screen.queryByText(/not a slide that goes stale/i)).toBeNull()
    expect(screen.queryByText(/living document/i)).toBeNull()
    expect(screen.queryByText(/trusted by|customers love|testimonial/i)).toBeNull()
  })
})

// The pictures the page points at must exist (they are made by `npm run make:landing-images`).
describe('landing pictures', () => {
  it('are in public/landing', async () => {
    const fs = await import('node:fs')
    for (const t of ['dark', 'light']) expect(fs.existsSync(`public/landing/chart-${t}.png`)).toBe(true)
  })
})
