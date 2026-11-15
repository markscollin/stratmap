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
  // The subject carries none of the inviter's or workspace's text: anyone can pick those, and a subject with a stranger's
  // words in it, sent from our domain, is a phishing line (R-33). They appear escaped in the body, where the recipient
  // has already chosen to look.
  const subject = `You've been invited to a workspace on StratMap`
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
    ? `<p style="font-size:14px;line-height:1.6">You deleted <strong>${ws}</strong>. Its members no longer have access and its subscription will not renew.</p>
       <p style="font-size:14px;line-height:1.6">You can restore it until <strong>${date}</strong> by signing in to StratMap. After that date everything in it is permanently erased. A restored workspace starts on the Free plan.</p>`
    : `<p style="font-size:14px;line-height:1.6">The owner of <strong>${ws}</strong> has deleted it, so you no longer have access to it.</p>
       <p style="font-size:14px;line-height:1.6">The workspace and everything in it will be permanently erased on <strong>${date}</strong>. If you need anything from it, ask the owner, who can still restore it until then.</p>`
  return sendEmail({ to: opts.to, subject, html: shell(`${ws} was deleted`, body) })
}

/** Tells a member about a comment that mentions them or replies to theirs (roadmap 5). Comment text is escaped. */
export async function sendCommentNotification(opts: {
  to: string
  reason: 'mention' | 'reply'
  authorName: string
  workspaceName: string
  chartName: string
  roleTitle: string
  body: string
  url: string
}): Promise<SendResult> {
  const author = escapeHtml(opts.authorName)
  const where = `${escapeHtml(opts.roleTitle)} in ${escapeHtml(opts.chartName)}`
  const what = opts.reason === 'mention' ? 'mentioned you in a comment' : 'replied to your comment'
  const subject = `${opts.authorName} ${what} on ${opts.roleTitle}`.replace(/[\r\n]+/g, ' ')
  const html = shell(
    `${author} ${what}`,
    `<p style="font-size:13px;color:#64748b;margin:0 0 12px">${where} · ${escapeHtml(opts.workspaceName)}</p>
     <blockquote style="margin:0 0 20px;padding:12px 14px;background:#f1f5f9;border-radius:8px;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(opts.body)}</blockquote>
     <p style="margin:24px 0">
       <a href="${escapeHtml(opts.url)}" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Open the discussion</a>
     </p>
     <p style="font-size:12px;color:#94a3b8">You can turn these emails off in StratMap under Settings, Notifications.</p>`,
  )
  return sendEmail({ to: opts.to, subject, html })
}

/** Tells owners and admins a paid trial is about to end, or has ended (R-40). The Free limits come from plans.ts. */
export async function sendTrialEnding(opts: {
  to: string
  workspaceName: string
  /** Name of the trial plan, e.g. "Growth". */
  planName: string
  /** The day the trial ends. */
  endsOn: Date
  /** true: it has already ended. */
  ended: boolean
  limits: { charts: number; rolesPerChart: number; members: number }
  pricingUrl: string
}): Promise<SendResult> {
  const ws = escapeHtml(opts.workspaceName)
  const plan = escapeHtml(opts.planName)
  const url = escapeHtml(opts.pricingUrl)
  const date = opts.endsOn.toISOString().slice(0, 10)
  const { charts, rolesPerChart, members } = opts.limits
  const subject = (opts.ended
    ? `Your ${opts.planName} trial for ${opts.workspaceName} has ended`
    : `Your ${opts.planName} trial for ${opts.workspaceName} ends on ${date}`).replace(/[\r\n]+/g, ' ')
  const free = `The Free plan includes ${charts} chart, ${rolesPerChart} roles per chart and ${members} members. Nothing is deleted, but any chart over those limits is view-only until you upgrade.`
  const lead = opts.ended
    ? `The free <strong>${plan}</strong> trial for <strong>${ws}</strong> ended on ${date}, so the workspace is now on the Free plan.`
    : `The free <strong>${plan}</strong> trial for <strong>${ws}</strong> ends on <strong>${date}</strong>, after which the workspace moves to the Free plan.`
  const html = shell(
    opts.ended ? 'Your trial has ended' : 'Your trial is ending soon',
    `<p style="font-size:14px;line-height:1.6">${lead} ${free}</p>
     <p style="margin:24px 0">
       <a href="${url}" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">See plans</a>
     </p>
     <p style="font-size:12px;color:#94a3b8">Or paste this link into your browser: ${url}</p>`,
  )
  return sendEmail({ to: opts.to, subject, html })
}

/** A plain note to the StratMap owner about something in Stripe a human must look at (refund, dispute, lost webhook). No customer personal data. */
export async function sendBillingAlert(opts: { to: string; subject: string; lines: string[] }): Promise<SendResult> {
  const items = opts.lines.map(l => `<li style="margin:4px 0">${escapeHtml(l)}</li>`).join('')
  return sendEmail({
    to: opts.to,
    subject: opts.subject.replace(/[\r\n]+/g, ' '),
    html: shell(escapeHtml(opts.subject), `<ul style="font-size:14px;line-height:1.6;padding-left:18px">${items}</ul>`),
  })
}
