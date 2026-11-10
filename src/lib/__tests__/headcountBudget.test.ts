import { describe, it, expect } from 'vitest'
import { annualCost, buildBudget, buildBudgetCsv, formatMoney, parseQuarter, type BudgetPlan } from '../headcountBudget'

const plan = (id: string, targetQuarter: string, min: number | null, max: number | null, currency: string | null = 'USD'): BudgetPlan =>
  ({ id, title: `Hire ${id}`, targetQuarter, salaryMin: min, salaryMax: max, salaryCurrency: currency })

describe('parseQuarter', () => {
  it('reads "2026-Q3" and rejects anything else', () => {
    expect(parseQuarter('2026-Q3')).toEqual({ year: 2026, quarter: 3 })
    for (const bad of ['', '2026', '2026-Q5', '2026-q1', 'Q1-2026', '26-Q1']) expect(parseQuarter(bad), bad).toBeNull()
  })
})

describe('annualCost', () => {
  it('uses the middle of the range as the expected cost', () => {
    expect(annualCost(plan('a', '2026-Q1', 100_000, 140_000))).toEqual({ currency: 'USD', money: { low: 100_000, expected: 120_000, high: 140_000 } })
  })
  it('treats a single bound as the whole range, and tolerates swapped bounds', () => {
    expect(annualCost(plan('a', '2026-Q1', 90_000, null))!.money).toEqual({ low: 90_000, expected: 90_000, high: 90_000 })
    expect(annualCost(plan('a', '2026-Q1', null, 80_000))!.money.expected).toBe(80_000)
    expect(annualCost(plan('a', '2026-Q1', 140_000, 100_000))!.money).toEqual({ low: 100_000, expected: 120_000, high: 140_000 })
  })
  it('is null without a salary or without a currency', () => {
    expect(annualCost(plan('a', '2026-Q1', null, null))).toBeNull()
    expect(annualCost(plan('a', '2026-Q1', 100, 200, null))).toBeNull()
    expect(annualCost(plan('a', '2026-Q1', 100, 200, ' '))).toBeNull()
  })
  it('normalises the currency code', () => {
    expect(annualCost(plan('a', '2026-Q1', 1, 1, 'usd'))!.currency).toBe('USD')
  })
})

describe('buildBudget: a hire starts at the start of its target quarter', () => {
  it('Q1 hire costs a quarter of the yearly pay in every quarter, so a full year', () => {
    const b = buildBudget([plan('a', '2026-Q1', 120_000, 120_000)], 2026)
    expect(b.currencies[0].quarters.map(q => q.expected)).toEqual([30_000, 30_000, 30_000, 30_000])
    expect(b.currencies[0].year.expected).toBe(120_000)
  })
  it('Q2 hire costs Q2, Q3 and Q4 only: three quarters', () => {
    const c = buildBudget([plan('a', '2026-Q2', 120_000, 120_000)], 2026).currencies[0]
    expect(c.quarters.map(q => q.expected)).toEqual([0, 30_000, 30_000, 30_000])
    expect(c.year.expected).toBe(90_000)
    expect(c.annualised.expected).toBe(120_000)
  })
  it('Q4 hire costs one quarter in the year, but a full year as a run-rate', () => {
    const c = buildBudget([plan('a', '2026-Q4', 120_000, 120_000)], 2026).currencies[0]
    expect(c.quarters.map(q => q.expected)).toEqual([0, 0, 0, 30_000])
    expect(c.year.expected).toBe(30_000)
    expect(c.annualised.expected).toBe(120_000)
  })
  it('keeps low, expected and high separate and adds hires up', () => {
    const c = buildBudget([plan('a', '2026-Q1', 100_000, 140_000), plan('b', '2026-Q3', 80_000, 120_000)], 2026).currencies[0]
    expect(c.hires).toBe(2)
    expect(c.year).toEqual({ low: 100_000 + 40_000, expected: 120_000 + 50_000, high: 140_000 + 60_000 })
    expect(c.quarters[2].expected).toBe(30_000 + 25_000)
    expect(c.quarters[0]).toEqual({ low: 25_000, expected: 30_000, high: 35_000 })
    // the four quarters always add up to the year
    expect(c.quarters.reduce((s, q) => s + q.expected, 0)).toBeCloseTo(c.year.expected)
  })
})

describe('buildBudget: scope', () => {
  it('only counts hires targeted in the chosen year', () => {
    const plans = [plan('a', '2025-Q4', 100_000, 100_000), plan('b', '2026-Q1', 100_000, 100_000), plan('c', '2027-Q1', 100_000, 100_000)]
    const b = buildBudget(plans, 2026)
    expect(b.counted).toBe(1)
    expect(b.currencies[0].year.expected).toBe(100_000)
  })
  it('keeps currencies apart and never converts', () => {
    const b = buildBudget([plan('a', '2026-Q1', 100_000, 100_000, 'USD'), plan('b', '2026-Q1', 70_000, 70_000, 'gbp'), plan('c', '2026-Q1', 10_000, 10_000, 'USD')], 2026)
    expect(b.currencies.map(c => [c.currency, c.year.expected])).toEqual([['GBP', 70_000], ['USD', 110_000]])
  })
  it('lists hires with no salary as "no cost yet" and leaves them out of the totals', () => {
    const b = buildBudget([plan('a', '2026-Q1', 100_000, 100_000), plan('b', '2026-Q2', null, null), plan('c', '2026-Q2', 5, 5, null)], 2026)
    expect(b.counted).toBe(1)
    expect(b.uncosted.map(p => p.id)).toEqual(['b', 'c'])
    expect(b.currencies[0].year.expected).toBe(100_000)
  })
  it('an empty year has no currencies', () => {
    expect(buildBudget([], 2026)).toMatchObject({ currencies: [], counted: 0, uncosted: [] })
  })
  it('ignores plans with an unreadable quarter', () => {
    expect(buildBudget([plan('a', 'soon', 100, 100)], 2026)).toMatchObject({ counted: 0, uncosted: [] })
  })
})

describe('buildBudget: carrying earlier years over (opt-in)', () => {
  const plans = [plan('old', '2025-Q3', 120_000, 120_000), plan('now', '2026-Q3', 120_000, 120_000), plan('later', '2027-Q1', 120_000, 120_000), plan('oldfree', '2025-Q1', null, null)]
  it('is off by default: earlier and later years are ignored, exactly as before', () => {
    const b = buildBudget(plans, 2026)
    expect(b.counted).toBe(1)
    expect(b.currencies[0].year.expected).toBe(60_000)             // the 2026-Q3 hire: Q3 + Q4
    expect(b.uncosted).toEqual([])
  })
  it('on: an earlier hire costs a full year, a this-year hire is unchanged, later years still never count', () => {
    const b = buildBudget(plans, 2026, { carryOver: true })
    expect(b.counted).toBe(2)
    expect(b.currencies[0].quarters.map(q => q.expected)).toEqual([30_000, 30_000, 60_000, 60_000])   // old: 30k each quarter; now: Q3, Q4
    expect(b.currencies[0].year.expected).toBe(180_000)
    expect(b.currencies[0].annualised.expected).toBe(240_000)
    expect(b.currencies[0].hires).toBe(2)
  })
  it('on: an earlier hire with no salary is listed as no cost yet, like any other', () => {
    expect(buildBudget(plans, 2026, { carryOver: true }).uncosted.map(p => p.id)).toEqual(['oldfree'])
  })
  it('on, for 2027: both earlier hires are a full year and the 2027-Q1 hire is a full year too', () => {
    const b = buildBudget(plans, 2027, { carryOver: true })
    expect(b.currencies[0].year.expected).toBe(360_000)
  })
})

describe('formatting and CSV', () => {
  it('formats whole units with a currency code', () => {
    expect(formatMoney(1234567.4, 'USD')).toBe('USD 1,234,567')
  })
  it('writes a low/expected/high block per currency, and notes hires without a salary', () => {
    const csv = buildBudgetCsv(buildBudget([plan('a', '2026-Q2', 100_000, 140_000), plan('b', '2026-Q1', null, null)], 2026)).replace(/^\uFEFF/, '')
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Currency,Measure,Q1,Q2,Q3,Q4,Year,Full-year run-rate')
    expect(lines[1]).toBe('USD,Low,0,25000,25000,25000,75000,100000')
    expect(lines[2]).toBe('USD,Expected,0,30000,30000,30000,90000,120000')
    expect(lines[3]).toBe('USD,High,0,35000,35000,35000,105000,140000')
    expect(lines.at(-1)).toBe('1 hire(s) in 2026 have no salary yet and are not included.')
  })
})
