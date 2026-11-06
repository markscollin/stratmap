# Monitoring and alerting (roadmap 3.9)

What the code gives you, and what you set up in dashboards. The "done" test from the roadmap is simple:
**an alert reaches your phone.** Do the last section to prove it.

## What is in the code

| Thing | Where | Turns on when |
|---|---|---|
| Browser error reporting | `@sentry/react` in `src/main.tsx` + the ErrorBoundary | `VITE_SENTRY_DSN` is set **at build time** |
| Server error reporting | `api/_lib/sentry.ts` `reportError()`, called from checkout, the Stripe webhook, AI drafting and invites | `SENTRY_DSN` is set |
| Health check | `GET /api/health` | always on |

Both Sentry keys do nothing until set, so nothing is reported from local or e2e runs.

### `/api/health`
- `200 {"status":"ok","checks":{"database":"ok"},"responseMs":42}` when the API is up and the database answers.
- `503 {"status":"degraded","checks":{"database":"down"}}` when the database errors or does not answer within 3 s.
- Public, read-only, never cached, and it never says *why* it failed (no error text, hostnames or versions). The reason is logged as
  `[health] database check failed: …` in the Vercel function logs.
- Answers `HEAD` too, which some uptime tools use.
- **Cost note:** each check runs `select 1`, which also wakes Neon's compute if it had suspended. A monitor every 3 to 5 minutes keeps the
  database awake all day. That is the point of monitoring, but it means Neon's scale-to-zero savings go away. Don't poll faster than every minute.

## Setup, step by step

### 1. Sentry (error alerts)
1. In Sentry create a project (platform React, or one Browser and one Node project if you want them separate). Copy the DSN(s).
2. In Vercel → Project → Settings → Environment Variables, add for **Production** (and Preview if you want preview errors too):
   - `VITE_SENTRY_DSN` = the browser DSN. It is baked in at build time, so **redeploy** after adding it.
   - `SENTRY_DSN` = the server DSN (the same DSN works if you use one project).
3. Alerts (Sentry → Alerts → Create Alert → Issues):
   - **New issue**: "When a new issue is created" → notify you by email and the **Sentry mobile app** (push to phone).
   - **Spike**: "When an issue is seen more than 10 times in 1 hour" → same channels.
   - Optional **billing errors**: Sentry attaches the route as extra data (`route: /api/webhooks/stripe`, `/api/checkout`). An alert whose filter is
     "the event's message or extra contains `stripe`" catches failed payments early.
4. Check it works: open the deployed site, open the browser console and run
   `setTimeout(() => { throw new Error('Sentry test from console') })`. The issue should appear in Sentry within a minute with environment `production`.
   (There is deliberately no "test error" API route: it would be an unauthenticated way to create noise.)

### 2. Uptime checks (Better Stack or Checkly; both have free tiers)
Create two monitors on your real domain (or the `*.vercel.app` URL until you have one):

| Monitor | URL | Pass when |
|---|---|---|
| Site | `https://<domain>/` | status 200 and the page contains `StratMap` |
| API | `https://<domain>/api/health` | status 200 and the body contains `"status":"ok"` |

Settings worth choosing: check every **3 minutes**; alert only after **2 failed checks in a row** (stops one-off blips from waking you);
use two or more regions; send to **phone push or SMS** as well as email.

### 3. Status page
Better Stack and Checkly can publish a hosted status page that shows these two monitors. Create one, add both, and (once you have a domain)
point `status.<domain>` at it. Put the link in the app footer and in your support email signature when you want customers to find it.

### 4. Stripe
Stripe → Developers → Webhooks → your endpoint: leave "email me when deliveries fail" on. Failed webhook deliveries are the one billing problem
that can happen without any error in this app.

## Prove an alert reaches your phone (the roadmap's "done" test)
1. In the uptime tool, add a **temporary** monitor on `https://<domain>/api/this-does-not-exist` (it returns 404, so it will fail).
2. Wait for two checks. Confirm the alert arrives **on your phone**, not just in your inbox.
3. Delete the temporary monitor.
4. Repeat once with Sentry (the console snippet above) and confirm the push notification arrives.

## When `/api/health` goes red
1. Open Vercel → Logs and search for `[health]`. The line says what the database check threw.
2. Check Neon's status page and the project's compute state. A suspended compute wakes on the next query, so one 503 followed by recovery is normal after a long idle period.
3. A wrong or rotated `DATABASE_URL` shows as an authentication error in the log. Fix it in Vercel and redeploy.
4. If only the site monitor is red and health is green, check the latest Vercel deployment (Deployments tab) and roll back to the previous one if it is the cause.
