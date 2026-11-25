// The currency salary fields start on (R-65): the one this browser last used for a salary (job description or planned hire),
// else GBP, the currency StratMap prices in. A convenience only: every saved salary carries its own currency.
const KEY = 'stratmap_headcount_currency' // the headcount form's key, kept so a currency already remembered there carries over
export const DEFAULT_SALARY_CURRENCY = 'GBP'

export function lastSalaryCurrency(): string {
  try { return localStorage.getItem(KEY) || DEFAULT_SALARY_CURRENCY } catch { return DEFAULT_SALARY_CURRENCY }
}

export function rememberSalaryCurrency(code: string): void {
  try { localStorage.setItem(KEY, code.trim().toUpperCase()) } catch { /* storage unavailable */ }
}
