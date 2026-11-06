import { useState } from 'react'
import { Monitor, X } from 'lucide-react'

const KEY = 'stratmap_desktop_hint_dismissed'
const read = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }

/** Phones only (roadmap 2.8): pages that are designed for a desktop still work, but say so. Dismissed for the session. */
export function DesktopHint() {
  const [hidden, setHidden] = useState(read)
  if (hidden) return null
  return (
    <div
      role="note"
      data-testid="desktop-hint"
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--raised)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12 }}
    >
      <Monitor size={14} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>This page works best on a larger screen.</span>
      <button
        aria-label="Dismiss"
        onClick={() => { try { sessionStorage.setItem(KEY, '1') } catch { /* ignore */ } setHidden(true) }}
        style={{ background: 'transparent', border: 'none', color: 'var(--dim)', cursor: 'pointer', display: 'flex', padding: 2 }}
      ><X size={14} /></button>
    </div>
  )
}
