// R-42 item 3: the zoomed-out chip of a big chart is a button for the keyboard, like a full card.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeChip } from '../NodeChip'
import type { OrgNode } from '../../../types'

const node: OrgNode = { id: 'n1', name: 'Ada', title: 'CEO', departmentId: 'd1', managerId: null, status: 'active', employmentType: 'full-time', x: 0, y: 0 }

function setup() {
  const h = { onPointerDown: vi.fn(), onClick: vi.fn(), onDoubleClick: vi.fn(), onKeyDown: vi.fn(), onFocus: vi.fn() }
  render(<NodeChip node={node} colour="#0EA5E9" selected={false} connecting={false} isConnectTarget={false}
    ariaLabel="Ada, CEO, reports to nobody" {...h} />)
  return h
}

describe('NodeChip', () => {
  it('is a focusable button with a spoken name and carries the id the keyboard code looks up', () => {
    setup()
    const chip = screen.getByRole('button', { name: 'Ada, CEO, reports to nobody' })
    expect(chip).toHaveAttribute('data-node-id', 'n1')
    expect(chip).toHaveAttribute('tabindex', '0')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('is reached by Tab and passes key presses and focus to the canvas with its id', async () => {
    const h = setup()
    await userEvent.tab()
    const chip = screen.getByRole('button')
    expect(chip).toHaveFocus()
    expect(h.onFocus).toHaveBeenCalledWith(expect.anything(), 'n1')
    fireEvent.keyDown(chip, { key: 'Enter' })
    expect(h.onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }), 'n1')
  })

  it('reports selection to assistive technology', () => {
    render(<NodeChip node={node} colour="#000" selected connecting={false} isConnectTarget={false} ariaLabel="x"
      onPointerDown={vi.fn()} onClick={vi.fn()} onDoubleClick={vi.fn()} onKeyDown={vi.fn()} onFocus={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })
})
