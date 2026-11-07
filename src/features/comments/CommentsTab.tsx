import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/apiClient'
import { useUserStore } from '../../store/userStore'
import { usePermission } from '../../hooks/usePermission'
import {
  activeMentionQuery, groupThreads, insertMention, matchMembers, mentionIds, splitMentions, timeAgo,
  type Mentionable, type RoleComment, type Thread,
} from '../../lib/comments'

// The Comments tab of a role's side panel (roadmap 5). Commenters and above can write; everyone can read.
// Threads (a comment and its replies), @mentions of workspace members, resolve/reopen, edit your own comment, delete your
// own (admins can delete any). The server enforces every rule; this screen makes them easy to follow.

const MAX = 2000
const small = { fontSize: 11, color: 'var(--dim)' } as const
const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--muted)' } as const

function Composer({ members, placeholder, submitLabel, initialText = '', initialPicked, autoFocus, onSubmit, onCancel }: {
  members: Mentionable[]
  placeholder: string
  submitLabel: string
  initialText?: string
  initialPicked?: Map<string, string>
  autoFocus?: boolean
  /** Resolves true when it worked. On false (an error) the text is kept so nothing the person wrote is lost. */
  onSubmit: (body: string, mentions: string[]) => Promise<boolean>
  onCancel?: () => void
}) {
  const [text, setText] = useState(initialText)
  const [picked, setPicked] = useState<Map<string, string>>(initialPicked ?? new Map())
  const [caret, setCaret] = useState(initialText.length)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  const mention = activeMentionQuery(text, caret)
  const options = useMemo(() => (mention ? matchMembers(members, mention.query) : []), [members, mention])
  const tooLong = text.length > MAX
  const canSend = text.trim() !== '' && !tooLong && !busy

  function pick(m: Mentionable) {
    if (!mention) return
    const next = insertMention(text, mention, caret, m.name)
    setText(next.text)
    setPicked(p => new Map(p).set(m.id, m.name))
    setCaret(next.caret)
    setActive(0)
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(next.caret, next.caret) })
  }

  async function send() {
    if (!canSend) return
    setBusy(true)
    try {
      if (await onSubmit(text.trim(), mentionIds(text, picked))) { setText(''); setPicked(new Map()); setCaret(0) }
    } finally { setBusy(false) }
  }

  return (
    <div data-testid="comment-composer" style={{ position: 'relative' }}>
      <textarea
        ref={ref} autoFocus={autoFocus} value={text} rows={3} placeholder={placeholder} aria-label={placeholder}
        onChange={e => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setActive(0) }}
        onSelect={e => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={e => {
          if (options.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setActive(a => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
          } else if (options.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault(); pick(options[active] ?? options[0])
          } else if (e.key === 'Escape' && mention) {
            e.preventDefault(); setCaret(0)
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault(); void send()
          }
        }}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', fontSize: 12, lineHeight: 1.5, fontFamily: 'inherit', background: 'var(--input-bg)', border: `1px solid ${tooLong ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text)' }}
      />
      {options.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" style={{ position: 'absolute', left: 0, right: 0, top: '100%', margin: '-34px 0 0', padding: 4, listStyle: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', zIndex: 5 }}>
          {options.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active} data-testid="mention-option"
              onMouseDown={e => { e.preventDefault(); pick(m) }}
              style={{ padding: '6px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text)', background: i === active ? 'var(--nav-hover)' : 'transparent' }}>
              {m.name}
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span style={{ ...small, color: tooLong ? 'var(--danger)' : 'var(--dim)', flex: 1 }}>
          {text.length > MAX - 200 ? `${text.length} / ${MAX}` : 'Type @ to mention a teammate'}
        </span>
        {onCancel && <button type="button" onClick={onCancel} style={{ ...linkBtn, padding: '6px 10px' }}>Cancel</button>}
        <button type="button" onClick={() => void send()} disabled={!canSend}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, cursor: canSend ? 'pointer' : 'default', background: canSend ? 'var(--grad-brand)' : 'var(--raised)', color: canSend ? '#fff' : 'var(--dim)' }}>
          {busy ? 'Sending…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

export function CommentsTab({ chartId, nodeId, onChanged }: { chartId: string; nodeId: string; onChanged?: () => void }) {
  const { user, workspace } = useUserStore()
  const { canComment, canAdmin } = usePermission()
  const me = user?.id ?? ''

  const [comments, setComments] = useState<RoleComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const members: Mentionable[] = useMemo(
    () => (workspace?.members ?? []).filter(m => m.user.id !== me).map(m => ({ id: m.user.id, name: m.user.name || m.user.email })),
    [workspace?.members, me],
  )
  const nameOf = useMemo(() => new Map((workspace?.members ?? []).map(m => [m.user.id, m.user.name || m.user.email])), [workspace?.members])

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ comments: RoleComment[] }>(`/api/charts/${chartId}/comments?nodeId=${encodeURIComponent(nodeId)}`)
      setComments(r.comments)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : 'Could not load the comments')
    } finally { setLoading(false) }
  }, [chartId, nodeId])

  useEffect(() => {
    let alive = true
    api.get<{ comments: RoleComment[] }>(`/api/charts/${chartId}/comments?nodeId=${encodeURIComponent(nodeId)}`)
      .then(r => { if (alive) { setComments(r.comments); setError(null) } })
      .catch(err => { if (alive) setError(err instanceof ApiError ? err.userMessage : 'Could not load the comments') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [chartId, nodeId])

  /** Runs a change, reloads the thread and tells the canvas. Returns whether it worked (an error is shown instead). */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null)
    try { await action(); await load(); onChanged?.(); return true }
    catch (err) { setError(err instanceof ApiError ? err.userMessage : 'Something went wrong. Please try again.'); return false }
  }

  async function post(body: string, mentions: string[], parentId?: string): Promise<boolean> {
    const ok = await run(() => api.post(`/api/charts/${chartId}/comments`, { nodeId, body, mentions, ...(parentId ? { parentId } : {}) }))
    if (ok && parentId) setReplyTo(null)
    return ok
  }

  const threads = groupThreads(comments)
  const open = threads.filter(t => !t.top.resolved)
  const resolved = threads.filter(t => t.top.resolved)

  // Plain render functions (not nested components), so a half-typed reply keeps its place when anything else updates.
  function renderEntry(c: RoleComment, isTop: boolean) {
    const mine = c.authorId === me
    const mentionNames = c.mentions.map(id => nameOf.get(id)).filter((n): n is string => !!n)
    if (c.deleted) return <div key={c.id} data-testid="comment" style={{ ...small, fontStyle: 'italic', padding: '6px 0' }}>This comment was deleted.</div>
    if (editing === c.id) {
      return (
        <Composer key={c.id} members={members} placeholder="Edit your comment" submitLabel="Save" initialText={c.body}
          initialPicked={new Map(c.mentions.flatMap(id => (nameOf.get(id) ? [[id, nameOf.get(id)!] as [string, string]] : [])))}
          autoFocus onCancel={() => setEditing(null)}
          onSubmit={async (body, mentions) => {
            const ok = await run(() => api.put(`/api/charts/${chartId}/comments/${c.id}`, { body, mentions }))
            if (ok) setEditing(null)
            return ok
          }} />
      )
    }
    return (
      <div key={c.id} data-testid="comment" style={{ padding: '6px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{c.authorName ?? 'A former member'}</span>
          <span style={small} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</span>
          {c.editedAt && <span style={small} title={new Date(c.editedAt).toLocaleString()}>edited</span>}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 2 }}>
          {splitMentions(c.body, mentionNames).map((p, i) => p.mention
            ? <span key={i} style={{ color: 'var(--brand)', fontWeight: 600 }}>{p.text}</span>
            : <span key={i}>{p.text}</span>)}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {canComment && isTop && <button style={linkBtn} onClick={() => { setReplyTo(c.id) }}>Reply</button>}
          {canComment && isTop && !c.resolved && <button style={linkBtn} onClick={() => void run(() => api.put(`/api/charts/${chartId}/comments/${c.id}`, { resolved: true }))}>Resolve</button>}
          {canComment && mine && <button style={linkBtn} onClick={() => setEditing(c.id)}>Edit</button>}
          {(mine || canAdmin) && (confirmDelete === c.id
            ? <>
                <button style={{ ...linkBtn, color: 'var(--danger)' }} onClick={() => { setConfirmDelete(null); void run(() => api.delete(`/api/charts/${chartId}/comments/${c.id}`)) }}>Delete for everyone</button>
                <button style={linkBtn} onClick={() => setConfirmDelete(null)}>Keep</button>
              </>
            : <button style={linkBtn} onClick={() => setConfirmDelete(c.id)}>Delete</button>)}
        </div>
      </div>
    )
  }

  function renderThread(t: Thread) {
    return (
      <div key={t.top.id} data-testid="comment-thread" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '6px 12px', marginBottom: 10, background: t.top.resolved ? 'var(--raised)' : 'var(--surface)', opacity: t.top.resolved ? 0.85 : 1 }}>
        {renderEntry(t.top, true)}
        {t.replies.length > 0 && (
          <div style={{ marginLeft: 10, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
            {t.replies.map(r => renderEntry(r, false))}
          </div>
        )}
        {t.top.resolved && (
          <div style={{ ...small, padding: '4px 0 6px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>Resolved{t.top.resolvedBy && nameOf.get(t.top.resolvedBy) ? ` by ${nameOf.get(t.top.resolvedBy)}` : ''}</span>
            {canComment && <button style={linkBtn} onClick={() => void run(() => api.put(`/api/charts/${chartId}/comments/${t.top.id}`, { resolved: false }))}>Reopen</button>}
          </div>
        )}
        {replyTo === t.top.id && canComment && (
          <div style={{ margin: '6px 0 8px 10px' }}>
            <Composer members={members} placeholder="Write a reply" submitLabel="Reply" autoFocus onCancel={() => setReplyTo(null)}
              onSubmit={(body, mentions) => post(body, mentions, t.top.id)} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div data-testid="comments-tab">
      {canComment
        ? <div style={{ marginBottom: 16 }}><Composer members={members} placeholder="Add a comment about this role" submitLabel="Comment" onSubmit={(body, mentions) => post(body, mentions)} /></div>
        : <p style={{ ...small, margin: '0 0 14px', lineHeight: 1.5 }}>Viewers can read comments but not write them. Ask an admin for the Commenter role to join the discussion.</p>}

      {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: '0 0 10px' }}>{error}</p>}
      {loading && <p style={small}>Loading…</p>}
      {!loading && !error && threads.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>No comments yet. Start the discussion about this role.</p>}

      {open.map(renderThread)}

      {resolved.length > 0 && (
        <>
          <button style={{ ...linkBtn, margin: '4px 0 10px' }} onClick={() => setShowResolved(v => !v)}>
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved thread{resolved.length === 1 ? '' : 's'}
          </button>
          {showResolved && resolved.map(renderThread)}
        </>
      )}
    </div>
  )
}
