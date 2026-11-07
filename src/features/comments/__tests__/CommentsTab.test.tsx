import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api, ApiError } from '../../../lib/apiClient'
import { CommentsTab } from '../CommentsTab'
import { useUserStore, MOCK_WORKSPACE } from '../../../store/userStore'
import type { RoleComment } from '../../../lib/comments'
import type { Permission } from '../../../types'

const member = (id: string, name: string) => ({ user: { id, name, email: `${id}@co.com` }, permission: 'editor' as Permission, joinedAt: '2026-01-01' })
const MEMBERS = [member('u-me', 'Me Myself'), member('u-grace', 'Grace Hopper'), member('u-ada', 'Ada Lovelace')]

let n = 0
const comment = (id: string, over: Partial<RoleComment> = {}): RoleComment => ({
  id, nodeId: 'node-1', parentId: null, authorId: 'u-grace', authorName: 'Grace Hopper', body: `Body of ${id}`, mentions: [],
  createdAt: new Date(Date.UTC(2026, 10, 7, 10, n++)).toISOString(), editedAt: null, deleted: false, resolved: false, resolvedBy: null, ...over,
})

let stored: RoleComment[] = []
const onChanged = vi.fn()

function setup(permission: Permission, comments: RoleComment[] = []) {
  vi.clearAllMocks()
  n = 0
  stored = comments
  vi.mocked(api.get).mockImplementation(() => Promise.resolve({ comments: stored }) as never)
  vi.mocked(api.post).mockResolvedValue({} as never)
  vi.mocked(api.put).mockResolvedValue({} as never)
  vi.mocked(api.delete).mockResolvedValue(undefined as never)
  useUserStore.setState({ user: { id: 'u-me', name: 'Me Myself', email: 'u-me@co.com' }, permission, workspace: { ...MOCK_WORKSPACE, members: MEMBERS } })
  return render(<CommentsTab chartId="chart-1" nodeId="node-1" onChanged={onChanged} />)
}
const composer = () => screen.getByLabelText('Add a comment about this role') as HTMLTextAreaElement
const type = (el: HTMLTextAreaElement, value: string) => fireEvent.change(el, { target: { value, selectionStart: value.length } })

describe('reading and permissions', () => {
  it('shows the discussion oldest first, with threads and replies', async () => {
    setup('commenter', [comment('a'), comment('b'), comment('r1', { parentId: 'a', authorName: 'Ada Lovelace', authorId: 'u-ada' })])
    expect(await screen.findByText('Body of a')).toBeInTheDocument()
    const threads = screen.getAllByTestId('comment-thread')
    expect(threads).toHaveLength(2)
    expect(within(threads[0]).getByText('Body of r1')).toBeInTheDocument()
    expect(within(threads[1]).queryByText('Body of r1')).toBeNull()
    expect(api.get).toHaveBeenCalledWith('/api/charts/chart-1/comments?nodeId=node-1')
  })

  it('says so when nobody has commented yet', async () => {
    setup('commenter')
    expect(await screen.findByText(/No comments yet/)).toBeInTheDocument()
  })

  it('a viewer can read but gets no composer and no write actions', async () => {
    setup('viewer', [comment('a', { authorId: 'u-me', authorName: 'Me Myself' })])
    expect(await screen.findByText('Body of a')).toBeInTheDocument()
    expect(screen.getByText(/Viewers can read comments but not write them/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a comment about this role')).toBeNull()
    for (const name of ['Reply', 'Resolve', 'Edit']) expect(screen.queryByRole('button', { name })).toBeNull()
    // ...but the author can still take back their own comment
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('shows "A former member" for an author who has left, and a placeholder for a deleted comment', async () => {
    setup('commenter', [comment('a', { authorName: null, authorId: 'u-gone' }), comment('b', { deleted: true, body: '' })])
    expect(await screen.findByText('A former member')).toBeInTheDocument()
    expect(screen.getByText('This comment was deleted.')).toBeInTheDocument()
  })

  it('shows the server message if the comments cannot be loaded', async () => {
    setup('commenter')
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(404, { error: 'x', message: 'Chart not found' }))
    render(<CommentsTab chartId="gone" nodeId="n" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Chart not found')
  })
})

describe('writing', () => {
  it('posts a comment, clears the box, reloads and tells the canvas', async () => {
    setup('commenter')
    await screen.findByText(/No comments yet/)
    type(composer(), '  Is this level right?  ')
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/charts/chart-1/comments', { nodeId: 'node-1', body: 'Is this level right?', mentions: [] }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(composer().value).toBe('')
  })

  it('cannot send an empty comment or one over 2000 characters, and sends with Ctrl+Enter', async () => {
    setup('commenter')
    await screen.findByText(/No comments yet/)
    const send = screen.getByRole('button', { name: 'Comment' })
    expect(send).toBeDisabled()
    type(composer(), '   ')
    expect(send).toBeDisabled()
    type(composer(), 'x'.repeat(2001))
    expect(send).toBeDisabled()
    expect(screen.getByText('2001 / 2000')).toBeInTheDocument()
    type(composer(), 'ok')
    expect(send).toBeEnabled()
    fireEvent.keyDown(composer(), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
  })

  it('shows the server message when posting fails, and keeps what was typed', async () => {
    setup('commenter')
    await screen.findByText(/No comments yet/)
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(429, { error: 'rate-limited', message: 'Slow down a little.' }))
    type(composer(), 'Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Slow down a little.')
    expect(composer().value).toBe('Hello')
  })

  it('replies go to the first comment of the thread', async () => {
    setup('commenter', [comment('a')])
    fireEvent.click(await screen.findByRole('button', { name: 'Reply' }))
    const box = screen.getByLabelText('Write a reply') as HTMLTextAreaElement
    type(box, 'Agreed')
    const form = box.closest('[data-testid="comment-composer"]') as HTMLElement
    fireEvent.click(within(form).getByRole('button', { name: 'Reply' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/charts/chart-1/comments', { nodeId: 'node-1', body: 'Agreed', mentions: [], parentId: 'a' }))
  })
})

describe('@mentions', () => {
  it('typing @ offers teammates (not yourself); picking one inserts the name and sends their id', async () => {
    setup('commenter')
    await screen.findByText(/No comments yet/)
    type(composer(), 'Thoughts @gr')
    const options = await screen.findAllByTestId('mention-option')
    expect(options.map(o => o.textContent)).toEqual(['Grace Hopper'])
    fireEvent.mouseDown(options[0])
    await waitFor(() => expect(composer().value).toBe('Thoughts @Grace Hopper '))
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/charts/chart-1/comments', expect.objectContaining({ body: 'Thoughts @Grace Hopper', mentions: ['u-grace'] })))
  })

  it('never offers yourself', async () => {
    setup('commenter')
    await screen.findByText(/No comments yet/)
    type(composer(), '@me')
    expect(screen.queryAllByTestId('mention-option')).toHaveLength(0)
  })

  it('the keyboard picks: arrows move, Enter chooses', async () => {
    setup('commenter')
    await screen.findByText(/No comments yet/)
    type(composer(), '@')
    expect((await screen.findAllByTestId('mention-option')).map(o => o.textContent)).toEqual(['Grace Hopper', 'Ada Lovelace'])
    fireEvent.keyDown(composer(), { key: 'ArrowDown' })
    fireEvent.keyDown(composer(), { key: 'Enter' })
    await waitFor(() => expect(composer().value).toBe('@Ada Lovelace '))
  })

  it('a name typed by hand is not a mention, and deleting a picked name un-mentions them', async () => {
    setup('commenter')
    await screen.findByText(/No comments yet/)
    type(composer(), 'ping @Grace Hopper')
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ mentions: [] })))

    type(composer(), '@ad')
    fireEvent.mouseDown((await screen.findAllByTestId('mention-option'))[0])
    await waitFor(() => expect(composer().value).toBe('@Ada Lovelace '))
    type(composer(), 'never mind')
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ body: 'never mind', mentions: [] })))
  })

  it('highlights people who were really mentioned in a saved comment', async () => {
    setup('commenter', [comment('a', { body: 'Hi @Ada Lovelace and @nobody', mentions: ['u-ada'] })])
    const highlighted = await screen.findByText('@Ada Lovelace')
    expect(highlighted.tagName).toBe('SPAN')
    expect(highlighted).toHaveStyle({ fontWeight: '600' })
    expect(screen.queryByText('@nobody')).toBeNull()                 // plain text, part of a longer span
  })
})

describe('resolve, edit and delete', () => {
  it('resolving a thread files it away under "Show 1 resolved thread", and it can be reopened', async () => {
    setup('commenter', [comment('a')])
    // the "server" applies the change, so the reload after it shows the thread as resolved (or open again)
    vi.mocked(api.put).mockImplementation((_path, body) => {
      const resolved = (body as { resolved: boolean }).resolved
      stored = [comment('a', { resolved, resolvedBy: resolved ? 'u-ada' : null })]
      return Promise.resolve({} as never)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/charts/chart-1/comments/a', { resolved: true }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: /Show 1 resolved thread$/ }))
    expect(await screen.findByText(/Resolved by Ada Lovelace/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/api/charts/chart-1/comments/a', { resolved: false }))
  })

  it('resolved threads are hidden until asked for', async () => {
    setup('commenter', [comment('a', { resolved: true }), comment('b')])
    expect(await screen.findByText('Body of b')).toBeInTheDocument()
    expect(screen.queryByText('Body of a')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show 1 resolved thread$/ }))
    expect(screen.getByText('Body of a')).toBeInTheDocument()
  })

  it('you can edit your own comment, not someone else\'s', async () => {
    setup('commenter', [comment('mine', { authorId: 'u-me', authorName: 'Me Myself' }), comment('theirs')])
    await screen.findByText('Body of mine')
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByLabelText('Edit your comment') as HTMLTextAreaElement
    expect(box.value).toBe('Body of mine')
    type(box, 'Fixed typo')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/charts/chart-1/comments/mine', { body: 'Fixed typo', mentions: [] }))
  })

  it('shows that a comment was edited', async () => {
    setup('commenter', [comment('a', { editedAt: '2026-11-07T11:00:00Z' })])
    expect(await screen.findByText('edited')).toBeInTheDocument()
  })

  it('a commenter can delete only their own comment, after confirming', async () => {
    setup('commenter', [comment('mine', { authorId: 'u-me', authorName: 'Me Myself' }), comment('theirs')])
    await screen.findByText('Body of mine')
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete for everyone' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/charts/chart-1/comments/mine'))
  })

  it('an admin can delete anyone\'s comment but not edit it', async () => {
    setup('admin', [comment('theirs')])
    await screen.findByText('Body of theirs')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
})

describe('a failure never loses what was written', () => {
  it('a failed reply keeps the reply box open with its text', async () => {
    setup('commenter', [comment('a')])
    fireEvent.click(await screen.findByRole('button', { name: 'Reply' }))
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(500, { error: 'x', message: 'Try again later.' }))
    const box = screen.getByLabelText('Write a reply') as HTMLTextAreaElement
    type(box, 'Important point')
    fireEvent.click(within(box.closest('[data-testid="comment-composer"]') as HTMLElement).getByRole('button', { name: 'Reply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again later.')
    expect((screen.getByLabelText('Write a reply') as HTMLTextAreaElement).value).toBe('Important point')
  })

  it('a failed edit stays in edit mode with the new text', async () => {
    setup('commenter', [comment('mine', { authorId: 'u-me', authorName: 'Me Myself' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    vi.mocked(api.put).mockRejectedValueOnce(new ApiError(403, { error: 'forbidden', message: 'You can only edit your own comments.' }))
    type(screen.getByLabelText('Edit your comment') as HTMLTextAreaElement, 'New words')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('only edit your own')
    expect((screen.getByLabelText('Edit your comment') as HTMLTextAreaElement).value).toBe('New words')
  })
})
