// Share and embed settings in the toolbar (split out of OrgChart.tsx, R-35).
import { useState } from 'react'
import { Share2, Check, Copy, Lock, Globe } from 'lucide-react'
import { useChartStore } from '../../store/chartStore'
import { useToastStore } from '../../store/toastStore'
import { api } from '../../lib/apiClient'
import { failureMessage } from '../../lib/failureMessage'

export function ShareSettingsBtn({ chartId, isPublic }: { chartId: string; isPublic: boolean }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const updateChartPublic = useChartStore(s => s.updateChartPublic)
  const showUpgrade = useToastStore(s => s.addToast)

  const isPlanGated = false // Starter+ gate — wire to billing store when ready

  const shareUrl = code ? `${window.location.origin}/share/${code}` : null
  const embedCode = code
    ? `<iframe src="${window.location.origin}/embed/${code}" title="Org chart" width="100%" height="600" style="border:0" loading="lazy"></iframe>`
    : null
  const [embedCopied, setEmbedCopied] = useState(false)
  const copyEmbed = async () => {
    if (!embedCode) return
    await navigator.clipboard.writeText(embedCode)
    setEmbedCopied(true)
    setTimeout(() => setEmbedCopied(false), 2000)
  }

  const fetchOrCreateCode = async () => {
    if (code) return code
    try {
      // Must go through apiClient so the Clerk bearer token is attached.
      const data = await api.post<{ code: string }>(`/api/charts/${chartId}/share`, {})
      setCode(data.code)
      return data.code
    } catch {
      return null
    }
  }

  const handleToggle = async () => {
    if (isPlanGated) {
      showUpgrade('Link sharing is available on Starter and above. Upgrade to enable.', 'info')
      return
    }
    setBusy(true)
    try {
      if (!isPublic) {
        const c = await fetchOrCreateCode()
        if (c) await updateChartPublic(chartId, true) // rolls itself back and says why if the server refuses (R-14)
        else useToastStore.getState().addToast("Couldn't create the share link. Please try again.", 'error')
      } else {
        // The link is revoked first; only then does the chart stop looking public. If the revoke fails it stays public and says so.
        await api.delete(`/api/charts/${chartId}/share`)
        setCode(null)
        await updateChartPublic(chartId, false)
      }
    } catch (err) {
      console.error('[share] toggle failed:', err)
      useToastStore.getState().addToast(failureMessage(err, 'change sharing'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleOpen = async () => {
    setOpen(o => !o)
    if (!open && isPublic && !code) {
      setBusy(true)
      try { await fetchOrCreateCode() } finally { setBusy(false) }
    }
  }

  const copy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        title="Share settings"
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: isPublic ? 'var(--brand-bg)' : 'transparent',
          border: isPublic ? '1px solid var(--brand)' : '1px solid transparent',
          color: isPublic ? 'var(--brand)' : 'var(--muted)',
          cursor: 'pointer', transition: 'all .12s',
        }}
        onMouseEnter={e => { if (!isPublic) (e.currentTarget as HTMLButtonElement).style.background = 'var(--nav-hover)' }}
        onMouseLeave={e => { if (!isPublic) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <Share2 size={13} />
      </button>
      {open && (
        <>
          <div data-a11y-ok="click-away scrim behind a menu; its button closes it" style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div
            data-canvas-overlay
            style={{
              position: 'absolute', top: 38, right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 16, zIndex: 50,
              boxShadow: 'var(--shadow)', minWidth: 300,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Share settings</p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>Control who can view this chart</p>
              </div>
              {isPlanGated && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--purple-bg)', color: 'var(--purple)' }}>Starter+</span>
              )}
            </div>

            {/* Toggle row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: 'var(--raised)', borderRadius: 8, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isPublic
                  ? <Globe size={14} color="var(--brand)" />
                  : <Lock size={14} color="var(--muted)" />
                }
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    {isPublic ? 'Public link active' : 'Private'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {isPublic ? 'Anyone with the link can view' : 'Only workspace members'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleToggle}
                disabled={busy}
                role="switch"
                aria-checked={isPublic}
                aria-label="Public link"
                data-testid="share-toggle"
                style={{
                  width: 38, height: 22, borderRadius: 11,
                  background: isPublic ? 'var(--brand)' : 'var(--dim)',
                  border: 'none', cursor: busy ? 'wait' : 'pointer',
                  position: 'relative', transition: 'background .2s',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <div style={{
                  position: 'absolute', top: 3, left: isPublic ? 19 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                }} />
              </button>
            </div>

            {/* Link display */}
            {isPublic && (
              <div>
                {shareUrl ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      readOnly
                      value={shareUrl}
                      data-testid="share-url"
                      onClick={e => (e.target as HTMLInputElement).select()}
                      style={{
                        flex: 1, fontSize: 11, padding: '6px 8px',
                        background: 'var(--raised)', border: '1px solid var(--border)',
                        borderRadius: 6, color: 'var(--muted)', outline: 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    />
                    <button
                      onClick={copy}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
                        background: copied ? 'var(--success-bg)' : 'var(--brand)',
                        border: 'none', borderRadius: 6,
                        color: copied ? 'var(--success)' : '#fff',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        transition: 'all .2s', whiteSpace: 'nowrap',
                      }}
                    >
                      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 8 }}>Generating link…</div>
                )}
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                  This is a live link — viewers always see the latest version.
                </p>
                {embedCode && (
                  <button
                    onClick={copyEmbed}
                    data-testid="copy-embed"
                    style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {embedCopied ? <><Check size={11} /> Embed code copied</> : <><Copy size={11} /> Copy embed code</>}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

