// Launch review R-05: the webhook must read the exact request bytes however the platform delivers them.
//
// `@vercel/node` helpers read the whole body to build `req.body`, then replay the bytes only through
// req.on('data'|'end') and req.read(). `emulateVercelHelpers` below is a copy of that logic (restoreBody, readBody and
// addHelpers in node_modules/@vercel/node/dist/dev-server.mjs), so these tests run the real handler, with a real Stripe
// signature, behind the same stream behaviour. Whether Vercel's PRODUCTION runtime behaves the same is unproven here:
// see "Release check" in docs/BILLING.md.
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { PassThrough } from 'node:stream'
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

import Stripe from 'stripe'
import handler from '../webhooks/stripe'
import { readRawBody } from '../_lib/rawBody'

type Req = http.IncomingMessage & { body?: unknown; read: () => unknown }
type Res = http.ServerResponse & { status: (n: number) => Res; json: (o: unknown) => Res }

async function streamToBuffer(stream: AsyncIterable<Buffer | string>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return Buffer.concat(chunks)
}

/** What @vercel/node does before calling a handler (copied behaviour): drain the body, replay it via data/end/read, add res helpers. */
async function emulateVercelHelpers(req: Req, res: Res) {
  const body = await streamToBuffer(req)
  const replicate = new PassThrough()
  const on = replicate.on.bind(replicate)
  const originalOn = req.on.bind(req)
  req.read = replicate.read.bind(replicate)
  ;(req as unknown as { on: unknown }).on = (name: string, cb: never) => (name === 'data' || name === 'end' ? on(name, cb) : originalOn(name, cb))
  replicate.write(body); replicate.end()
  Object.defineProperty(req, 'body', {
    configurable: true,
    get: () => (String(req.headers['content-type']).includes('json') ? JSON.parse(body.toString('utf8') || 'null') : body.toString('utf8')),
  })
  res.status = (n) => { res.statusCode = n; return res }
  res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res }
}

let server: http.Server
let base = ''
let mode: 'vercel' | 'plain' = 'vercel'
const lastRead: { viaEvents: number; viaAsyncIterator: number } = { viaEvents: -1, viaAsyncIterator: -1 }

beforeAll(async () => {
  server = http.createServer(async (rawReq, rawRes) => {
    const req = rawReq as Req, res = rawRes as Res
    if (mode === 'vercel') await emulateVercelHelpers(req, res)
    else { res.status = (n) => { res.statusCode = n; return res }; res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res } }
    if (req.url === '/probe') {
      // Both ways of reading, one after the other, to show which one sees the bytes.
      lastRead.viaEvents = (await readRawBody(req as never)).length
      lastRead.viaAsyncIterator = (await streamToBuffer(req)).length
      return res.json({ ok: true })
    }
    return handler(req as never, res as never)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const SECRET = 'whsec_test_secret'
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_WEBHOOK_SECRET = SECRET
  delete process.env.VERCEL_ENV
  mode = 'vercel'
})
afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET; delete process.env.VERCEL_ENV
})

// An event type the handler acknowledges without touching the database, so only the body + signature path is exercised.
const payload = JSON.stringify({ id: 'evt_raw_1', object: 'event', type: 'customer.created', data: { object: { id: 'cus_1' } }, note: 'spaces   and  é unicode ✓' })
const sign = (body: string, secret = SECRET) => new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload: body, secret })

async function post(path: string, body: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body })
  return { status: res.status, body: await res.json().catch(() => null) as Record<string, unknown> | null }
}

describe('readRawBody', () => {
  it('behind Vercel-style helpers, the events path sees every byte and a for-await loop sees none (why the old code could not work)', async () => {
    mode = 'vercel'
    const body = JSON.stringify({ a: 1, text: 'x'.repeat(5000) })
    await post('/probe', body)
    expect(lastRead.viaEvents).toBe(Buffer.byteLength(body))
    expect(lastRead.viaAsyncIterator).toBe(0)
  })

  it('on a plain Node request (nothing has read it yet) it also sees every byte', async () => {
    mode = 'plain'
    const body = JSON.stringify({ b: 2 })
    await post('/probe', body)
    expect(lastRead.viaEvents).toBe(Buffer.byteLength(body))
  })

  it('uses req.body as it is when it is already a Buffer or string', async () => {
    expect((await readRawBody({ body: Buffer.from('abc') } as never)).toString()).toBe('abc')
    expect((await readRawBody({ body: 'xyz' } as never)).toString()).toBe('xyz')
  })

  it('does not hang when the stream was drained and nothing replays it: it gives up with an empty body', async () => {
    const drained = new PassThrough(); drained.end(); await streamToBuffer(drained)
    const out = await readRawBody(drained as never, 150) // a hang here would fail the test by timeout
    expect(out.length).toBe(0)
  })

  it('a request that is not a stream gives an empty body', async () => {
    expect((await readRawBody({ method: 'POST', body: {} } as never)).length).toBe(0)
  })
})

describe('POST /api/webhooks/stripe, real signature, real bytes', () => {
  it('accepts a correctly signed event behind Vercel-style helpers', async () => {
    const res = await post('/', payload, { 'stripe-signature': sign(payload) })
    expect(res).toEqual({ status: 200, body: { received: true } })
  })

  it('accepts it on a plain Node request too', async () => {
    mode = 'plain'
    const res = await post('/', payload, { 'stripe-signature': sign(payload) })
    expect(res.status).toBe(200)
  })

  it('rejects a body changed after signing (even by one byte of whitespace)', async () => {
    const signed = sign(payload)
    const res = await post('/', payload.replace('evt_raw_1', 'evt_raw_2'), { 'stripe-signature': signed })
    expect(res).toMatchObject({ status: 400, body: { error: 'Invalid signature' } })
  })

  it('rejects a signature made with another secret', async () => {
    const res = await post('/', payload, { 'stripe-signature': sign(payload, 'whsec_someone_else') })
    expect(res).toMatchObject({ status: 400, body: { error: 'Invalid signature' } })
  })

  it('on a deployed function an unsigned event is refused, never trusted', async () => {
    process.env.VERCEL_ENV = 'production'
    const res = await post('/', payload) // no stripe-signature header
    expect(res.status).toBe(400)
  })

  it('on a deployed function a body that cannot be read as raw bytes is refused with a clear error (fail closed)', async () => {
    process.env.VERCEL_ENV = 'preview'
    // Simulate a platform that drains the stream and does not replay it: only the parsed object is left.
    const fake = { method: 'POST', headers: { 'stripe-signature': sign(payload), 'content-type': 'application/json' }, body: JSON.parse(payload), on: () => undefined }
    const out: { status?: number; body?: unknown } = {}
    const res = { status(n: number) { out.status = n; return this }, json(b: unknown) { out.body = b; return this } }
    // `on` never emits, so readRawBody gives up after its timeout; shorten it by racing a fake timer.
    vi.useFakeTimers()
    const done = handler(fake as never, res as never)
    await vi.advanceTimersByTimeAsync(2500)
    await done
    vi.useRealTimers()
    expect(out).toEqual({ status: 400, body: { error: 'Could not read raw body' } })
  })
})
