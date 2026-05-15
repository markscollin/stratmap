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

// ── Q3 Hiring Plan — 31 nodes across 4 levels ────────────────────────────────
// Layout: y=50/220/390/560, horizontal positions calculated from leaf-up subtree widths
// NODE_W=220, sibling gap=20
export const q3HiringPlanNodes: OrgNode[] = [
  // L0
  { id:'q1',  name:'Sarah Chen',        title:'Chief Executive Officer',  departmentId:'eng',     managerId:null,  status:'active',   employmentType:'full-time', x:2728, y:50  },
  // L1
  { id:'q2',  name:'Jamie Davies',      title:'Chief Technology Officer', departmentId:'eng',     managerId:'q1',  status:'active',   employmentType:'full-time', x:1255, y:220 },
  { id:'q3',  name:'Mark Kim',          title:'Chief Product Officer',    departmentId:'product', managerId:'q1',  status:'active',   employmentType:'full-time', x:2315, y:220 },
  { id:'q4',  name:'Ryan Obi',          title:'VP Sales',                 departmentId:'go',      managerId:'q1',  status:'active',   employmentType:'full-time', x:3510, y:220 },
  { id:'q5',  name:'Chris Park',        title:'Chief Financial Officer',  departmentId:'finance', managerId:'q1',  status:'active',   employmentType:'full-time', x:4200, y:220 },
  // L2
  { id:'q6',  name:'Tom Reeves',        title:'VP Engineering',           departmentId:'eng',     managerId:'q2',  status:'active',   employmentType:'full-time', x:720,  y:390 },
  { id:'q7',  name:'Priya Nair',        title:'Mobile Lead',              departmentId:'eng',     managerId:'q2',  status:'active',   employmentType:'full-time', x:1790, y:390 },
  { id:'q8',  name:'Lisa Park',         title:'Sr Product Manager',       departmentId:'product', managerId:'q3',  status:'active',   employmentType:'full-time', x:2140, y:390 },
  { id:'q9',  name:'Alex Chen',         title:'Head of Design',           departmentId:'design',  managerId:'q3',  status:'active',   employmentType:'full-time', x:2490, y:390 },
  { id:'q10', name:'Jack Bell',         title:'Sales Director',           departmentId:'go',      managerId:'q4',  status:'active',   employmentType:'full-time', x:3170, y:390 },
  { id:'q11', name:'Amy Walsh',         title:'Marketing Manager',        departmentId:'go',      managerId:'q4',  status:'active',   employmentType:'full-time', x:3850, y:390 },
  { id:'q12', name:'Sam Torres',        title:'Finance Manager',          departmentId:'finance', managerId:'q5',  status:'active',   employmentType:'full-time', x:4200, y:390 },
  // L3 – Engineering (under VP Eng)
  { id:'q13', name:'Dana Lee',          title:'Sr Backend Engineer',      departmentId:'eng',     managerId:'q6',  status:'active',   employmentType:'full-time', x:0,    y:560 },
  { id:'q14', name:'Jordan Wu',         title:'Sr Backend Engineer',      departmentId:'eng',     managerId:'q6',  status:'active',   employmentType:'full-time', x:240,  y:560 },
  { id:'q15', name:'Backend Engineer',  title:'Backend Engineer',         departmentId:'eng',     managerId:'q6',  status:'open',     employmentType:'full-time', x:480,  y:560, roleType:'new-headcount' },
  { id:'q16', name:'Backend Engineer',  title:'Backend Engineer',         departmentId:'eng',     managerId:'q6',  status:'open',     employmentType:'full-time', x:720,  y:560, roleType:'new-headcount' },
  { id:'q17', name:'Casey Morgan',      title:'Sr Frontend Engineer',     departmentId:'eng',     managerId:'q6',  status:'active',   employmentType:'full-time', x:960,  y:560 },
  { id:'q18', name:'Frontend Engineer', title:'Frontend Engineer',        departmentId:'eng',     managerId:'q6',  status:'open',     employmentType:'full-time', x:1200, y:560, roleType:'new-headcount' },
  { id:'q19', name:'Robin Patel',       title:'DevOps Engineer',          departmentId:'eng',     managerId:'q6',  status:'active',   employmentType:'full-time', x:1440, y:560 },
  // L3 – Mobile (under Mobile Lead)
  { id:'q20', name:'iOS Engineer',      title:'iOS Engineer',             departmentId:'eng',     managerId:'q7',  status:'open',     employmentType:'full-time', x:1680, y:560, roleType:'new-headcount' },
  { id:'q21', name:'Android Engineer',  title:'Android Engineer',         departmentId:'eng',     managerId:'q7',  status:'open',     employmentType:'full-time', x:1900, y:560, roleType:'new-headcount' },
  // L3 – Product (under Sr PM)
  { id:'q22', name:'Product Manager',   title:'Product Manager',          departmentId:'product', managerId:'q8',  status:'open',     employmentType:'full-time', x:2140, y:560, roleType:'new-headcount' },
  // L3 – Design (under Head of Design)
  { id:'q23', name:'Maya Singh',        title:'Product Designer',         departmentId:'design',  managerId:'q9',  status:'active',   employmentType:'full-time', x:2380, y:560 },
  { id:'q24', name:'UX Designer',       title:'UX Designer',              departmentId:'design',  managerId:'q9',  status:'open',     employmentType:'full-time', x:2600, y:560, roleType:'new-headcount' },
  // L3 – Sales (under Sales Director)
  { id:'q25', name:'Tyler Brooks',      title:'Account Executive',        departmentId:'go',      managerId:'q10', status:'active',   employmentType:'full-time', x:2840, y:560 },
  { id:'q26', name:'Kim Foster',        title:'Account Executive',        departmentId:'go',      managerId:'q10', status:'active',   employmentType:'full-time', x:3060, y:560 },
  { id:'q27', name:'Account Executive', title:'Account Executive',        departmentId:'go',      managerId:'q10', status:'open',     employmentType:'full-time', x:3280, y:560, roleType:'new-headcount' },
  { id:'q28', name:'Sales Dev Rep',     title:'Sales Development Rep',    departmentId:'go',      managerId:'q10', status:'open',     employmentType:'full-time', x:3500, y:560, roleType:'new-headcount' },
  // L3 – Marketing (under Marketing Manager)
  { id:'q29', name:'Pat Nguyen',        title:'Content Marketer',         departmentId:'go',      managerId:'q11', status:'active',   employmentType:'full-time', x:3740, y:560 },
  { id:'q30', name:'Growth Marketer',   title:'Growth Marketer',          departmentId:'go',      managerId:'q11', status:'open',     employmentType:'full-time', x:3960, y:560, roleType:'new-headcount' },
  // L3 – Finance (under Finance Manager)
  { id:'q31', name:'Controller',        title:'Controller',               departmentId:'finance', managerId:'q12', status:'backfill', employmentType:'full-time', x:4200, y:560, roleType:'backfill' },
]

export const q3HiringPlanEdges: OrgEdge[] = [
  { id:'qe1-2',   sourceId:'q1',  targetId:'q2'  },
  { id:'qe1-3',   sourceId:'q1',  targetId:'q3'  },
  { id:'qe1-4',   sourceId:'q1',  targetId:'q4'  },
  { id:'qe1-5',   sourceId:'q1',  targetId:'q5'  },
  { id:'qe2-6',   sourceId:'q2',  targetId:'q6'  },
  { id:'qe2-7',   sourceId:'q2',  targetId:'q7'  },
  { id:'qe3-8',   sourceId:'q3',  targetId:'q8'  },
  { id:'qe3-9',   sourceId:'q3',  targetId:'q9'  },
  { id:'qe4-10',  sourceId:'q4',  targetId:'q10' },
  { id:'qe4-11',  sourceId:'q4',  targetId:'q11' },
  { id:'qe5-12',  sourceId:'q5',  targetId:'q12' },
  { id:'qe6-13',  sourceId:'q6',  targetId:'q13' },
  { id:'qe6-14',  sourceId:'q6',  targetId:'q14' },
  { id:'qe6-15',  sourceId:'q6',  targetId:'q15' },
  { id:'qe6-16',  sourceId:'q6',  targetId:'q16' },
  { id:'qe6-17',  sourceId:'q6',  targetId:'q17' },
  { id:'qe6-18',  sourceId:'q6',  targetId:'q18' },
  { id:'qe6-19',  sourceId:'q6',  targetId:'q19' },
  { id:'qe7-20',  sourceId:'q7',  targetId:'q20' },
  { id:'qe7-21',  sourceId:'q7',  targetId:'q21' },
  { id:'qe8-22',  sourceId:'q8',  targetId:'q22' },
  { id:'qe9-23',  sourceId:'q9',  targetId:'q23' },
  { id:'qe9-24',  sourceId:'q9',  targetId:'q24' },
  { id:'qe10-25', sourceId:'q10', targetId:'q25' },
  { id:'qe10-26', sourceId:'q10', targetId:'q26' },
  { id:'qe10-27', sourceId:'q10', targetId:'q27' },
  { id:'qe10-28', sourceId:'q10', targetId:'q28' },
  { id:'qe11-29', sourceId:'q11', targetId:'q29' },
  { id:'qe11-30', sourceId:'q11', targetId:'q30' },
  { id:'qe12-31', sourceId:'q12', targetId:'q31' },
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
