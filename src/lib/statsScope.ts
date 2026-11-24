// R-57: the dashboard's headcount figures cover the live charts when there are any, otherwise every chart that is not archived
// or the sample. The label says which, so a figure is never read as "the whole org" when it is not.

export interface StatsScope { scope?: 'live' | 'all'; chartCount?: number }

/** "in 2 live charts" / "across 3 charts": says honestly what the headcount figures are about. */
export function statsScopeLabel(stats: StatsScope | null): string {
  if (!stats?.scope) return 'in your charts'
  const n = stats.chartCount ?? 0
  const charts = `${n} ${n === 1 ? 'chart' : 'charts'}`
  return stats.scope === 'live' ? `in ${n} live ${n === 1 ? 'chart' : 'charts'}` : `across ${charts}`
}
