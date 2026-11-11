import { useState } from 'react'
import { Download } from 'lucide-react'
import { buildBudget, buildBudgetCsv, formatMoney, type BudgetPlan, type Money } from '../../lib/headcountBudget'
import { downloadText } from '../../lib/csvSafe'

// Headcount budget by quarter (roadmap 5), shown to owners and admins only. The rules live in lib/headcountBudget.ts:
// a hire costs a quarter of its yearly pay from the start of its target quarter, totals are per currency (never converted),
// and hires with no salary are listed as "no cost yet" and left out.

const cell = { padding: '8px 10px', textAlign: 'right', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' } as const
const head = { ...cell, fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px' } as const

function Amount({ money, currency }: { money: Money; currency: string }) {
  const range = Math.round(money.low) !== Math.round(money.high)
  return (
    <>
      <div style={{ fontWeight: 600 }}>{formatMoney(money.expected, currency)}</div>
      {range && <div style={{ fontSize: 10, color: 'var(--dim)' }}>{Math.round(money.low).toLocaleString('en-US')}–{Math.round(money.high).toLocaleString('en-US')}</div>}
    </>
  )
}

export function BudgetPanel({ plans, year }: { plans: BudgetPlan[]; year: number }) {
  // Off by default: the budget is "hires targeted this year". On, earlier years' hires count as a full year each, which is
  // what next year's payroll looks like.
  const [carryOver, setCarryOver] = useState(false)
  const budget = buildBudget(plans, year, { carryOver })
  const hasHires = plans.some(p => p.targetQuarter.startsWith(String(year)))
  const hasEarlier = plans.some(p => { const y = Number(p.targetQuarter.slice(0, 4)); return Number.isFinite(y) && y < year })
  if (!hasHires && !hasEarlier) return null

  return (
    <section data-testid="headcount-budget" aria-label={`Headcount budget ${year}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Budget {year}</h2>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0', lineHeight: 1.5 }}>
            Each hire costs a quarter of its yearly pay from the start of its target quarter. The middle of the salary range is shown, with the range underneath. Only you and other admins see this.
          </p>
        </div>
        {budget.currencies.length > 0 && (
          <button
            onClick={() => downloadText(`headcount-budget-${year}${carryOver ? '-with-earlier-years' : ''}.csv`, buildBudgetCsv(budget))}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}
          >
            <Download size={11} /> Budget CSV
          </button>
        )}
      </div>

      {hasEarlier && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', margin: '0 0 8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={carryOver} onChange={e => setCarryOver(e.target.checked)} />
          Include hires from earlier years (a full year each)
        </label>
      )}

      {budget.currencies.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Add a salary range to a hire to see its cost here.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          {budget.currencies.map(c => (
            <table key={c.currency} data-testid={`budget-${c.currency}`} style={{ width: '100%', minWidth: 620, tableLayout: 'fixed', borderCollapse: 'collapse', marginBottom: 6 }}>
              <thead>
                <tr>
                  <th style={{ ...head, textAlign: 'left', width: 120 }}>{c.currency} · {c.hires} hire{c.hires === 1 ? '' : 's'}</th>
                  {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <th key={q} style={head}>{q}</th>)}
                  <th style={head}>{year} total</th>
                  <th style={head} title="What these hires cost over twelve months once they are all on board">Full-year run-rate</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...cell, textAlign: 'left', color: 'var(--muted)' }}>Spend</td>
                  {c.quarters.map((q, i) => <td key={i} style={cell} data-testid={`budget-${c.currency}-q${i + 1}`}><Amount money={q} currency={c.currency} /></td>)}
                  <td style={cell} data-testid={`budget-${c.currency}-year`}><Amount money={c.year} currency={c.currency} /></td>
                  <td style={cell} data-testid={`budget-${c.currency}-run`}><Amount money={c.annualised} currency={c.currency} /></td>
                </tr>
              </tbody>
            </table>
          ))}
        </div>
      )}

      {budget.uncosted.length > 0 && (
        <p data-testid="budget-uncosted" style={{ fontSize: 11, color: 'var(--warn)', margin: '8px 0 0', lineHeight: 1.5 }}>
          {budget.uncosted.length} hire{budget.uncosted.length === 1 ? ' has' : 's have'} no salary yet and {budget.uncosted.length === 1 ? 'is' : 'are'} not included: {budget.uncosted.slice(0, 4).map(p => p.title).join(', ')}{budget.uncosted.length > 4 ? ` and ${budget.uncosted.length - 4} more` : ''}.
        </p>
      )}
    </section>
  )
}
