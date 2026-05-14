import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Lock, ChevronDown, ChevronUp } from 'lucide-react'
import Anthropic from '@anthropic-ai/sdk'
import type { OrgNode } from '../../types'
import type { JobDescription } from '../../types/jd'
import { usePlanLimits } from '../../hooks/usePlanLimits'
import { useBillingStore } from '../../store/billingStore'
import { UpgradeModal } from '../../components/ui/UpgradeModal'

// NOTE: In production this should route through a backend proxy to protect the API key.
// Direct browser calls are for development only.
const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  dangerouslyAllowBrowser: true,
})

type Tone = 'Professional' | 'Direct' | 'Startup' | 'Inclusive'
const TONES: Tone[] = ['Professional', 'Direct', 'Startup', 'Inclusive']

const DEV_SESSION_KEY   = 'stratmap_dev_draft_count'
const DEV_DRAFT_LIMIT   = 10

function getDevCount(): number {
  return parseInt(sessionStorage.getItem(DEV_SESSION_KEY) ?? '0', 10)
}
function incrementDevCount(): void {
  sessionStorage.setItem(DEV_SESSION_KEY, String(getDevCount() + 1))
}
function isDevLimitHit(): boolean {
  return import.meta.env.DEV && getDevCount() >= DEV_DRAFT_LIMIT
}

function bulletsToHtml(text: string): string {
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean)
  const bullets = lines.filter(l => /^[-•*]/.test(l))
  if (bullets.length === 0) return lines.map(l => `<p>${l}</p>`).join('')
  return '<ul>' + bullets.map(l => `<li><p>${l.replace(/^[-•*]\s*/, '')}</p></li>`).join('') + '</ul>'
}

function parseAIDraft(text: string): { responsibilities: string; requirements: string } {
  const upper    = text.toUpperCase()
  const respIdx  = upper.indexOf('RESPONSIBILITIES:')
  const reqIdx   = upper.indexOf('REQUIREMENTS:')
  if (respIdx === -1 || reqIdx === -1) return { responsibilities: bulletsToHtml(text), requirements: '' }
  return {
    responsibilities: bulletsToHtml(text.slice(respIdx + 'RESPONSIBILITIES:'.length, reqIdx).trim()),
    requirements:     bulletsToHtml(text.slice(reqIdx  + 'REQUIREMENTS:'.length).trim()),
  }
}

export function AIJDDraft({
  node, jd, deptName, onDraftComplete,
}: {
  node: OrgNode
  jd: JobDescription
  deptName: string
  onDraftComplete: (responsibilities: string, requirements: string) => void
}) {
  const [isOpen,       setIsOpen]       = useState(false)
  const [tone,         setTone]         = useState<Tone>('Professional')
  const [notes,        setNotes]        = useState('')
  const [isGenerating, setGenerating]   = useState(false)
  const [streamText,   setStreamText]   = useState('')
  const [showUpgrade,  setShowUpgrade]  = useState(false)
  const accRef    = useRef('')
  const streamRef = useRef<ReturnType<typeof client.messages.stream> | null>(null)

  const { canUseAIDrafting, currentTier } = usePlanLimits()
  const { usage, incrementUsage }         = useBillingStore()
  const navigate = useNavigate()

  const isLocked   = !canUseAIDrafting()
  const totalChars = jd.responsibilities.length + jd.requirements.length
  const hasApiKey  = !!import.meta.env.VITE_ANTHROPIC_API_KEY
  const devBlocked = isDevLimitHit()

  if (jd.status !== 'draft' || totalChars >= 100) return null

  const handleButtonClick = () => {
    if (isLocked) { setShowUpgrade(true); return }
    setIsOpen(v => !v)
  }

  const handleGenerate = async () => {
    if (!hasApiKey || devBlocked) return
    setGenerating(true)
    accRef.current = ''
    setStreamText('')

    try {
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are an expert HR professional writing job descriptions for a modern tech company. Write clearly, inclusively, and concisely. Do not include salary information. Do not use jargon.',
        messages: [{
          role: 'user',
          content: `Write a job description for a ${node.title} role in the ${deptName} department. Tone: ${tone}.${notes ? ` Additional context: ${notes}` : ''}

Output EXACTLY this format with no preamble:

RESPONSIBILITIES:
- [bullet 1]
- [bullet 2]
- [bullet 3]
- [bullet 4]
- [bullet 5]

REQUIREMENTS:
- [bullet 1]
- [bullet 2]
- [bullet 3]
- [bullet 4]`,
        }],
      })
      streamRef.current = stream

      stream.on('text', (text) => {
        accRef.current += text
        setStreamText(accRef.current)
      })

      await stream.finalMessage()
      const { responsibilities, requirements } = parseAIDraft(accRef.current)
      onDraftComplete(responsibilities, requirements)
      incrementUsage('aiDraftsUsed')
      if (import.meta.env.DEV) incrementDevCount()
      setIsOpen(false)
      setStreamText('')
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        console.error('AI draft error:', err)
      }
    } finally {
      setGenerating(false)
      streamRef.current = null
    }
  }

  const handleCancel = () => {
    streamRef.current?.abort()
    setGenerating(false)
    setIsOpen(false)
    setStreamText('')
    accRef.current = ''
  }

  const draftsRemaining = usage.aiDraftsLimit - usage.aiDraftsUsed

  return (
    <>
      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgrade={() => navigate('/pricing')}
        feature="AI JD drafting"
        requiredTier="starter"
        currentTier={currentTier}
      />

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={handleButtonClick}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 14px',
            background: isLocked ? 'var(--raised)' : 'var(--grad-purple)',
            border: isLocked ? '1px solid var(--border)' : 'none',
            borderRadius: 8,
            color: isLocked ? 'var(--dim)' : '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {isLocked ? <Lock size={12} /> : <Sparkles size={13} />}
          Draft with AI
          {isLocked && <span style={{ fontSize: 10, marginLeft: 2 }}>· Starter+</span>}
          {!isLocked && currentTier === 'starter' && (
            <span style={{ fontSize: 10, opacity: 0.8 }}>· {draftsRemaining} of {usage.aiDraftsLimit} left</span>
          )}
          {!isLocked && (isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </button>

        {isOpen && (
          <div style={{
            marginTop: 8, padding: '12px',
            background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10,
          }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--dim)', minWidth: 34 }}>Role</span>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{node.title}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--dim)', minWidth: 34 }}>Dept</span>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{deptName}</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Tone</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {TONES.map(t => (
                  <button key={t} onClick={() => setTone(t)} style={{
                    padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: tone === t ? 'var(--purple-bg)' : 'transparent',
                    border: `1px solid ${tone === t ? 'var(--purple)' : 'var(--border)'}`,
                    color: tone === t ? 'var(--purple)' : 'var(--muted)', cursor: 'pointer',
                  }}>{t}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
                Notes <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Remote-first, fintech background preferred…"
                rows={2}
                style={{
                  width: '100%', resize: 'none',
                  padding: '7px 10px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 7, color: 'var(--text)', fontSize: 12,
                  lineHeight: 1.5, boxSizing: 'border-box', outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {isGenerating && streamText && (
              <div style={{
                marginBottom: 10, padding: '8px 10px',
                background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)',
                fontSize: 11, color: 'var(--muted)', lineHeight: 1.6,
                maxHeight: 110, overflow: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {streamText}
                <span style={{ display: 'inline-block', width: 7, height: 11, background: 'var(--purple)', marginLeft: 2, borderRadius: 2, animation: 'ghostPulse 0.8s ease-in-out infinite' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleCancel} style={{
                flex: 1, padding: '7px', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 7,
                color: 'var(--muted)', fontSize: 12, cursor: 'pointer',
              }}>
                {isGenerating ? 'Cancel' : 'Close'}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !hasApiKey || devBlocked}
                style={{
                  flex: 2, padding: '7px',
                  background: isGenerating || !hasApiKey || devBlocked ? 'var(--raised)' : 'var(--grad-purple)',
                  border: 'none', borderRadius: 7,
                  color: isGenerating || !hasApiKey || devBlocked ? 'var(--muted)' : '#fff',
                  fontSize: 12, fontWeight: 600,
                  cursor: isGenerating || !hasApiKey || devBlocked ? 'default' : 'pointer',
                }}
              >
                {isGenerating ? 'Writing…' : 'Generate draft'}
              </button>
            </div>

            {!hasApiKey && (
              <p style={{ marginTop: 8, fontSize: 10, color: 'var(--warn)', textAlign: 'center', lineHeight: 1.4 }}>
                Add VITE_ANTHROPIC_API_KEY to .env.local to enable AI drafting
              </p>
            )}
            {devBlocked && (
              <p style={{ marginTop: 8, fontSize: 10, color: 'var(--warn)', textAlign: 'center', lineHeight: 1.4 }}>
                Dev session limit reached ({DEV_DRAFT_LIMIT} drafts). Reload the page to reset.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
