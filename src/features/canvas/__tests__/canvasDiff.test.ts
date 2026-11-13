import { describe, it, expect } from 'vitest'
import { diffCanvas } from '../canvasDiff'
import type { OrgNode, OrgEdge } from '../../../types'

const role = (id: string, over: Partial<OrgNode> = {}): OrgNode => ({
  id, name: id.toUpperCase(), title: 'Eng', departmentId: 'd1', managerId: null, status: 'active',
  employmentType: 'full-time', x: 0, y: 0, ...over,
})
const line = (id: string, sourceId: string, targetId: string): OrgEdge => ({ id, sourceId, targetId })

describe('diffCanvas: what undo/redo must tell the server', () => {
  it('nothing changed → nothing to send', () => {
    const s = { nodes: [role('a')], edges: [] }
    expect(diffCanvas(s, s)).toEqual([])
  })

  it('undo of an add: delete the role (and not its line separately)', () => {
    const from = { nodes: [role('a'), role('b')], edges: [line('e1', 'a', 'b')] }
    const to = { nodes: [role('a')], edges: [] }
    expect(diffCanvas(from, to)).toEqual([{ kind: 'delete-role', id: 'b' }])
  })

  it('undo of a delete: bring the role back, then its lines, then place it', () => {
    const from = { nodes: [role('a')], edges: [] }
    const b = role('b', { x: 40, y: 80 })
    const to = { nodes: [role('a'), b], edges: [line('e1', 'a', 'b')] }
    expect(diffCanvas(from, to)).toEqual([
      { kind: 'bring-back-role', node: b },
      { kind: 'add-line', edge: line('e1', 'a', 'b') },
      { kind: 'move', positions: [{ id: 'b', x: 40, y: 80 }] },
    ])
  })

  it('undo of an edit: sends only the fields that changed', () => {
    const from = { nodes: [role('a', { title: 'New title', location: 'Paris' })], edges: [] }
    const to = { nodes: [role('a', { title: 'Old title' })], edges: [] }
    expect(diffCanvas(from, to)).toEqual([{ kind: 'edit-role', id: 'a', fields: { title: 'Old title', location: null } }])
  })

  it('a field cleared that the server cannot hold as null is not sent as null', () => {
    const from = { nodes: [role('a', { name: 'X' })], edges: [] }
    const to = { nodes: [role('a', { name: undefined as never })], edges: [] }
    expect(diffCanvas(from, to)).toEqual([])
  })

  it('undo of a move: positions only', () => {
    const from = { nodes: [role('a', { x: 100, y: 100 }), role('b', { x: 5, y: 5 })], edges: [] }
    const to = { nodes: [role('a', { x: 0, y: 0 }), role('b', { x: 5, y: 5 })], edges: [] }
    expect(diffCanvas(from, to)).toEqual([{ kind: 'move', positions: [{ id: 'a', x: 0, y: 0 }] }])
  })

  it('undo of drawing a line deletes it; undo of removing one draws it again under the same id', () => {
    const base = [role('a'), role('b')]
    expect(diffCanvas({ nodes: base, edges: [line('e1', 'a', 'b')] }, { nodes: base, edges: [] })).toEqual([{ kind: 'delete-line', id: 'e1' }])
    expect(diffCanvas({ nodes: base, edges: [] }, { nodes: base, edges: [line('e1', 'a', 'b')] })).toEqual([{ kind: 'add-line', edge: line('e1', 'a', 'b') }])
  })

  it('orders writes so each can succeed: lines and roles gone, roles back, edits, lines back, positions', () => {
    const from = { nodes: [role('a', { title: 'x' }), role('gone'), role('keep')], edges: [line('old', 'a', 'keep')] }
    const to = { nodes: [role('a', { title: 'y', x: 9 }), role('keep'), role('back')], edges: [line('new', 'a', 'back')] }
    expect(diffCanvas(from, to).map(w => w.kind)).toEqual([
      'delete-line', 'delete-role', 'bring-back-role', 'edit-role', 'add-line', 'move',
    ])
  })
})
