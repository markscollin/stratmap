import { useState } from 'react'
import { Link } from 'react-router-dom'

const CONSENT_KEY = 'stratmap_cookie_consent'

function getStoredConsent(): string | null {
  try { return localStorage.getItem(CONSENT_KEY) } catch { return null }
}

function storeConsent(value: 'all' | 'necessary') {
  try { localStorage.setItem(CONSENT_KEY, value) } catch { /* ignore */ }
}

export function CookieConsent() {
  const [dismissed, setDismissed] = useState(() => getStoredConsent() !== null)

  if (dismissed) return null

  const choose = (value: 'all' | 'necessary') => {
    storeConsent(value)
    setDismissed(true)
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 1000,
        maxWidth: 560, margin: '0 auto',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--shadow-lg, 0 10px 40px rgba(0,0,0,.3))',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
        We use strictly necessary cookies to run StratMap, and optional analytics cookies to improve it. See our{' '}
        <Link to="/privacy" style={{ color: 'var(--brand)', textDecoration: 'none' }}>Privacy Policy</Link>.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => choose('necessary')}
          style={{
            padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Necessary only
        </button>
        <button
          onClick={() => choose('all')}
          style={{
            padding: '8px 14px', background: 'var(--grad-brand)', border: 'none',
            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Accept all
        </button>
      </div>
    </div>
  )
}
