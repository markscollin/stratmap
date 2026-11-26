// What an approval means for later edits (R-68, owner decision D-7, 2026-11-26). One pure rule, used by the API and the screens.
//  - Anyone who may edit (editor and up) may take a job description or a hire plan OUT of approved (that is a visible, deliberate step).
//  - An editor's change to the text of an approved job description sends it back to review (so an approval is never silently outdated).
//  - An editor cannot edit or delete an approved hire plan (only change its status); admins and owners can.

export type JDStatus = 'draft' | 'in-review' | 'approved' | 'published' | 'hired'
export type HeadcountStatus = 'planned' | 'approved' | 'filled'

/** Job description states that count as signed off. */
export const APPROVED_JD_STATUSES: readonly JDStatus[] = ['approved', 'published', 'hired']

/** True when an edit of a JD's text by this person moves it back to review: an approved JD edited by someone below admin. */
export function jdEditSendsBackToReview(status: string, isAdmin: boolean): boolean {
  return !isAdmin && (APPROVED_JD_STATUSES as readonly string[]).includes(status)
}

/** True when this person may only change the plan's status (not edit or delete it): an approved plan, someone below admin. */
export function headcountPlanLocked(status: string, isAdmin: boolean): boolean {
  return !isAdmin && status === 'approved'
}

export const APPROVED_PLAN_MESSAGE = 'This hire is approved. Move it back to Planned to change it, or ask an admin.'
export const APPROVED_JD_NOTICE = 'This job description is approved. If you change it, it goes back to review.'
