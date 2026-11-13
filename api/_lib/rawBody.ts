import type { VercelRequest } from '@vercel/node'

// The exact bytes of a request body, which Stripe's signature is computed over (launch review R-05).
//
// Why this is not just `for await (const chunk of req)`: for `@vercel/node` functions Vercel's helpers read the whole body
// first (to build `req.body`) and then replay the bytes ONLY through `req.on('data')`, `req.on('end')` and `req.read()`
// (`restoreBody` in @vercel/node). An async iterator over the request sees an empty stream. Next.js's
// `export const config = { api: { bodyParser: false } }` is not read by @vercel/node at all, so it never helped.
//
// Order of attempts:
//   1. `req.body` is already a Buffer or string (a content type the helpers do not parse): use it as it is.
//   2. Listen for 'data' and 'end'. This works with Vercel's replay and with a plain Node request (nothing has read it yet).
//   3. If neither ends within `timeoutMs` (a stream that was drained with no replay never emits 'end' again), give up with
//      whatever arrived rather than hang until the function times out. The caller treats an empty result as "could not read".
export function readRawBody(req: VercelRequest, timeoutMs = 2000): Promise<Buffer> {
  const existing = (req as { body?: unknown }).body
  if (Buffer.isBuffer(existing)) return Promise.resolve(existing)
  if (typeof existing === 'string') return Promise.resolve(Buffer.from(existing))

  if (typeof req.on !== 'function') return Promise.resolve(Buffer.alloc(0)) // not a stream (a hand-built request in a test)

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let finished = false
    const done = (err?: Error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(Buffer.concat(chunks))
    }
    const timer = setTimeout(() => done(), timeoutMs)
    req.on('data', (chunk: Buffer | string) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) })
    req.on('end', () => done())
    req.on('error', (err: Error) => done(err))
  })
}
