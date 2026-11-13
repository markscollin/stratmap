/** Every third party that processes personal data for us, with what it receives. Keep in step with the code: a test checks that each integration in package.json appears here. */
export const SUB_PROCESSORS: { name: string; purpose: string; data: string }[] = [
  { name: 'Clerk', purpose: 'authentication', data: 'your name, email address and sign-in identifiers.' },
  { name: 'Neon', purpose: 'database hosting', data: 'all workspace content and account records, stored in our database.' },
  { name: 'Vercel', purpose: 'application hosting', data: 'requests to the Service, including their content and technical logs.' },
  { name: 'Stripe', purpose: 'payments', data: 'billing details and the identifiers of your subscription. Card numbers go to Stripe directly and never reach us.' },
  { name: 'Resend', purpose: 'transactional email', data: 'the email addresses of people we email (invitations, billing notices, comment notifications) and the text of those emails.' },
  { name: 'Anthropic', purpose: 'AI drafting of job descriptions', data: 'only the role title, department, tone and notes you type into the AI draft panel. Never names, email addresses or salaries.' },
  { name: 'Sentry', purpose: 'error monitoring', data: 'crash reports with technical details such as the page and error message. We do not send personal data on purpose and turn off Sentry’s default personal-data collection.' },
  { name: 'PostHog', purpose: 'product analytics, only if you choose “Accept all”', data: 'a small number of usage events with random account and workspace identifiers and your plan; never names, email addresses or chart content. Sent from our servers; hosted in the EU by default.' },
]
