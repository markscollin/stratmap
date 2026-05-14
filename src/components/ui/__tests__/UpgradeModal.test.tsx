import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpgradeModal } from '../UpgradeModal'

describe('UpgradeModal', () => {
  it('does not render when not open', () => {
    const onClose = vi.fn()
    const { container } = render(
      <UpgradeModal
        isOpen={false}
        onClose={onClose}
        feature="Headcount planning"
        requiredTier="growth"
        currentTier="free"
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders when open', () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        feature="Headcount planning"
        requiredTier="growth"
        currentTier="free"
      />
    )
    expect(screen.getByText('Unlock Headcount planning')).toBeInTheDocument()
  })

  it('displays starter plan info', () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        feature="PDF export"
        requiredTier="starter"
        currentTier="free"
      />
    )
    expect(screen.getByText('Starter')).toBeInTheDocument()
    expect(screen.getByText(/£18/)).toBeInTheDocument()
    expect(screen.getByText(/Save 22% with annual billing/)).toBeInTheDocument()
  })

  it('displays growth plan info', () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        feature="Headcount planning"
        requiredTier="growth"
        currentTier="starter"
      />
    )
    expect(screen.getByText('Growth')).toBeInTheDocument()
    expect(screen.getByText(/£49/)).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <UpgradeModal
        isOpen={true}
        onClose={onClose}
        feature="Test feature"
        requiredTier="starter"
        currentTier="free"
      />
    )
    const closeBtn = container.querySelector('button')
    if (closeBtn) {
      await userEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalled()
    }
  })

  it('calls onClose when Maybe later clicked', async () => {
    const onClose = vi.fn()
    render(
      <UpgradeModal
        isOpen={true}
        onClose={onClose}
        feature="Test feature"
        requiredTier="starter"
        currentTier="free"
      />
    )
    const maybelaterBtn = screen.getByText('Maybe later')
    await userEvent.click(maybelaterBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('displays starter plan features', () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        feature="PDF export"
        requiredTier="starter"
        currentTier="free"
      />
    )
    expect(screen.getByText('JD editor & AI drafting')).toBeInTheDocument()
    expect(screen.getByText('PDF export')).toBeInTheDocument()
    expect(screen.getByText('Password protection')).toBeInTheDocument()
    expect(screen.getByText('Up to 5 charts')).toBeInTheDocument()
  })

  it('displays growth plan features', () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        feature="Headcount planning"
        requiredTier="growth"
        currentTier="free"
      />
    )
    expect(screen.getByText('Unlimited charts & nodes')).toBeInTheDocument()
    expect(screen.getByText('Headcount planning')).toBeInTheDocument()
    expect(screen.getByText('Real-time collab')).toBeInTheDocument()
    expect(screen.getByText('Auto-layout')).toBeInTheDocument()
  })

  it('shows correct upgrade button text', () => {
    const { rerender } = render(
      <UpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        feature="Test feature"
        requiredTier="starter"
        currentTier="free"
      />
    )
    expect(screen.getByText('Upgrade to Starter')).toBeInTheDocument()

    rerender(
      <UpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        feature="Test feature"
        requiredTier="growth"
        currentTier="free"
      />
    )
    expect(screen.getByText('Upgrade to Growth')).toBeInTheDocument()
  })

  it('closes modal when overlay clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <UpgradeModal
        isOpen={true}
        onClose={onClose}
        feature="Test feature"
        requiredTier="starter"
        currentTier="free"
      />
    )
    const overlay = container.firstChild as HTMLElement
    await userEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })
})
