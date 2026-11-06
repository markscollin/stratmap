import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChartConflictBanner } from '../ChartConflictBanner'
import { useChartConflict, resetChartRevisions } from '../../../lib/chartRevision'

describe('ChartConflictBanner', () => {
  beforeEach(() => resetChartRevisions())

  it('is hidden until this chart has a conflict', () => {
    render(<ChartConflictBanner chartId="c1" onReload={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores a conflict on another chart', () => {
    useChartConflict.getState().flag('c2')
    render(<ChartConflictBanner chartId="c1" onReload={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says the chart changed and that the last edit was lost, and reloads on click', () => {
    useChartConflict.getState().flag('c1')
    const onReload = vi.fn()
    render(<ChartConflictBanner chartId="c1" onReload={onReload} />)
    expect(screen.getByRole('alert').textContent).toMatch(/changed elsewhere/i)
    expect(screen.getByRole('alert').textContent).toMatch(/not saved/i)
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(onReload).toHaveBeenCalled()
  })
})
