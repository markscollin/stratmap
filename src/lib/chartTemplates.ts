import type { OrgNode, OrgEdge, Department } from '../types'

// Starter content for new charts. These are templates the user picks
// ("Startup", "Scale-up", …), not sample data: role labels only, no made-up people,
// and each template brings only the departments its roles use.

export type ChartTemplateId = 'blank' | 'startup' | 'scaleup' | 'hiring' | 'quickstart'

/** Departments the templates can draw on. Ids are template-local; the API gives each chart fresh ids. */
export const TEMPLATE_DEPARTMENTS: Department[] = [
  { id: 'leadership', name: 'Leadership',   colour: '#64748B' },
  { id: 'eng',        name: 'Engineering',  colour: '#0EA5E9' },
  { id: 'product',    name: 'Product',      colour: '#10B981' },
  { id: 'design',     name: 'Design',       colour: '#8B5CF6' },
  { id: 'go',         name: 'Go-to-Market', colour: '#F59E0B' },
  { id: 'ops',        name: 'Operations',   colour: '#EF4444' },
  { id: 'finance',    name: 'Finance',      colour: '#06B6D4' },
]

export interface WorkspaceDepartmentLike { id: string; name: string; colour: string }

/**
 * Nodes, edges and departments for a new chart.
 * - Templates include only the departments their roles use.
 * - A blank chart starts with the workspace's own departments (none if it has none).
 */
export function buildChartTemplate(
  template: ChartTemplateId,
  workspaceDepartments: WorkspaceDepartmentLike[] = [],
): { nodes: OrgNode[]; edges: OrgEdge[]; departments: Department[] } {
  if (template === 'blank') {
    return {
      nodes: [],
      edges: [],
      departments: workspaceDepartments.map(d => ({ id: d.id, name: d.name, colour: d.colour, workspaceDepartmentId: d.id })),
    }
  }
  const { nodes, edges } = templateStructure(template)
  const used = new Set(nodes.map(n => n.departmentId).filter(Boolean))
  return { nodes, edges, departments: TEMPLATE_DEPARTMENTS.filter(d => used.has(d.id)) }
}

function templateStructure(template: ChartTemplateId): { nodes: OrgNode[]; edges: OrgEdge[] } {
  if (template === 'blank') return { nodes: [], edges: [] }

  const t = Date.now()
  const id = (n: number) => `n${t}${n}`
  const eid = (n: number) => `e${t}${n}`

  if (template === 'startup') {
    // Flat 5-node startup: CEO + 4 leads
    const nodes: OrgNode[] = [
      { id: id(0), name: 'Founder',        title: 'CEO',              departmentId: 'leadership',     managerId: null,  status: 'active', employmentType: 'full-time', x: 390, y: 50  },
      { id: id(1), name: 'Engineering Lead', title: 'CTO',            departmentId: 'eng',     managerId: id(0), status: 'active', employmentType: 'full-time', x: 60,  y: 220 },
      { id: id(2), name: 'Product Lead',   title: 'Head of Product',  departmentId: 'product', managerId: id(0), status: 'active', employmentType: 'full-time', x: 280, y: 220 },
      { id: id(3), name: 'Design Lead',    title: 'Head of Design',   departmentId: 'design',  managerId: id(0), status: 'active', employmentType: 'full-time', x: 500, y: 220 },
      { id: id(4), name: 'Sales Lead',     title: 'VP Sales',         departmentId: 'go',      managerId: id(0), status: 'active', employmentType: 'full-time', x: 720, y: 220 },
    ]
    const edges: OrgEdge[] = [
      { id: eid(1), sourceId: id(0), targetId: id(1) },
      { id: eid(2), sourceId: id(0), targetId: id(2) },
      { id: eid(3), sourceId: id(0), targetId: id(3) },
      { id: eid(4), sourceId: id(0), targetId: id(4) },
    ]
    return { nodes, edges }
  }

  if (template === 'scaleup') {
    // Functional departments: CEO → CTO/CPO/VP GTM/CFO, each with 2–3 ICs
    const nodes: OrgNode[] = [
      { id: id(0),  name: 'Chief Executive Officer',   title: 'Chief Executive Officer',  departmentId: 'leadership',     managerId: null,  status: 'active', employmentType: 'full-time', x: 980,  y: 50  },
      { id: id(1),  name: 'Chief Technology Officer', title: 'Chief Technology Officer',  departmentId: 'eng',     managerId: id(0), status: 'active', employmentType: 'full-time', x: 240,  y: 220 },
      { id: id(2),  name: 'Chief Product Officer',     title: 'Chief Product Officer',     departmentId: 'product', managerId: id(0), status: 'active', employmentType: 'full-time', x: 800,  y: 220 },
      { id: id(3),  name: 'VP Go-to-Market',     title: 'VP Go-to-Market',           departmentId: 'go',      managerId: id(0), status: 'active', employmentType: 'full-time', x: 1290, y: 220 },
      { id: id(4),  name: 'Finance Manager',   title: 'Finance Manager',           departmentId: 'finance', managerId: id(0), status: 'active', employmentType: 'full-time', x: 1690, y: 220 },
      { id: id(5),  name: 'Senior Software Engineer',    title: 'Senior Software Engineer',  departmentId: 'eng',     managerId: id(1), status: 'active', employmentType: 'full-time', x: 20,   y: 400 },
      { id: id(6),  name: 'Senior Software Engineer',   title: 'Senior Software Engineer',  departmentId: 'eng',     managerId: id(1), status: 'active', employmentType: 'full-time', x: 240,  y: 400 },
      { id: id(7),  name: 'Software Engineer', title: 'Software Engineer',    departmentId: 'eng',     managerId: id(1), status: 'open',   employmentType: 'full-time', x: 460,  y: 400 },
      { id: id(8),  name: 'Product Manager',    title: 'Product Manager',           departmentId: 'product', managerId: id(2), status: 'active', employmentType: 'full-time', x: 720,  y: 400 },
      { id: id(9),  name: 'Product Manager', title: 'Product Manager',        departmentId: 'product', managerId: id(2), status: 'open',   employmentType: 'full-time', x: 940,  y: 400 },
      { id: id(10), name: 'Sales Development Rep',    title: 'Sales Development Rep',     departmentId: 'go',      managerId: id(3), status: 'active', employmentType: 'full-time', x: 1210, y: 400 },
      { id: id(11), name: 'Sales Development Rep',    title: 'Sales Development Rep',     departmentId: 'go',      managerId: id(3), status: 'active', employmentType: 'full-time', x: 1430, y: 400 },
      { id: id(12), name: 'Finance Analyst', title: 'Finance Analyst',        departmentId: 'finance', managerId: id(4), status: 'planned',employmentType: 'full-time', x: 1710, y: 400 },
    ]
    const edges: OrgEdge[] = [
      { id: eid(1),  sourceId: id(0), targetId: id(1)  },
      { id: eid(2),  sourceId: id(0), targetId: id(2)  },
      { id: eid(3),  sourceId: id(0), targetId: id(3)  },
      { id: eid(4),  sourceId: id(0), targetId: id(4)  },
      { id: eid(5),  sourceId: id(1), targetId: id(5)  },
      { id: eid(6),  sourceId: id(1), targetId: id(6)  },
      { id: eid(7),  sourceId: id(1), targetId: id(7)  },
      { id: eid(8),  sourceId: id(2), targetId: id(8)  },
      { id: eid(9),  sourceId: id(2), targetId: id(9)  },
      { id: eid(10), sourceId: id(3), targetId: id(10) },
      { id: eid(11), sourceId: id(3), targetId: id(11) },
      { id: eid(12), sourceId: id(4), targetId: id(12) },
    ]
    return { nodes, edges }
  }

  if (template === 'hiring') {
    // Hiring plan: active backbone + open/planned roles
    const nodes: OrgNode[] = [
      { id: id(0), name: 'CEO',                title: 'Chief Executive Officer', departmentId: 'leadership',     managerId: null,  status: 'active',  employmentType: 'full-time', x: 490, y: 50  },
      { id: id(1), name: 'Engineering Lead',   title: 'Head of Engineering',     departmentId: 'eng',     managerId: id(0), status: 'active',  employmentType: 'full-time', x: 60,  y: 220 },
      { id: id(2), name: 'Head of Product',    title: 'Head of Product',         departmentId: 'product', managerId: id(0), status: 'open',    employmentType: 'full-time', x: 280, y: 220 },
      { id: id(3), name: 'Head of Marketing',  title: 'VP Marketing',            departmentId: 'go',      managerId: id(0), status: 'planned', employmentType: 'full-time', x: 500, y: 220 },
      { id: id(4), name: 'Head of Operations', title: 'VP Operations',           departmentId: 'ops',     managerId: id(0), status: 'planned', employmentType: 'full-time', x: 720, y: 220 },
      { id: id(5), name: 'Senior Engineer',    title: 'Senior Software Engineer',departmentId: 'eng',     managerId: id(1), status: 'active',  employmentType: 'full-time', x: 20,  y: 400 },
      { id: id(6), name: 'Engineer',           title: 'Software Engineer',       departmentId: 'eng',     managerId: id(1), status: 'open',    employmentType: 'full-time', x: 240, y: 400 },
      { id: id(7), name: 'Engineer',           title: 'Software Engineer',       departmentId: 'eng',     managerId: id(1), status: 'open',    employmentType: 'full-time', x: 460, y: 400 },
    ]
    const edges: OrgEdge[] = [
      { id: eid(1), sourceId: id(0), targetId: id(1) },
      { id: eid(2), sourceId: id(0), targetId: id(2) },
      { id: eid(3), sourceId: id(0), targetId: id(3) },
      { id: eid(4), sourceId: id(0), targetId: id(4) },
      { id: eid(5), sourceId: id(1), targetId: id(5) },
      { id: eid(6), sourceId: id(1), targetId: id(6) },
      { id: eid(7), sourceId: id(1), targetId: id(7) },
    ]
    return { nodes, edges }
  }

  if (template === 'quickstart') {
    // The 5-role starter chart offered at the end of onboarding.
    const nodes: OrgNode[] = [
      { id: id(0), name: 'CEO',           title: 'Chief Executive Officer',  departmentId: 'leadership', managerId: null,  status: 'active',  employmentType: 'full-time', x: 400, y: 0   },
      { id: id(1), name: 'CTO',           title: 'Chief Technology Officer', departmentId: 'eng',        managerId: id(0), status: 'active',  employmentType: 'full-time', x: 0,   y: 200 },
      { id: id(2), name: 'CPO',           title: 'Chief Product Officer',    departmentId: 'product',    managerId: id(0), status: 'active',  employmentType: 'full-time', x: 260, y: 200 },
      { id: id(3), name: 'Head of Sales', title: 'Head of Sales',            departmentId: 'go',         managerId: id(0), status: 'open',    employmentType: 'full-time', x: 520, y: 200 },
      { id: id(4), name: 'Head of Ops',   title: 'Head of Operations',       departmentId: 'ops',        managerId: id(0), status: 'planned', employmentType: 'full-time', x: 780, y: 200 },
    ]
    const edges: OrgEdge[] = [1, 2, 3, 4].map(n => ({ id: eid(n), sourceId: id(0), targetId: id(n) }))
    return { nodes, edges }
  }

  return { nodes: [], edges: [] }
}

