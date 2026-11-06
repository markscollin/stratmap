/// <reference types="node" />
import { appendFileSync } from 'node:fs'
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
    // e2e tests read invite links from here instead of a real inbox (roadmap 3.3).
    if (process.env.E2E_EMAIL_OUTBOX) {
      appendFileSync(process.env.E2E_EMAIL_OUTBOX, JSON.stringify(opts) + '\n')
    }
    console.warn(`[email] RESEND_API_KEY not set — skipping email to ${opts.to} ("${opts.subject}")`)
    return { sent: false, skipped: true }
  }
  await client.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html })
  return { sent: true }
}

/** Escapes user-controlled text (workspace and user names) before it goes into email HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  const ws = escapeHtml(opts.workspaceName)
  const inviter = escapeHtml(opts.inviterName)
  const url = escapeHtml(opts.inviteUrl)
  // Subject is plain text, but strip line breaks so names can't inject headers.
  const subject = `${opts.inviterName} invited you to ${opts.workspaceName} on StratMap`.replace(/[\r\n]+/g, ' ')
  const html = shell(
    `You've been invited to ${ws}`,
    `<p style="font-size:14px;line-height:1.6">${inviter} has invited you to collaborate on
      <strong>${ws}</strong> in StratMap.</p>
     <p style="margin:24px 0">
       <a href="${url}" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Accept invitation</a>
     </p>
     <p style="font-size:12px;color:#94a3b8">This link expires in 7 days and can be used once.
       Sign in with this email address (${escapeHtml(opts.to)}) to accept.</p>
     <p style="font-size:12px;color:#94a3b8">Or paste this link into your browser: ${url}</p>`,
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

/** Sent to workspace admins when a renewal payment fails (roadmap 1.3). */
export async function sendPaymentFailed(opts: {
  to: string
  workspaceName: string
  planName: string
  /** When Stripe will retry the card, if it will. */
  nextAttempt: Date | null
  manageUrl: string
}): Promise<SendResult> {
  const ws = escapeHtml(opts.workspaceName)
  const plan = escapeHtml(opts.planName)
  const url = escapeHtml(opts.manageUrl)
  const subject = `Payment failed for ${opts.workspaceName} on StratMap`.replace(/[\r\n]+/g, ' ')
  const retry = opts.nextAttempt
    ? `We'll try again on ${opts.nextAttempt.toUTCString().slice(0, 16)}.`
    : `We won't retry this card again.`
  const html = shell(
    `We couldn't take your payment`,
    `<p style="font-size:14px;line-height:1.6">The latest payment for the <strong>${plan}</strong> plan on
      <strong>${ws}</strong> didn't go through. ${retry} Your workspace keeps the ${plan} plan while we retry.
      If the payment still fails, it moves to the Free plan. Your charts are never deleted.</p>
     <p style="margin:24px 0">
       <a href="${url}" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Update payment method</a>
     </p>
     <p style="font-size:12px;color:#94a3b8">Or paste this link into your browser: ${url}</p>`,
  )
  return sendEmail({ to: opts.to, subject, html })
}

/** Tells a member that their workspace was deleted (roadmap 4.2). Sent to every member, owner included. */
export async function sendWorkspaceDeleted(opts: {
  to: string
  workspaceName: string
  eraseOn: Date
  isOwner: boolean
}): Promise<SendResult> {
  const ws = escapeHtml(opts.workspaceName)
  const date = opts.eraseOn.toISOString().slice(0, 10)
  const subject = `${opts.workspaceName} was deleted on StratMap`.replace(/[\r\n]+/g, ' ')
  const body = opts.isOwner
    ? `<p style="font-size:14px;line-height:1.6">You deleted <strong>${ws}</strong>. Its members no longer have access and its subscription was cancelled.</p>
       <p style="font-size:14px;line-height:1.6">You can restore it until <strong>${date}</strong> by signing in to StratMap. After that date everything in it is permanently erased. A restored workspace starts on the Free plan.</p>`
    : `<p style="font-size:14px;line-height:1.6">The owner of <strong>${ws}</strong> has deleted it, so you no longer have access to it.</p>
       <p style="font-size:14px;line-height:1.6">The workspace and everything in it will be permanently erased on <strong>${date}</strong>. If you need anything from it, ask the owner, who can still restore it until then.</p>`
  return sendEmail({ to: opts.to, subject, html: shell(`${ws} was deleted`, body) })
}
