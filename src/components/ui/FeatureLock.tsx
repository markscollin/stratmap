import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { UpgradeModal } from './UpgradeModal'
import { usePlanLimits } from '../../hooks/usePlanLimits'
import { PAID_FEATURES, type PaidFeature } from '../../lib/plans'

const TIER_NAME = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' } as const

/** Small "🔒 Starter" pill marking a locked control. */
export function PlanBadge({ feature }: { feature: PaidFeature }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 10, background: 'var(--brand-bg)', color: 'var(--brand)', fontSize: 10, fontWeight: 700, letterSpacing: '.2px', whiteSpace: 'nowrap' }}>
      <Lock size={9} /> {TIER_NAME[PAID_FEATURES[feature].minTier]}
    </span>
  )
}

/** The upgrade modal pre-filled with what `feature` unlocks. "Upgrade" goes to /pricing. */
export function FeatureUpgradeModal({ feature, isOpen, onClose }: { feature: PaidFeature; isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { currentTier } = usePlanLimits()
  const info = PAID_FEATURES[feature]
  return (
    <UpgradeModal
      isOpen={isOpen}
      onClose={onClose}
      onUpgrade={() => navigate('/pricing')}
      feature={info.label}
      description={info.unlocks}
      requiredTier={info.minTier === 'enterprise' ? 'growth' : info.minTier}
      currentTier={currentTier}
    />
  )
}

/**
 * Inline card shown where a locked feature would be: names the feature, says
 * what upgrading unlocks and which plan includes it, with a button to see plans.
 */
export function LockedFeatureCard({ feature, children }: { feature: PaidFeature; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const info = PAID_FEATURES[feature]
  return (
    <div data-testid={`locked-${feature}`} style={{ background: 'var(--raised)', border: '1px dashed var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Lock size={14} color="var(--brand)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{info.label}</span>
        <PlanBadge feature={feature} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{info.unlocks}</p>
      {children}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        style={{ marginTop: 12, padding: '7px 14px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        Unlock with {TIER_NAME[info.minTier]}
      </button>
      <FeatureUpgradeModal feature={feature} isOpen={open} onClose={() => setOpen(false)} />
    </div>
  )
}
