import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireUser } from './_lib/auth'
import { parseBody } from './_lib/validate'
import { NotificationPrefsUpdate } from './_lib/schemas'
import { db } from './_lib/db'
import { userNotificationPrefs } from '../src/lib/db/schema'

// The person's own email settings (roadmap 5). Not tied to a workspace, so this uses requireUser.
//   GET /api/notifications        -> { comments: boolean }   (on by default)
//   PUT /api/notifications { comments: boolean }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return
  try {
    if (req.method === 'GET') {
      const [row] = await db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, user.userId)).limit(1)
      return res.json({ comments: row?.commentEmails ?? true })
    }
    const body = parseBody(NotificationPrefsUpdate, req, res)
    if (!body) return
    await db.insert(userNotificationPrefs).values({ userId: user.userId, commentEmails: body.comments })
      .onConflictDoUpdate({ target: userNotificationPrefs.userId, set: { commentEmails: body.comments, updatedAt: new Date() } })
    return res.json({ comments: body.comments })
  } catch (err) {
    console.error('/api/notifications', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
