// Who last changed something, as a person would read it (R-52). The server stores an opaque user id; showing it
// ("Updated by user_2Abc…") is meaningless, so look the person up in the workspace's members.
export interface NamedMember { user: { id: string; name?: string; email?: string } }

/**
 * "You" for the signed-in person, the member's name (or email), "a former member" for an id nobody in the workspace has,
 * and null when nothing was recorded. The literal "You" is what the stores write for an unsaved local change.
 */
export function personLabel(userId: string | null | undefined, me: string, members: readonly NamedMember[] | undefined): string | null {
  const id = (userId ?? '').trim()
  if (!id) return null
  if (id === 'You' || id === me) return 'You'
  const m = members?.find(x => x.user.id === id)
  return m ? (m.user.name?.trim() || m.user.email || 'a member') : 'a former member'
}
