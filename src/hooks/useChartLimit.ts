import { useEffect } from 'react'
import { useBillingStore } from '../store/billingStore'
import { useChartStore, countOwnCharts } from '../store/chartStore'
import { useUserStore } from '../store/userStore'

export interface ChartLimit {
  /** Charts in the workspace that count toward the plan, i.e. all but the sample (once the list has loaded). */
  count: number
  /** The plan's chart limit, -1 for unlimited. */
  max: number
  loaded: boolean
  /** No room for another chart. */
  atLimit: boolean
  /**
   * More charts than the plan allows (after a downgrade): every chart is
   * view-only until enough are deleted or the workspace upgrades (roadmap 1.6).
   */
  frozen: boolean
}

/** Chart count against the plan, from the real chart list (fetched once if needed). */
export function useChartLimit(): ChartLimit {
  const max = useBillingStore(s => s.plan.maxCharts)
  const { charts, loaded, loading, error, fetchCharts } = useChartStore()
  const hasWorkspace = useUserStore(s => !!s.workspace)

  useEffect(() => {
    // Not after a failure: that retried in a tight loop (the load flipping loading back off re-ran this). The Retry button asks again.
    if (hasWorkspace && !loaded && !loading && !error) void fetchCharts()
  }, [hasWorkspace, loaded, loading, error, fetchCharts])

  // The sample chart is free and never counts (roadmap 2.7).
  const count = countOwnCharts(charts)
  const limited = max !== -1 && loaded
  return {
    count,
    max,
    loaded,
    atLimit: limited && count >= max,
    frozen: limited && count > max,
  }
}
