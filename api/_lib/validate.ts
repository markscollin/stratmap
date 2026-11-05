import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { z } from 'zod'

/**
 * Parses req.body with a zod schema. Unknown keys are stripped (z.object's
 * default), so handlers only ever see allow-listed fields. Sends 400 with the
 * issues and returns null on failure.
 */
export function parseBody<S extends z.ZodType>(
  schema: S,
  req: VercelRequest,
  res: VercelResponse,
): z.infer<S> | null {
  const result = schema.safeParse(req.body ?? {})
  if (!result.success) {
    res.status(400).json({
      error: 'invalid-request',
      issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    })
    return null
  }
  return result.data
}
