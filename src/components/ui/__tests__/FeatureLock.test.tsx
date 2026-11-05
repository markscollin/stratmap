import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LockedFeatureCard, PlanBadge } from '../FeatureLock'
import { PAID_FEATURES } from '../../../lib/plans'

describe('FeatureLock', () => {
  it('PlanBadge names the plan that unlocks the feature', () => {
    render(<PlanBadge feature="pdf-export" />)
    expect(screen.getByText('Starter')).toBeInTheDocument()
  })

  it('LockedFeatureCard says what the feature does and opens the upgrade modal with that copy', () => {
    render(<MemoryRouter><LockedFeatureCard feature="pdf-export" /></MemoryRouter>)
    expect(screen.getByText('PDF export')).toBeInTheDocument()
    expect(screen.getByText(PAID_FEATURES['pdf-export'].unlocks)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with Starter' }))
    expect(screen.getByText('Unlock PDF export')).toBeInTheDocument()
    expect(screen.getByText(/Included in the Starter plan and above/)).toBeInTheDocument()
  })
})
