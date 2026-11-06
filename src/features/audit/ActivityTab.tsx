import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient'
import { describeAudit, type AuditEventView } from '../../lib/auditText'
import { downloadText } from '../../lib/csvSafe'
import { usePlanLimits } from '../../hooks/usePlanLimits'
import { LockedFeatureCard } from '../../components/ui/FeatureLock'

// Settings → Activity (roadmap 4.4). Owners and admins see who changed members, permissions, invites,
// sharing and salary bands, newest first. Salary amounts are never recorded. The CSV download is Enterprise.

interface Page { events: AuditEventView[]; nextBefore: string | null }

export function ActivityTab() {
  const { hasFeature } = usePlanLimits()
  const canExport = hasFeature('audit-export')
  const [events, setEvents] = useState<AuditEventView[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback((before?: string) =>
    api.get<Page>(`/api/workspace/audit?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`), [])

  const fail = (err: unknown) => setError(err instanceof ApiError ? err.userMessage : 'Could not load the activity log')

  // First page (starts in the loading state already).
  useEffect(() => {
    fetchPage()
      .then(page => { setEvents(page.events); setNext(page.nextBefore) })
      .catch(fail)
      .finally(() => setLoading(false))
  }, [fetchPage])

  function loadOlder(before: string) {
    setLoading(true)
    setError(null)
    fetchPage(before)
      .then(page => { setEvents(prev => [...prev, ...page.events]); setNext(page.nextBefore) })
      .catch(fail)
      .finally(() => setLoading(false))
  }

  async function exportCsv() {
    try {
      downloadText('audit-log.csv', await api.getText('/api/workspace/audit?format=csv'))
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : 'Could not download the log')
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Activity</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Who changed members, roles, invites, sharing and salary bands. Salary amounts are never recorded.
            </p>
          </div>
          {canExport && (
            <button onClick={() => void exportCsv()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              <Download size={13} /> Export CSV
            </button>
          )}
        </div>

        {!canExport && <LockedFeatureCard feature="audit-export" />}

        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

        {!loading && !error && events.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nothing yet. Changes to members, sharing and salary bands will show up here.</p>
        )}

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map(e => (
            <li key={e.id} data-testid="audit-event" style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{describeAudit(e)}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{new Date(e.createdAt).toLocaleString()}</div>
            </li>
          ))}
        </ul>

        {loading && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</p>}
        {next && !loading && (
          <button onClick={() => loadOlder(next)} style={{ marginTop: 12, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Load older
          </button>
        )}
      </div>
    </div>
  )
}
