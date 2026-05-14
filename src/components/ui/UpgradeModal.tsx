import { X, Zap, Lock } from 'lucide-react'
import type { PlanTier } from '../../types'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  onUpgrade?: () => void
  feature: string
  requiredTier: 'starter' | 'growth'
  currentTier: PlanTier
}

const TIER_INFO = {
  starter: {
    name: 'Starter',
    monthlyPrice: '£18',
    annualPrice: '£180',
    features: ['JD editor & AI drafting', 'PDF export', 'Password protection', 'Up to 5 charts'],
    icon: Lock,
    colour: '#0EA5E9',
  },
  growth: {
    name: 'Growth',
    monthlyPrice: '£49',
    annualPrice: '£490',
    features: ['Unlimited charts & nodes', 'Headcount planning', 'Real-time collab', 'Auto-layout'],
    icon: Zap,
    colour: '#8B5CF6',
  },
}

export function UpgradeModal({ isOpen, onClose, onUpgrade, feature, requiredTier, currentTier: _currentTier }: UpgradeModalProps) {
  if (!isOpen) return null

  const tierInfo = TIER_INFO[requiredTier]
  const Icon = tierInfo.icon

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid var(--border-hover)',
          padding: '32px 28px',
          width: 460,
          boxShadow: 'var(--shadow)',
          animation: 'nodePop .22s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: `${tierInfo.colour}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={24} color={tierInfo.colour} />
          </div>
        </div>

        {/* Heading */}
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 12, letterSpacing: '-.4px' }}>
          Unlock {feature}
        </h2>

        {/* Body text */}
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>
          {feature} is available on the {tierInfo.name} plan — unlock powerful collaboration and planning tools for your team.
        </p>

        {/* Plan card */}
        <div
          style={{
            background: 'var(--raised)',
            border: `1px solid var(--border)`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          {/* Plan header */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {tierInfo.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>
                {tierInfo.monthlyPrice}
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>/month</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 6, fontWeight: 600 }}>
              Save 22% with annual billing
            </p>
          </div>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tierInfo.features.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background: 'var(--success)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upgrade button */}
        <button
          onClick={() => {
            onClose()
            onUpgrade?.()
          }}
          style={{
            width: '100%',
            padding: '11px',
            background: `${tierInfo.colour}`,
            border: 'none',
            borderRadius: 9,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 12,
            transition: 'all .2s',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.opacity = '1'
          }}
        >
          Upgrade to {tierInfo.name}
        </button>

        {/* Maybe later link */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '10px',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
