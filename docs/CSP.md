# Content Security Policy (R-23)

The policy in `vercel.json` is **report-only**: browsers report what it would block to `POST /api/csp-report` (also announced through the
`Reporting-Endpoints` header) but still allow it. The endpoint writes one trimmed line per report to the Vercel logs, starting with `[csp]`.
Page URLs are cut to origin plus first path segment, so invite tokens and share codes never reach the logs (`api/_lib/cspReport.ts`).

## Steps (the code part is done; the rest needs the production domain and Clerk)

1. **After O-01 and O-03** (production Clerk instance, custom domain): add Clerk's production hosts to `script-src`, `connect-src` and `frame-src`
   in **both** copies of the policy in `vercel.json` (`https://clerk.<your-domain>`; the dev entry `https://*.clerk.accounts.dev` can stay or go).
   A test fails if the two copies drift apart (they differ only in `frame-ancestors`).
2. Deploy and use the product for about a week, including sign-in, checkout and the share and embed pages.
3. Read the reports: in Vercel → project → Logs, search for `[csp]`. Every distinct `blocked=` that is legitimate gets added to the right directive.
   Browser extensions produce noise (`chrome-extension:`, `moz-extension:`); ignore those.
4. **Enforce:** rename the header key `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in both blocks (and update
   `src/lib/__tests__/vercelRewrites.test.ts`, which looks for the report-only name). Keep `report-uri` so violations stay visible.

Alternatively point `report-uri` at Sentry's security endpoint (Project settings → Security Headers) instead of the log line.
