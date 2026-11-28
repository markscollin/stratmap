import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAuth } from '../../_lib/auth'
import { requireRole, requireFeature, requireChartsEditable } from '../../_lib/access'
import { enforceRateLimit } from '../../_lib/rateLimit'
import { parseBody } from '../../_lib/validate'
import { logAudit } from '../../_lib/audit'
import { sealSecret, secretBoxReady } from '../../_lib/secretBox'
import { BambooError, BAMBOO_FAILURE_TEXT, fetchBambooEmployees, validSubdomain } from '../../_lib/bamboohr'
import { db } from '../../_lib/db'
import { charts, hrIntegrations } from '../../../src/lib/db/schema'

// R-78: a chart's BambooHR connection.
//   GET    status (editor and above): connected or not, subdomain, the key's last four characters, auto-sync, the last result.
//          Never the key.
//   PUT    connect or change (admin, Growth and up): { subdomain, apiKey?, autoSync? }. A new key is tried against BambooHR before
//          it is stored, encrypted. Without apiKey only the subdomain/auto-sync of an existing connection change.
//   DELETE disconnect (admin). The chart and its roles stay as they are.

const Connect = z.object({
  subdomain: z.string().trim().toLowerCase().max(63).refine(validSubdomain, 'not a BambooHR subdomain'),
  apiKey: z.string().trim().min(8).max(200).optional(),
  autoSync: z.boolean().optional(),
})

export function integrationView(row: typeof hrIntegrations.$inferSelect | undefined) {
  if (!row) return { connected: false as const }
  return {
    connected: true as const, provider: row.provider, subdomain: row.subdomain, keyHint: row.keyHint, autoSync: row.autoSync,
    lastSyncAt: row.lastSyncAt, lastResult: row.lastResult,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method ?? '')) return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const chartId = req.query.id as string
    const [chart] = await db.select({ id: charts.id, name: charts.name, isSample: charts.isSample }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })
    const [row] = await db.select().from(hrIntegrations).where(eq(hrIntegrations.chartId, chartId)).limit(1)

    if (req.method === 'GET') {
      if (!(await requireRole(auth, res, 'editor'))) return
      return res.json({ ...integrationView(row), available: secretBoxReady() })
    }

    if (!(await requireRole(auth, res, 'admin'))) return

    if (req.method === 'DELETE') {
      if (!row) return res.status(204).end()
      await db.delete(hrIntegrations).where(eq(hrIntegrations.id, row.id))
      await logAudit({ workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'integration.disconnected', targetType: 'chart', targetId: chartId, details: { chartName: chart.name, provider: row.provider } })
      return res.status(204).end()
    }

    // PUT
    if (!(await requireFeature(auth.workspaceId, res, 'hr-sync'))) return
    if (!(await requireChartsEditable(auth.workspaceId, res))) return
    if (chart.isSample) return res.status(400).json({ error: 'sample-chart', message: 'A sample chart cannot be connected to BambooHR.' })
    if (!secretBoxReady()) return res.status(503).json({ error: 'integrations-unavailable', message: 'HR connections are not set up on this server yet.' })
    const body = parseBody(Connect, req, res)
    if (!body) return
    if (!row && !body.apiKey) return res.status(400).json({ error: 'api-key-required', message: 'Enter the BambooHR API key.' })

    let sealed: { apiKeyEncrypted: string; keyHint: string } | null = null
    if (body.apiKey) {
      // Each try calls BambooHR with the key someone typed: a few an hour is plenty, and it stops the route being used to test keys.
      if (!(await enforceRateLimit(res, `hr-connect:${auth.workspaceId}`, 10, 60 * 60))) return
      try {
        await fetchBambooEmployees(body.subdomain, body.apiKey)
      } catch (err) {
        if (err instanceof BambooError) return res.status(400).json({ error: `bamboohr-${err.kind}`, message: BAMBOO_FAILURE_TEXT[err.kind] })
        throw err
      }
      sealed = { apiKeyEncrypted: sealSecret(body.apiKey), keyHint: body.apiKey.slice(-4) }
    } else if (row && body.subdomain !== row.subdomain) {
      return res.status(400).json({ error: 'api-key-required', message: 'Enter the API key again to change the subdomain.' })
    }

    if (row) {
      await db.update(hrIntegrations).set({
        subdomain: body.subdomain, ...(sealed ?? {}), ...(body.autoSync !== undefined ? { autoSync: body.autoSync } : {}),
      }).where(eq(hrIntegrations.id, row.id))
    } else {
      await db.insert(hrIntegrations).values({
        id: crypto.randomUUID(), workspaceId: auth.workspaceId, chartId, provider: 'bamboohr', subdomain: body.subdomain,
        apiKeyEncrypted: sealed!.apiKeyEncrypted, keyHint: sealed!.keyHint, autoSync: body.autoSync ?? false, createdBy: auth.userId,
      }).onConflictDoNothing()
    }
    if (sealed) {
      await logAudit({ workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'integration.connected', targetType: 'chart', targetId: chartId, details: { chartName: chart.name, provider: 'bamboohr' } })
    }
    const [saved] = await db.select().from(hrIntegrations).where(eq(hrIntegrations.chartId, chartId)).limit(1)
    return res.json({ ...integrationView(saved), available: true })
  } catch (err) {
    console.error('/api/charts/[id]/integration', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
