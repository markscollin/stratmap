import { toCsv, type CsvCell } from './csvText'

// Headcount cost modelling (roadmap 5). Pure, so every rule is covered by tests.
//
// Owner-decided rules:
//  - A planned hire's cost is the salary range on its plan (min and max, whole units per year).
//  - A hire starts at the START of its target quarter: it costs a quarter of the yearly pay in that quarter and in every
//    later quarter of the same year (target 2026-Q2 -> Q2, Q3, Q4 = 3/4 of a year). The full year is also shown as a run-rate.
//  - Totals are per currency, never converted. A hire with no salary is left out of the totals and counted as "no cost yet".
//  - Planned, approved and filled hires all count. The budget covers hires TARGETED in the chosen year; hires from earlier
//    years are not carried over.
//  - Expected = the middle of the range. If only one bound is set, both are that value.

export interface BudgetPlan {
  id: string
  title: string
  targetQuarter: string             // "2026-Q2"
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
}

export interface Money { low: number; expected: number; high: number }
const ZERO: Money = { low: 0, expected: 0, high: 0 }
const add = (a: Money, b: Money): Money => ({ low: a.low + b.low, expected: a.expected + b.expected, high: a.high + b.high })
const scale = (m: Money, f: number): Money => ({ low: m.low * f, expected: m.expected * f, high: m.high * f })

export interface CurrencyBudget {
  currency: string
  /** Spend in Q1..Q4 of the year. */
  quarters: [Money, Money, Money, Money]
  /** Total spend inside the year. */
  year: Money
  /** What these hires cost over a full twelve months (the run-rate once they are all on board). */
  annualised: Money
  hires: number
}

export interface Budget {
  year: number
  currencies: CurrencyBudget[]
  /** Hires counted in the totals. */
  counted: number
  /** Hires in this year with no usable salary (no cost yet), by plan id. */
  uncosted: BudgetPlan[]
}

/** "2026-Q2" -> { year: 2026, quarter: 2 }, or null for anything else. */
export function parseQuarter(value: string): { year: number; quarter: 1 | 2 | 3 | 4 } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(value)
  return m ? { year: Number(m[1]), quarter: Number(m[2]) as 1 | 2 | 3 | 4 } : null
}

/** The yearly cost of one plan, or null when it has no salary or no currency. */
export function annualCost(plan: BudgetPlan): { currency: string; money: Money } | null {
  const currency = plan.salaryCurrency?.trim().toUpperCase()
  const { salaryMin: min, salaryMax: max } = plan
  if (!currency || (min == null && max == null)) return null
  const low = Math.min(min ?? max!, max ?? min!)
  const high = Math.max(min ?? max!, max ?? min!)
  return { currency, money: { low, expected: (low + high) / 2, high } }
}

export function buildBudget(plans: BudgetPlan[], year: number): Budget {
  const byCurrency = new Map<string, CurrencyBudget>()
  const uncosted: BudgetPlan[] = []
  let counted = 0

  for (const plan of plans) {
    const q = parseQuarter(plan.targetQuarter)
    if (!q || q.year !== year) continue
    const cost = annualCost(plan)
    if (!cost) { uncosted.push(plan); continue }

    const entry = byCurrency.get(cost.currency)
      ?? { currency: cost.currency, quarters: [ZERO, ZERO, ZERO, ZERO] as CurrencyBudget['quarters'], year: ZERO, annualised: ZERO, hires: 0 }
    const perQuarter = scale(cost.money, 1 / 4)
    for (let i = q.quarter - 1; i < 4; i++) entry.quarters[i] = add(entry.quarters[i], perQuarter)
    entry.year = add(entry.year, scale(cost.money, (5 - q.quarter) / 4))
    entry.annualised = add(entry.annualised, cost.money)
    entry.hires++
    byCurrency.set(cost.currency, entry)
    counted++
  }

  return { year, currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)), counted, uncosted }
}

/** "USD 1,234" (no decimals: these are planning figures). */
export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString('en-US')}`
}

export const BUDGET_CSV_HEADERS = ['Currency', 'Measure', 'Q1', 'Q2', 'Q3', 'Q4', 'Year', 'Full-year run-rate'] as const

/** The budget as a CSV, one block of three rows (low, expected, high) per currency. */
export function buildBudgetCsv(budget: Budget): string {
  const rows: CsvCell[][] = [[...BUDGET_CSV_HEADERS]]
  for (const c of budget.currencies) {
    for (const [label, key] of [['Low', 'low'], ['Expected', 'expected'], ['High', 'high']] as const) {
      rows.push([c.currency, label, ...c.quarters.map(q => Math.round(q[key])), Math.round(c.year[key]), Math.round(c.annualised[key])])
    }
  }
  if (budget.uncosted.length > 0) rows.push([], [`${budget.uncosted.length} hire(s) in ${budget.year} have no salary yet and are not included.`])
  return toCsv(rows)
}
