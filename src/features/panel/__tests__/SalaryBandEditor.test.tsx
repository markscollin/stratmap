// Launch review R-12: the salary band saved on every keystroke and could not be cleared.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SalaryBandEditor } from '../SalaryBandEditor'

const setup = (props: Partial<React.ComponentProps<typeof SalaryBandEditor>> = {}) => {
  const onChange = vi.fn()
  render(<SalaryBandEditor min={undefined} max={undefined} currency="USD" onChange={onChange} {...props} />)
  return { onChange, min: screen.getByLabelText('Min') as HTMLInputElement, max: screen.getByLabelText('Max') as HTMLInputElement }
}
const type = (el: HTMLInputElement, v: string) => fireEvent.change(el, { target: { value: v } })

describe('SalaryBandEditor', () => {
  it('sends nothing while typing, and one change when the box loses focus', () => {
    const { onChange, min } = setup()
    for (const v of ['1', '12', '120', '1200', '12000', '120000']) type(min, v)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(min)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ salaryBandMin: 120000 })
  })

  it('Enter saves too', () => {
    const { onChange, max } = setup()
    type(max, '90000')
    fireEvent.keyDown(max, { key: 'Enter' })
    // jsdom's blur() on the focused element fires the blur handler only if focused
    max.focus(); fireEvent.keyDown(max, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith({ salaryBandMax: 90000 })
  })

  it('clearing a box sends null (it used to send nothing, so it never cleared)', () => {
    const { onChange, min } = setup({ min: 50000 })
    type(min, '')
    fireEvent.blur(min)
    expect(onChange).toHaveBeenCalledWith({ salaryBandMin: null })
  })

  it('sends nothing when the value did not change', () => {
    const { onChange, min } = setup({ min: 50000 })
    fireEvent.focus(min); fireEvent.blur(min)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses a minimum above the maximum, shows why, and sends nothing', () => {
    const { onChange, min } = setup({ max: 80000 })
    type(min, '90000')
    fireEvent.blur(min)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent("minimum can't be above the maximum")
  })

  it('refuses text that is not a whole number', () => {
    const { onChange, min } = setup()
    type(min, '12.5k')
    fireEvent.blur(min)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('whole number')
  })

  it('changing the currency saves at once', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'GBP' } })
    expect(onChange).toHaveBeenCalledWith({ salaryCurrency: 'GBP' })
  })
})
