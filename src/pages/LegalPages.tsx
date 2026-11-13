import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LEGAL, missingLegalDetails, type LegalDetails } from '../lib/legalDetails'
import { SUB_PROCESSORS } from '../lib/subProcessors'

/** The owner's value, or the old bracketed placeholder while it is still missing (R-04). */
function fact(field: keyof LegalDetails, placeholder: string): string {
  return LEGAL[field].trim() || `[${placeholder}]`
}
const company = () => fact('companyName', 'Company Legal Name')
const privacyEmail = () => fact('privacyEmail', 'privacy@yourdomain')
const legalEmail = () => fact('legalEmail', 'legal@yourdomain')

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} — StratMap` }, [title])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link to="/" style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)', textDecoration: 'none', letterSpacing: '-.3px' }}>
          StratMap
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '28px 0 6px' }}>{title}</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Last updated: {LEGAL.lastUpdated}</p>

        {missingLegalDetails().length > 0 && (
        <div style={{
          background: 'var(--warn-bg, rgba(245,158,11,.12))',
          border: '1px solid var(--warn, #f59e0b)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 32,
          fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
        }}>
          <strong>Template notice:</strong> This document is a starting template and is not legal advice.
          Have it reviewed and adapted by a qualified lawyer before relying on it for a commercial launch.
        </div>
        )}

        <div style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--text)' }}>{children}</div>

        <LegalFooter />
      </div>
    </div>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, margin: '32px 0 10px' }}>{children}</h2>
}

export function LegalFooter() {
  return (
    <div style={{
      marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--border)',
      display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)',
    }}>
      <Link to="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Home</Link>
      <Link to="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy Policy</Link>
      <Link to="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms of Service</Link>
      <span style={{ marginLeft: 'auto' }}>© {new Date().getFullYear()} StratMap</span>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This Privacy Policy explains how {company()} (“StratMap”, “we”, “us”) collects, uses, and
        protects your information when you use our org-charting and people-planning service (the “Service”).
      </p>

      <H2>1. Information we collect</H2>
      <p>
        <strong>Account data:</strong> name, email address, and authentication identifiers provided through our
        authentication provider (Clerk).<br />
        <strong>Workspace content:</strong> org charts, nodes, job descriptions, headcount plans, and related
        data you create.<br />
        <strong>Billing data:</strong> subscription tier and payment identifiers handled by our payment processor
        (Stripe). We do not store full card numbers.<br />
        <strong>Usage data:</strong> log and diagnostic data used to operate and secure the Service.
      </p>

      <H2>2. How we use your information</H2>
      <p>
        To provide and maintain the Service, process payments, communicate with you about your account, provide
        support, and comply with legal obligations. We do not sell your personal data.
      </p>

      <H2>3. Sub-processors</H2>
      <p>
        We rely on the following third-party providers to operate the Service. Each processes data only as needed
        for its function:
      </p>
      <ul style={{ paddingLeft: 22, margin: '0 0 12px' }}>
        {SUB_PROCESSORS.map(p => (
          <li key={p.name}><strong>{p.name}</strong> ({p.purpose}): {p.data}</li>
        ))}
      </ul>

      <H2>4. Data retention</H2>
      <p>
        We retain your data for as long as your account is active. A workspace owner can delete their workspace
        at any time in Settings. A deleted workspace is hidden immediately and its subscription is cancelled; we keep
        it for 30 days so the owner can restore it, and then permanently erase it, including its charts, roles, job
        descriptions, members and activity log. Backups are overwritten on their normal schedule. Records we are
        legally required to keep, such as invoices, are retained as the law requires. You can also delete your own
        account in Settings: you leave every workspace, your sign-in account is deleted, and a workspace you own is
        deleted with you under the same 30-day rule. When you delete a single role, we keep a copy of it, its comments, its job description
        (including any salary band) and its reporting lines for 3 days so that Undo can bring it back, and then erase it. The activity log records who changed members, sharing and
        salary bands (never salary amounts) and is kept with the workspace it belongs to.
      </p>

      <H2>5. Your rights</H2>
      <p>
        Depending on your location (including the EU/UK under GDPR), you may have rights to access, correct,
        export, or delete your personal data, and to object to or restrict certain processing. Workspace owners
        and admins can export all workspace data (JSON and CSV) in Settings, and anyone can delete their account
        there. For anything else, contact {privacyEmail()}.
      </p>

      <H2>6. Cookies</H2>
      <p>
        We use strictly necessary cookies to operate the Service (for example, authentication sessions) and may
        use limited analytics cookies subject to your consent. See the cookie banner shown on first visit.
      </p>
      <p>
        If you choose &quot;Accept all&quot;, our servers send a small number of product-usage events (for example
        &quot;created a first chart&quot; or &quot;invited a teammate&quot;) to our analytics provider, PostHog. These events
        carry only random account and workspace identifiers and your plan, never your name, email address or the
        content of your charts. If you choose &quot;Necessary only&quot;, no analytics events are sent.
      </p>

      <H2>7. Contact</H2>
      <p>
        Questions about this policy: {privacyEmail()}.<br />
        {company()}, {fact('address', 'Company address')}.
      </p>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        These Terms of Service (“Terms”) govern your access to and use of StratMap (the “Service”) provided by
        {company()}. By using the Service, you agree to these Terms.
      </p>

      <H2>1. Accounts</H2>
      <p>
        You are responsible for safeguarding your account and for all activity that occurs under it. You must
        provide accurate information and be at least the age of majority in your jurisdiction.
      </p>

      <H2>2. Subscriptions and billing</H2>
      <p>
        Paid plans are billed in advance on a recurring basis through Stripe. Fees are non-refundable except where
        required by law. {fact('refundPolicy', 'Refund policy')} You may cancel at any time; access continues until the end of the current billing period.
      </p>

      <H2>3. Acceptable use</H2>
      <p>
        You agree not to misuse the Service, including by attempting to disrupt it, access it without
        authorization, or use it to store unlawful content.
      </p>

      <H2>4. Your content</H2>
      <p>
        You retain ownership of the content you create. You grant us a limited license to host and process it
        solely to provide the Service.
      </p>

      <H2>5. Disclaimers</H2>
      <p>
        The Service is provided “as is” without warranties of any kind. We do not warrant that it will be
        uninterrupted or error-free.
      </p>

      <H2>6. Limitation of liability</H2>
      <p>
        To the maximum extent permitted by law, {company()} will not be liable for any indirect,
        incidental, or consequential damages arising from your use of the Service.
      </p>

      <H2>7. Changes</H2>
      <p>
        We may update these Terms from time to time. Material changes will be communicated through the Service or
        by email. Continued use after changes take effect constitutes acceptance.
      </p>

      <H2>8. Governing law</H2>
      <p>These Terms are governed by the laws of {fact('governingLaw', 'Governing law and courts')}.</p>

      <H2>9. Contact</H2>
      <p>
        Questions about these Terms: {legalEmail()}.<br />
        {company()}, {fact('address', 'Company address')}.
      </p>
    </LegalShell>
  )
}
