import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { workspaces } from '../../src/lib/db/schema'

type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise'

const SYSTEM_PROMPT =
  'You are an expert HR professional writing job descriptions for a modern tech company. ' +
  'Write clearly, inclusively, and concisely. Do not include salary information. Do not use jargon.'

function buildPrompt(title: string, deptName: string, tone: string, notes?: string): string {
  return `Write a job description for a ${title} role in the ${deptName} department. Tone: ${tone}.${
    notes ? ` Additional context: ${notes}` : ''
  }

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
- [bullet 4]`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    // Resolve effective plan server-side (admin trial overrides the Stripe plan).
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, auth.workspaceId))
      .limit(1)

    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    const isTrialActive = ws.trialEndsAt && ws.trialEndsAt > new Date() && ws.trialPlan
    const tier = (isTrialActive ? ws.trialPlan! : ws.planTier) as PlanTier

    // Gate on tier: AI drafting is a paid feature. The per-period draft quota
    // remains an advisory client-side limit until a DB-backed counter exists.
    if (tier === 'free') {
      return res.status(403).json({ error: 'AI drafting requires a paid plan' })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI drafting is not configured' })
    }

    const { title, deptName, tone, notes } = req.body as {
      title?: string
      deptName?: string
      tone?: string
      notes?: string
    }

    if (!title || !deptName) {
      return res.status(400).json({ error: 'title and deptName are required' })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(title, deptName, tone ?? 'Professional', notes) }],
    })

    stream.on('text', (text: string) => {
      res.write(text)
    })

    await stream.finalMessage()
    return res.end()
  } catch (err) {
    console.error('/api/ai/draft', err)
    reportError(err, { route: '/api/ai/draft' })
    if (res.headersSent) return res.end()
    return res.status(500).json({ error: 'AI draft failed' })
  }
}
