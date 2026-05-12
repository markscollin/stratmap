import type { OrgNode, OrgEdge } from '../types'

// Tree layout — 4 managers, 10 ICs, 1 CEO = 15 nodes
// Canvas logical size ≈ 1840 × 500px
// NODE_W=200, NODE_H=64, level-gap=170, sibling-gap=20
//
// Subtree widths (bottom-up):
//  CTO (3 reports): 3*200 + 2*20 = 640 → pad 680
//  CPO (2 reports): 2*200 + 20  = 420 → pad 460
//  VP  (2 reports): 420 → pad 460
//  Fin (1 report ): 200 → pad 260
//
// Subtree starts: 0, 710, 1200, 1690   (30px gap between subtrees)
// Subtree centers: 340, 930, 1420, 1820
// CEO center: (340+1820)/2 = 1080  → x=980

export const NODE_W = 220
export const NODE_H = 80

export const currentStructureNodes: OrgNode[] = [
  // ── Level 0: CEO
  { id:'n1',  name:'Sarah Chen',      title:'Chief Executive Officer',  departmentId:'eng',     managerId:null, status:'active',  employmentType:'full-time', x:980,  y:50  },

  // ── Level 1: managers
  { id:'n2',  name:'Jamie Davies',    title:'Chief Technology Officer', departmentId:'eng',     managerId:'n1', status:'active',  employmentType:'full-time', x:240,  y:220 },
  { id:'n3',  name:'Mark Kim',        title:'Chief Product Officer',    departmentId:'product', managerId:'n1', status:'active',  employmentType:'full-time', x:800,  y:220 },
  { id:'n4',  name:'Ryan Obi',        title:'VP Go-to-Market',          departmentId:'go',      managerId:'n1', status:'active',  employmentType:'full-time', x:1290, y:220 },
  { id:'n5',  name:'Chris Park',      title:'Finance Manager',          departmentId:'finance', managerId:'n1', status:'active',  employmentType:'full-time', x:1690, y:220 },

  // ── Level 2: Engineering (under CTO, center=340)
  { id:'n6',  name:'Alex Chen',       title:'Senior Software Engineer', departmentId:'eng',     managerId:'n2', status:'active',  employmentType:'full-time', x:20,   y:400 },
  { id:'n7',  name:'Priya Nair',      title:'Senior Software Engineer', departmentId:'eng',     managerId:'n2', status:'active',  employmentType:'full-time', x:240,  y:400 },
  { id:'n8',  name:'Software Engineer',title:'Software Engineer',       departmentId:'eng',     managerId:'n2', status:'open',    employmentType:'full-time', x:460,  y:400 },

  // ── Level 2: Product (under CPO, center=930)
  { id:'n9',  name:'Lisa Park',       title:'Product Manager',          departmentId:'product', managerId:'n3', status:'active',  employmentType:'full-time', x:720,  y:400 },
  { id:'n10', name:'Product Manager', title:'Product Manager',          departmentId:'product', managerId:'n3', status:'open',    employmentType:'full-time', x:940,  y:400 },

  // ── Level 2: Go-to-Market (under VP, center=1420)
  { id:'n11', name:'Amy Walsh',       title:'Sales Development Rep',    departmentId:'go',      managerId:'n4', status:'active',  employmentType:'full-time', x:1210, y:400 },
  { id:'n12', name:'Jack Bell',       title:'Sales Development Rep',    departmentId:'go',      managerId:'n4', status:'active',  employmentType:'full-time', x:1430, y:400 },

  // ── Level 2: Finance (under Fin manager, center=1820)
  { id:'n13', name:'Finance Analyst', title:'Finance Analyst',          departmentId:'finance', managerId:'n5', status:'planned', employmentType:'full-time', x:1710, y:400 },

  // ── Bonus IC nodes to approach 24 total (more eng depth)
  { id:'n14', name:'Tom Reeves',      title:'QA Engineer',              departmentId:'eng',     managerId:'n2', status:'active',  employmentType:'full-time', x:130,  y:530 },
  { id:'n15', name:'QA Engineer',     title:'QA Engineer',              departmentId:'eng',     managerId:'n2', status:'open',    employmentType:'full-time', x:350,  y:530 },
]

export const currentStructureEdges: OrgEdge[] = [
  // CEO → managers
  { id:'e1-2',  sourceId:'n1', targetId:'n2' },
  { id:'e1-3',  sourceId:'n1', targetId:'n3' },
  { id:'e1-4',  sourceId:'n1', targetId:'n4' },
  { id:'e1-5',  sourceId:'n1', targetId:'n5' },
  // CTO → eng ICs
  { id:'e2-6',  sourceId:'n2', targetId:'n6'  },
  { id:'e2-7',  sourceId:'n2', targetId:'n7'  },
  { id:'e2-8',  sourceId:'n2', targetId:'n8'  },
  { id:'e2-14', sourceId:'n2', targetId:'n14' },
  { id:'e2-15', sourceId:'n2', targetId:'n15' },
  // CPO → product ICs
  { id:'e3-9',  sourceId:'n3', targetId:'n9'  },
  { id:'e3-10', sourceId:'n3', targetId:'n10' },
  // VP → gtm ICs
  { id:'e4-11', sourceId:'n4', targetId:'n11' },
  { id:'e4-12', sourceId:'n4', targetId:'n12' },
  // Finance → analyst
  { id:'e5-13', sourceId:'n5', targetId:'n13' },
]
