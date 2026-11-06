import { Plus, Upload } from 'lucide-react'

/** Centre-of-canvas prompt for a chart with no roles yet (roadmap 2.7). Not part of exports. */
export function EmptyCanvasCard({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div
      data-testid="empty-canvas"
      data-export-ignore
      style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 15,
        width: 'min(420px, calc(100% - 32px))', textAlign: 'center',
        background: 'var(--surface)', border: '1px dashed var(--border-hover)', borderRadius: 16,
        padding: '28px 24px', boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>This chart is empty</h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
        Add your first role and connect people to who they report to, or import everyone from a spreadsheet in one go.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          data-testid="empty-add-role"
          onClick={onAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--grad-brand)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        ><Plus size={14} /> Add your first role</button>
        <button
          data-testid="empty-import"
          onClick={onImport}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        ><Upload size={14} /> Import people</button>
      </div>
    </div>
  )
}
