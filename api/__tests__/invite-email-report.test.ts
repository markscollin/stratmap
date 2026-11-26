// R-72: when an invite email fails, the error report names the invite, never the invitee's address.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
const reports: unknown[][] = []
vi.mock('../_lib/sentry', () => ({ reportError: (...a: unknown[]) => { reports.push(a) } }))
vi.mock('../_lib/email', async (orig) => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendWorkspaceInvite: vi.fn().mockRejectedValue(new Error('mail provider down')),
}))

import { sendInviteEmail } from '../_lib/invites'
import { setupSchema, cleanDb, seedWorkspace, TEST_WS_ID, TEST_USER_ID } from './helpers/db'

beforeAll(async () => { await setupSchema() })
beforeEach(async () => { await cleanDb(); await seedWorkspace(); reports.length = 0; vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('a failed invite email (R-72)', () => {
  it('is reported with the invite id and without the address', async () => {
    await sendInviteEmail({ inviteId: 'inv-42', workspaceId: TEST_WS_ID, inviterUserId: TEST_USER_ID, email: 'private.person@example.com', token: 't'.repeat(43) })
    expect(reports).toHaveLength(1)
    expect(reports[0][1]).toEqual({ route: 'invites', inviteId: 'inv-42' })
    expect(JSON.stringify(reports)).not.toContain('private.person@example.com')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private.person@example.com')
  })
})
