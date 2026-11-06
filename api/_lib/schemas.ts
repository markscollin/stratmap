import { z } from 'zod'
import {
  nodeStatusEnum, employmentTypeEnum, roleTypeEnum, roleStatusEnum,
  chartStatusEnum, permissionEnum, planTierEnum, headcountStatusEnum,
} from '../../src/lib/db/schema'

// Request-body schemas for every mutating API route. Objects strip unknown keys
// (zod default), so a handler can never be tricked into writing a column the
// route didn't intend (chartId, workspaceId, createdBy, …).

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Client-generated ids (uuid, "node-abc", …). Restricted charset, bounded length. */
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid id')

/** Optional foreign-key id; the client sends '' for "none", which we store as null. */
const OptionalRef = z.union([Id, z.literal(''), z.null()])
  .optional()
  .transform(v => (v === '' ? null : v))

const Name = z.string().trim().min(1).max(200)
const ShortText = z.string().max(200)
const LongText = z.string().max(100_000)      // JD bodies are HTML from TipTap
const Coord = z.number().finite().min(-1_000_000).max(1_000_000)

const enumOf = <T extends [string, ...string[]]>(e: { enumValues: T }) => z.enum(e.enumValues)

// ─── Charts / nodes / edges ──────────────────────────────────────────────────

const nodeFields = {
  name: Name,
  title: Name,
  departmentId: OptionalRef,
  managerId: OptionalRef,
  status: enumOf(nodeStatusEnum).optional(),
  employmentType: enumOf(employmentTypeEnum).optional(),
  roleType: enumOf(roleTypeEnum).nullable().optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
  location: ShortText.nullable().optional(),
  startDate: z.string().max(40).nullable().optional(),
  x: Coord,
  y: Coord,
  isNew: z.boolean().nullable().optional(),
}

export const NodeCreate = z.object({ ...nodeFields, id: Id.optional() })

export const NodeUpdate = z.object(nodeFields).partial()

export const NodePositions = z.array(z.object({ id: Id, x: Coord, y: Coord })).max(5000)

export const EdgeCreate = z.object({ sourceId: Id, targetId: Id })

const MAX_TEMPLATE_NODES = 5000

/** A sample chart is free and doesn't count toward the plan's chart limit, so it stays small (roadmap 2.7). */
export const MAX_SAMPLE_NODES = 20

export const ChartCreate = z.object({
  name: Name,
  isSample: z.boolean().optional(),
  status: enumOf(chartStatusEnum).optional(),
  templateNodes: z.array(z.object({ ...nodeFields, id: Id })).max(MAX_TEMPLATE_NODES).default([]),
  templateEdges: z.array(z.object({ id: Id.optional(), sourceId: Id, targetId: Id })).max(MAX_TEMPLATE_NODES * 2).default([]),
  templateDepts: z.array(z.object({
    id: Id,
    name: Name,
    colour: z.string().max(50),
    workspaceDepartmentId: OptionalRef,
  })).max(500).default([]),
})

/** Roadmap 2.1: people imported from a spreadsheet into an existing chart. */
export const ChartImport = z.object({
  nodes: z.array(z.object({ ...nodeFields, id: Id })).min(1).max(MAX_TEMPLATE_NODES),
  edges: z.array(z.object({ sourceId: Id, targetId: Id })).max(MAX_TEMPLATE_NODES * 2).default([]),
  /** Every department the nodes use; same-named ones on the chart are reused. */
  departments: z.array(z.object({ id: Id, name: Name, colour: z.string().max(50) })).max(500).default([]),
})

export const ChartUpdate = z.object({
  name: Name.optional(),
  status: enumOf(chartStatusEnum).optional(),
  isPublic: z.boolean().optional(),
})

// ─── Job descriptions ────────────────────────────────────────────────────────

export const SALARY_FIELDS = ['salaryBandMin', 'salaryBandMax', 'salaryCurrency'] as const

export const JDUpdate = z.object({
  status: enumOf(roleStatusEnum).optional(),
  responsibilities: LongText.optional(),
  requirements: LongText.optional(),
  level: ShortText.nullable().optional(),
  version: z.number().int().min(1).max(100_000).optional(),
  salaryBandMin: z.number().int().min(0).max(100_000_000).nullable().optional(),
  salaryBandMax: z.number().int().min(0).max(100_000_000).nullable().optional(),
  salaryCurrency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 currency code').nullable().optional(),
})

// ─── Templates / headcount / departments ─────────────────────────────────────

const templateFields = {
  title: Name,
  department: ShortText,
  responsibilities: LongText,
  requirements: LongText,
  tags: z.array(z.string().max(50)).max(50),
  uses: z.number().int().min(0).max(1_000_000_000),
}

export const TemplateCreate = z.object({
  ...templateFields,
  department: templateFields.department.default(''),
  responsibilities: templateFields.responsibilities.default(''),
  requirements: templateFields.requirements.default(''),
  tags: templateFields.tags.default([]),
  uses: templateFields.uses.default(0),
})

export const TemplateUpdate = z.object(templateFields).partial()

const headcountFields = {
  title: Name,
  departmentId: OptionalRef,
  roleType: enumOf(roleTypeEnum),
  targetQuarter: z.string().trim().min(1).max(20),
  chartId: OptionalRef,
  notes: z.string().max(5000).nullable().optional(),
}

export const HeadcountCreate = z.object({
  ...headcountFields,
  roleType: headcountFields.roleType.default('new-headcount'),
})

export const HeadcountUpdate = z.object({
  ...headcountFields,
  status: enumOf(headcountStatusEnum),
}).partial()

const Colour = z.string().trim().min(1).max(50)

export const DepartmentCreate = z.object({ name: z.string().trim().min(1).max(100), colour: Colour })

export const DepartmentUpdate = DepartmentCreate.partial()

// ─── Workspace / members / invites ───────────────────────────────────────────

export const WorkspaceCreate = z.object({
  name: z.string().trim().min(1).max(100),
  ownerRole: z.string().trim().min(1).max(100),
  size: z.string().trim().min(1).max(50),
  email: z.string().max(320).optional(),
  userName: z.string().max(200).optional(),
})

export const WorkspaceUpdate = z.object({ name: z.string().trim().min(1).max(100) })

export const Permission = enumOf(permissionEnum)

export const MemberUpdate = z.object({ permission: Permission })

export const MAX_INVITES_PER_REQUEST = 20

export const InviteCreate = z.object({
  invites: z.array(z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(320)),
    permission: Permission.default('editor'),
  })).min(1).max(MAX_INVITES_PER_REQUEST),
})

/** No token = accept a pending invite matched by the caller's verified email. */
export const InviteAccept = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'invalid token').optional(),
})

// ─── Billing / AI / admin ────────────────────────────────────────────────────

export const CheckoutCreate = z.object({
  tier: z.enum(['starter', 'growth']),
  billingCycle: z.enum(['monthly', 'annual']),
})

export const AIDraftCreate = z.object({
  title: z.string().trim().min(1).max(200),
  deptName: z.string().trim().min(1).max(100),
  tone: z.string().trim().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

export const GrantTrial = z.object({
  workspaceId: Id,
  planTier: z.enum(planTierEnum.enumValues).exclude(['free']),
  days: z.number().int().min(1).max(365).default(90),
})

/** Roadmap 2.7: an admin hides (or brings back) the getting-started checklist for the workspace. */
export const OnboardingUpdate = z.object({ dismissed: z.boolean() })
