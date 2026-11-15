// The Export menu in the toolbar (split out of OrgChart.tsx, R-35).
import { useState } from 'react'
import { Download } from 'lucide-react'
import { PlanBadge, FeatureUpgradeModal } from '../../components/ui/FeatureLock'
import { usePlanLimits } from '../../hooks/usePlanLimits'

export function ExportBtn({ onExport }: { onExport: (format: 'png' | 'pdf' | 'csv') => void }) {
  const [open, setOpen] = useState(false)
  const [hov, setHov] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const pdfLocked = !usePlanLimits().hasFeature('pdf-export')
  return (
    <div style={{ position: 'relative' }}>
      <button
        title="Export"
        aria-label="Export"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: hov ? 'var(--nav-hover)' : 'transparent',
          border: '1px solid transparent',
          color: hov ? 'var(--text)' : 'var(--muted)',
          cursor: 'pointer', transition: 'all .12s',
        }}
      >
        <Download size={13} />
      </button>
      {open && (
        <>
          <div data-a11y-ok="click-away scrim behind a menu; its button closes it" style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 4, zIndex: 50,
            boxShadow: 'var(--shadow-sm)', minWidth: 150,
          }}>
            {(['png', 'pdf', 'csv'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => {
                  setOpen(false)
                  if (fmt === 'pdf' && pdfLocked) setShowUpgrade(true)
                  else onExport(fmt)
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left',
                  padding: '6px 10px', borderRadius: 5, border: 'none',
                  background: 'transparent', color: 'var(--text)',
                  fontSize: 12, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Export as {fmt.toUpperCase()}
                {fmt === 'pdf' && pdfLocked && <PlanBadge feature="pdf-export" />}
              </button>
            ))}
          </div>
        </>
      )}
      <FeatureUpgradeModal feature="pdf-export" isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  )
}

