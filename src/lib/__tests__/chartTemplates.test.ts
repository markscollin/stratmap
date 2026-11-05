import { describe, it, expect } from 'vitest'
import { buildChartTemplate, type ChartTemplateId } from '../chartTemplates'

const TEMPLATES: ChartTemplateId[] = ['startup', 'scaleup', 'hiring', 'quickstart']

describe('chart templates', () => {
  it.each(TEMPLATES)('%s brings exactly the departments its roles use', (t) => {
    const { nodes, departments } = buildChartTemplate(t)
    expect(nodes.length).toBeGreaterThan(0)
    const used = new Set(nodes.map(n => n.departmentId))
    expect(new Set(departments.map(d => d.id))).toEqual(used)
  })

  it.each(TEMPLATES)('%s has no made-up people', (t) => {
    const { nodes } = buildChartTemplate(t)
    for (const n of nodes) {
      // Names are role labels (the title, or a role like "Founder"), never a person's name.
      expect(n.name).toMatch(/Lead|Head|Founder|CEO|CTO|CPO|Officer|Engineer|Manager|Rep|Analyst|VP|Marketing|Operations|Ops|Sales/)
    }
  })

  it.each(TEMPLATES)('%s edges only connect its own nodes', (t) => {
    const { nodes, edges } = buildChartTemplate(t)
    const ids = new Set(nodes.map(n => n.id))
    expect(edges.every(e => ids.has(e.sourceId) && ids.has(e.targetId))).toBe(true)
  })

  it("a blank chart starts with the workspace's departments, linked to them", () => {
    const { nodes, departments } = buildChartTemplate('blank', [{ id: 'wd-1', name: 'People', colour: '#123456' }])
    expect(nodes).toEqual([])
    expect(departments).toEqual([{ id: 'wd-1', name: 'People', colour: '#123456', workspaceDepartmentId: 'wd-1' }])
  })

  it('a blank chart in a workspace without departments has none', () => {
    expect(buildChartTemplate('blank').departments).toEqual([])
  })
})
