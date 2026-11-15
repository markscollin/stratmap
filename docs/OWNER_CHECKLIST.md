# Owner checklist: everything that needs your accounts

Nothing here can be done from code. Ordered by what blocks taking real money. Menu names in other companies' dashboards change, so
the steps say what to look for rather than where exactly to click. The two scripts below do the checking for you.

## Helpers (run on your own computer, from the repo)

```bash
# 1. Are the production environment variables right? Prints names and verdicts only, never values.
vercel env pull --environment=production .env.vercel-production     # needs the Vercel CLI, logged in; delete the file afterwards
npm run check:env -- .env.vercel-production

# 2. Can the Stripe webhook read what Stripe sends? (Run against a PREVIEW with Stripe TEST keys, never production.)
npm run check:webhook -- https://<your-preview-url> whsec_<the endpoint's signing secret>
```

To make a long random secret (CRON_SECRET, ADMIN_SECRET): `openssl rand -hex 32`

## A. Blocks launch (do these before real customers pay)

| # | What | Why it matters | Time |
|---|---|---|---|
| 1 | **Legal facts (R-04).** Send Claude: legal company name, postal address, privacy email, legal email, governing law (e.g. "England and Wales"), and a one or two sentence refund policy. Then have a lawyer review `/privacy` and `/terms` (O-05). | Anyone about to pay sees the placeholder text and the "Template notice" banner until this is done. `npm run check:legal` fails until then. | 30 min + lawyer |
| 2 | **Webhook check on a preview (R-05).** In Vercel add a *Preview* environment with Stripe **test** keys, the four test price ids, and a Neon **dev branch** `DATABASE_URL`. In Stripe (test mode on) add an endpoint `https://<preview>/api/webhooks/stripe` for the events listed in `docs/BILLING.md`, copy its signing secret into the preview's `STRIPE_WEBHOOK_SECRET`, redeploy, then run helper 2 above. If the preview is behind Vercel Authentication, pass the "Protection Bypass for Automation" secret as the third argument. | If the production runtime reads the body differently from the tests, every webhook fails and nobody is upgraded after paying. | 10 min |
| 3 | **Real payment test on that preview.** Pay for Starter with card `4242 4242 4242 4242`; expect "Welcome to Starter" within ~10 s. Then open `/pricing` in **two tabs**, start Starter in both and pay in both: one subscription must stay, the other must be cancelled and refunded in the Stripe dashboard. Finally delete a paid test workspace and restore it (plan kept until the period ends). | Proves the duplicate-payment and delete rules against real Stripe, which the code tests only simulate. | 15 min |
| 4 | **Clerk production instance (O-01).** Create the production application, enable Google sign-in, put the `pk_live_` / `sk_live_` keys in Vercel (Production). Then sign up, onboard and invite someone end to end. | Test-mode Clerk sessions are not production-safe. | 30 min |
| 5 | **Domain and `APP_URL` (O-03).** Buy a domain, add it to the Vercel project, set `APP_URL=https://yourdomain` in Production. In Resend add the domain and its DNS records (SPF/DKIM; also publish a DMARC record). Create the mailboxes the pages link to: `privacy@`, `legal@`, `sales@`. Set `EMAIL_FROM` to an address on that domain. | Invite and comment emails, checkout redirects and canonical URLs follow `APP_URL`; emails from an unverified domain go to spam. | 1 h + DNS wait |
| 6 | **Vercel Pro (O-02).** Upgrade the project. | The Hobby plan does not allow commercial use. | 5 min |
| 7 | **Stripe live mode (O-04).** Live keys, live price objects (check they are £18/£180 and £49/£490 as the pricing page says), a live webhook endpoint on the production domain, Stripe Tax if you need it. Put them in Production and run helper 1. | Real money. | 45 min |
| 8 | **Production environment variables (O-07).** Run helper 1 until it prints "Nothing launch-blocking". Also confirm in Vercel → Settings → Environment Variables that "Automatically expose System Environment Variables" is on. **Do not** set `ALLOW_DEV_BYPASS` there. | `CRON_SECRET` unset means the daily purge never runs; the others switch features on. | 15 min |

## B. Strongly recommended before launch

| # | What | Why |
|---|---|---|
| 9 | **Anthropic spend limit (O-08).** In the Anthropic console set a monthly spend limit and an alert. | The AI caps (Growth 300, Enterprise 1,000 a month) stop one workspace; this stops everything else. |
| 10 | **Database safety (O-06).** In Neon turn on point-in-time recovery and do one restore drill into a scratch branch. Make sure **Preview** deployments use a separate database from Production (Vercel → Environment Variables: `DATABASE_URL` must differ). | A preview running unreviewed code against the production database is the most likely way to lose data. |
| 11 | **Monitoring (O-08).** Follow `docs/MONITORING.md`: Sentry alerts, two uptime monitors (`/` and `/api/health`), a status page, and a support address. | You find out about an outage from a monitor, not a customer. |
| 12 | **Branch protection (O-09).** GitHub → repo Settings → Branches → add a rule for `main` requiring the CI check to pass. | Keeps a red build off production. |
| 13 | **Dependabot (R-36).** GitHub → repo Settings → Code security → switch on "Dependabot alerts" and "Dependabot security updates". The weekly update config is already in `.github/dependabot.yml`. | Security fixes arrive as pull requests; without the switch only the weekly ones do. |
| 14 | **Before the next production deploy:** the deploy applies migrations 0015 (unique membership index; removes duplicate memberships first) and 0016 (`trial_grants`) by itself. A production build now **fails** if `VITE_CLERK_PUBLISHABLE_KEY` is missing in Vercel Production (R-34): check it is set. | A failed build is the safe outcome, but better to know. |

## C. Local development

If you run `vercel dev` **without** Clerk keys, add `ALLOW_DEV_BYPASS=1` to `.env.local`. With real Clerk keys nothing is needed.

## D. Decisions still wanted from you (none block launch)

None open. If you want the landing page to show a real chart (R-41), pick which chart, or send a screenshot.
