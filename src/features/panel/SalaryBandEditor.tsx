import { useState } from 'react'

export const SALARY_CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'SGD', 'AED']

export interface SalaryBandChange { salaryBandMin?: number | null; salaryBandMax?: number | null; salaryCurrency?: string }

/**
 * Min / max / currency of a role's salary band (launch review R-12). It used to save on every keystroke: typing "120000" sent
 * six requests that could land out of order, each one an audit row, and clearing a box sent nothing at all. Now the text is held
 * here and saved once, on blur or Enter; a cleared box sends `null`; and a min above the max is refused before it is sent.
 * Remount it (change its `key`) when the saved values change, so the boxes show what is stored.
 */
export function SalaryBandEditor({ min, max, currency, onChange }: {
  min: number | undefined
  max: number | undefined
  currency: string | undefined
  onChange: (changes: SalaryBandChange) => void
}) {
  const [minText, setMinText] = useState(min === undefined ? '' : String(min))
  const [maxText, setMaxText] = useState(max === undefined ? '' : String(max))
  const [error, setError] = useState<string | null>(null)

  // '' → null (clear), a whole number ≥ 0 → that number, anything else → undefined (invalid)
  const parse = (text: string): number | null | undefined => {
    const t = text.trim()
    if (t === '') return null
    if (!/^\d+$/.test(t)) return undefined
    const n = Number(t)
    return n <= 100_000_000 ? n : undefined
  }

  const commit = (which: 'min' | 'max') => {
    const mine = parse(which === 'min' ? minText : maxText)
    const other = parse(which === 'min' ? maxText : minText)
    if (mine === undefined) { setError('Enter a whole number, for example 85000.'); return }
    const lo = which === 'min' ? mine : other
    const hi = which === 'min' ? other : mine
    if (typeof lo === 'number' && typeof hi === 'number' && lo > hi) { setError("The minimum can't be above the maximum."); return }
    setError(null)
    const stored = which === 'min' ? min : max
    if ((mine ?? undefined) === stored) return // nothing changed: send nothing
    onChange(which === 'min' ? { salaryBandMin: mine } : { salaryBandMax: mine })
  }

  const inputStyle: React.CSSProperties = {
    flex: 1, fontSize: 13, padding: '6px 8px', background: 'var(--bg)',
    border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 6, color: 'var(--text)', outline: 'none', width: '100%',
  }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur() }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="salary-min" style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Min</label>
          <input id="salary-min" type="text" inputMode="numeric" placeholder="0" value={minText} aria-invalid={!!error}
            onChange={e => setMinText(e.target.value)} onBlur={() => commit('min')} onKeyDown={onKey} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="salary-max" style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Max</label>
          <input id="salary-max" type="text" inputMode="numeric" placeholder="0" value={maxText} aria-invalid={!!error}
            onChange={e => setMaxText(e.target.value)} onBlur={() => commit('max')} onKeyDown={onKey} style={inputStyle} />
        </div>
        <div style={{ width: 80 }}>
          <label htmlFor="salary-currency" style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Currency</label>
          <select id="salary-currency" value={currency ?? 'USD'} onChange={e => onChange({ salaryCurrency: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
            {SALARY_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
      {!error && min !== undefined && max !== undefined && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{currency ?? 'USD'} {min.toLocaleString()} – {max.toLocaleString()}</div>
      )}
    </div>
  )
}
