/// <reference types="node" />
import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'StratMap <onboarding@stratmap.app>'

export interface SendResult {
  sent: boolean
  skipped?: boolean
}

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

// Generic send. No-ops (skipped) when RESEND_API_KEY is unset so local/dev and
// tests never hit the network — mirrors the AI route's graceful degradation.
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<SendResult> {
  const client = getClient()
  if (!client) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email to ${opts.to} ("${opts.subject}")`)
    return { sent: false, skipped: true }
  }
  await client.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html })
  return { sent: true }
}

function shell(title: string, body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0d1b2a">
    <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
    ${body}
    <p style="font-size:12px;color:#94a3b8;margin-top:32px">StratMap — collaborative org charts &amp; people planning</p>
  </div>`
}

export async function sendWorkspaceInvite(opts: {
  to: string
  workspaceName: string
  inviterName: string
  inviteUrl: string
}): Promise<SendResult> {
  const subject = `${opts.inviterName} invited you to ${opts.workspaceName} on StratMap`
  const html = shell(
    `You've been invited to ${opts.workspaceName}`,
    `<p style="font-size:14px;line-height:1.6">${opts.inviterName} has invited you to collaborate on
      <strong>${opts.workspaceName}</strong> in StratMap.</p>
     <p style="margin:24px 0">
       <a href="${opts.inviteUrl}" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Accept invitation</a>
     </p>
     <p style="font-size:12px;color:#94a3b8">Or paste this link into your browser: ${opts.inviteUrl}</p>`,
  )
  return sendEmail({ to: opts.to, subject, html })
}

// Prepared for the billing-receipt path (wire from the Stripe webhook once live).
export async function sendBillingReceipt(opts: {
  to: string
  planName: string
  manageUrl: string
}): Promise<SendResult> {
  const subject = `Your StratMap ${opts.planName} subscription is active`
  const html = shell(
    `Welcome to ${opts.planName}`,
    `<p style="font-size:14px;line-height:1.6">Your subscription is now active. Thank you for supporting StratMap.</p>
     <p style="margin:24px 0">
       <a href="${opts.manageUrl}" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Manage billing</a>
     </p>`,
  )
  return sendEmail({ to: opts.to, subject, html })
}
