#!/usr/bin/env node
// The 1-minute version of the R-05 release check (docs/BILLING.md): sends a correctly SIGNED Stripe test event to a deployed
// webhook and says whether the body was read properly. Needs the endpoint's signing secret (whsec_...), nothing else.
//
//   npm run check:webhook -- https://<preview-url> whsec_...  [vercel-protection-bypass-secret]
//
// Use a preview with Stripe TEST keys only. The event names a subscription that does not exist, so a healthy endpoint answers
// 200, or 500 "Webhook handler failed" (the lookup in Stripe fails AFTER the signature passed). It changes nothing.
import Stripe from 'stripe'

/** What a response means. Pure, so it is tested. */
export function verdict(status, bodyText) {
  const body = bodyText.toLowerCase()
  if (status === 400 && body.includes('could not read raw body')) {
    return { ok: false, text: 'FAIL: "Could not read raw body". Production does not replay the request body the way the tests assume, so every real webhook would be rejected and nobody would be upgraded after paying. Stop and tell whoever maintains api/_lib/rawBody.ts.' }
  }
  if (status === 400 && body.includes('invalid signature')) {
    return { ok: false, text: 'The signature was refused: the signing secret does not match the one set as STRIPE_WEBHOOK_SECRET on that deployment (did you redeploy after setting it?). Not a code problem.' }
  }
  if (status === 401 || status === 403 || status === 404) {
    return { ok: false, text: `Got ${status} before the function ran. A preview behind Vercel Authentication answers 401/403: turn protection off for this test, or pass the "Protection Bypass for Automation" secret as the third argument.` }
  }
  if (status === 200 || (status === 500 && body.includes('webhook handler failed'))) {
    return { ok: true, text: `PASS: the body and signature were accepted (${status}). The webhook can read what Stripe sends.` }
  }
  return { ok: false, text: `Unexpected answer ${status}: ${bodyText.slice(0, 200)}` }
}

async function main() {
  const [base, secret, bypass] = process.argv.slice(2)
  if (!base || !secret || !secret.startsWith('whsec_')) {
    console.error('usage: npm run check:webhook -- <https://preview-url> <whsec_...> [protection-bypass-secret]')
    process.exit(2)
  }
  if (/stratmap-seven\.vercel\.app|\/\/(www\.)?stratmap\.app/.test(base)) {
    console.error('Refusing to run against what looks like production. Use a preview with Stripe test keys.')
    process.exit(2)
  }
  const payload = JSON.stringify({
    id: `evt_check_${Date.now()}`, object: 'event', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_check_does_not_exist', object: 'subscription' } },
  })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret })
  const url = new URL('/api/webhooks/stripe', base)
  if (bypass) url.searchParams.set('x-vercel-protection-bypass', bypass)
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload })
  const v = verdict(res.status, await res.text())
  console.log(v.text)
  process.exit(v.ok ? 0 : 1)
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) main().catch(err => { console.error(err.message); process.exit(2) })
