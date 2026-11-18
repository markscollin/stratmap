// Launch review R-48: the minimap's dots take their colour from the same department lookup as the cards. They used a hard-coded
// table keyed by 'eng', 'product'… that no real department id matches, so every dot was grey.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Minimap } from '../Minimap'
import type { OrgNode } from '../../../types'

const node = (id: string, departmentId: string, x: number): OrgNode => ({
  id, name: id, title: 't', departmentId, managerId: null, status: 'active', employmentType: 'full-time', x, y: 0,
})
const fills = (c: HTMLElement) => [...c.querySelectorAll('svg rect[rx="2"]')].map(r => r.getAttribute('fill')).filter(f => f && !f.startsWith('rgba'))

describe('Minimap colours (R-48)', () => {
  const props = { transform: { x: 0, y: 0, scale: 1 }, vpW: 800, vpH: 600, onPanTo: () => {} }

  it("colours a dot with its department's colour, whatever the id looks like", () => {
    const { container } = render(<Minimap {...props} nodes={[node('a', '16841415-5204-4aaa', 0), node('b', 'ws-dept', 300)]}
      departments={[{ id: '16841415-5204-4aaa', name: 'Eng', colour: '#112233' }, { id: 'ws-dept', name: 'Ops', colour: '#445566' }]} />)
    expect(fills(container)).toEqual(['#112233', '#445566'])
  })

  it('is grey for a role with no known department', () => {
    const { container } = render(<Minimap {...props} nodes={[node('a', 'gone', 0)]} departments={[]} />)
    expect(fills(container)).toEqual(['#94A3B8'])
  })
})
