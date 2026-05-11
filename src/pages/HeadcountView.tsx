import { BarChart2, Sparkles } from 'lucide-react'

export function HeadcountView() {
  return (
    <div style={{ padding: 32, animation: 'fadeUp .3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px' }}>Headcount</h1>
        <span style={{
          padding: '2px 10px', borderRadius: 20,
          background: 'var(--purple-bg)', border: '1px solid rgba(139,92,246,.3)',
          fontSize: 10, fontWeight: 700, color: 'var(--purple)', letterSpacing: '.5px',
        }}>GROWTH</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Plan your hiring by quarter, department, and budget</p>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '44px 40px', textAlign: 'center',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'var(--purple-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px',
        }}>
          <BarChart2 size={28} color="var(--purple)" />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Headcount planning is coming</h3>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 460, margin: '0 auto 28px' }}>
          Plan every hire by quarter. Mark roles as New Headcount, Backfill, or Contractor. Route approvals through your finance team.
        </p>
        <button style={{
          padding: '10px 22px',
          background: 'var(--grad-purple)', border: 'none', borderRadius: 9,
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 7,
          boxShadow: '0 4px 16px rgba(139,92,246,.3)',
        }}>
          <Sparkles size={14} /> Upgrade to Growth
        </button>
      </div>
    </div>
  )
}
