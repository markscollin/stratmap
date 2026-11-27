import { sanitizeRichText } from './sanitizeHtml'
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
/** A department colour: #RRGGBB only (R-75). Cards append an alpha suffix to it, and nothing else (CSS, url()) is ever drawn. */
const Colour = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #0EA5E9')
const OptionalRef = z.union([Id, z.literal(''), z.null()])
  .optional()
  .transform(v => (v === '' ? null : v))

const Name = z.string().trim().min(1).max(200)
const ShortText = z.string().max(200)
// JD and template bodies are HTML from TipTap. They are cleaned on the way in (api/_lib/sanitizeHtml.ts, R-37).
const LongText = z.string().max(100_000).transform(sanitizeRichText)
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
  avatarUrl: z.string().max(2048).regex(/^https:\/\//, 'must be an https address').nullable().optional(), // R-75
  location: ShortText.nullable().optional(),
  startDate: z.string().max(40).nullable().optional(),
  x: Coord,
  y: Coord,
  isNew: z.boolean().nullable().optional(),
}

/** R-77: the spreadsheet keys a role is matched by on "Update from file". Only imports write them. */
const importKeyFields = {
  externalId: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().toLowerCase().max(320).nullable().optional(),
}

export const NodeCreate = z.object({ ...nodeFields, id: Id.optional() })

export const NodeUpdate = z.object(nodeFields).partial()

export const NodePositions = z.array(z.object({ id: Id, x: Coord, y: Coord })).max(5000)

/** `id` is optional: the canvas supplies one so a line drawn this session can be deleted before any reload (R-03). */
export const EdgeCreate = z.object({ id: Id.optional(), sourceId: Id, targetId: Id })

const MAX_TEMPLATE_NODES = 5000

/** A sample chart is free and doesn't count toward the plan's chart limit, so it stays small (roadmap 2.7). */
export const MAX_SAMPLE_NODES = 20

export const ChartCreate = z.object({
  name: Name,
  isSample: z.boolean().optional(),
  status: enumOf(chartStatusEnum).optional(),
  templateNodes: z.array(z.object({ ...nodeFields, ...importKeyFields, id: Id })).max(MAX_TEMPLATE_NODES).default([]),
  templateEdges: z.array(z.object({ id: Id.optional(), sourceId: Id, targetId: Id })).max(MAX_TEMPLATE_NODES * 2).default([]),
  templateDepts: z.array(z.object({
    id: Id,
    name: Name,
    colour: Colour,
    workspaceDepartmentId: OptionalRef,
  })).max(500).default([]),
})

/** Roadmap 2.1: people imported from a spreadsheet into an existing chart. */
export const ChartImport = z.object({
  nodes: z.array(z.object({ ...nodeFields, ...importKeyFields, id: Id })).min(1).max(MAX_TEMPLATE_NODES),
  edges: z.array(z.object({ sourceId: Id, targetId: Id })).max(MAX_TEMPLATE_NODES * 2).default([]),
  /** Every department the nodes use; same-named ones on the chart are reused. */
  departments: z.array(z.object({ id: Id, name: Name, colour: Colour })).max(500).default([]),
})

/**
 * R-77 "Update from file": the whole chart as it should be after the update (the client worked out the changes and the
 * person accepted them), plus the departments it creates. The server keeps every existing role's position and photo.
 */
export const ChartSync = z.object({
  nodes: z.array(z.object({ ...nodeFields, ...importKeyFields, id: Id })).max(MAX_TEMPLATE_NODES),
  edges: z.array(z.object({ id: Id, sourceId: Id, targetId: Id })).max(MAX_TEMPLATE_NODES * 2),
  departments: z.array(z.object({ id: Id, name: Name, colour: Colour })).max(500).default([]),
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

// Cost of a planned hire (owner/admin only; the routes check the role). Whole units per year.
export const HEADCOUNT_SALARY_FIELDS = ['salaryMin', 'salaryMax', 'salaryCurrency'] as const
const salaryFields = {
  salaryMin: z.number().int().min(0).max(100_000_000).nullable().optional(),
  salaryMax: z.number().int().min(0).max(100_000_000).nullable().optional(),
  salaryCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'use a 3-letter currency code').transform(c => c.toUpperCase()).nullable().optional(),
}
const minNotAboveMax = (v: { salaryMin?: number | null; salaryMax?: number | null }) =>
  v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax
const SALARY_ORDER = { message: 'the minimum cannot be above the maximum', path: ['salaryMin'] }

export const HeadcountCreate = z.object({
  ...headcountFields,
  ...salaryFields,
  roleType: headcountFields.roleType.default('new-headcount'),
}).refine(minNotAboveMax, SALARY_ORDER)

export const HeadcountUpdate = z.object({
  ...headcountFields,
  ...salaryFields,
  status: enumOf(headcountStatusEnum),
}).partial().refine(minNotAboveMax, SALARY_ORDER)


export const DepartmentCreate = z.object({ name: z.string().trim().min(1).max(100), colour: Colour })

export const DepartmentUpdate = DepartmentCreate.partial()

// ─── Workspace / members / invites ───────────────────────────────────────────

export const WorkspaceCreate = z.object({
  name: z.string().trim().min(1).max(100),
  ownerRole: z.string().trim().min(1).max(100),
  size: z.string().trim().min(1).max(50),
  // No email or name here on purpose (R-09): the server takes both from the sign-in provider. A client that still sends them is ignored.
})

export const WorkspaceUpdate = z.object({ name: z.string().trim().min(1).max(100) })

// Role comments (roadmap 5). `mentions` are member ids picked in the UI; the server keeps only real members.
export const COMMENT_MAX_LENGTH = 2000
const CommentBody = z.string().trim().min(1).max(COMMENT_MAX_LENGTH)
export const CommentCreate = z.object({
  nodeId: Id,
  body: CommentBody,
  parentId: Id.optional(),
  mentions: z.array(Id).max(20).optional(),
})
// Either edit the text or resolve/reopen a thread, never both at once.
export const CommentUpdate = z.object({
  body: CommentBody.optional(),
  resolved: z.boolean().optional(),
  mentions: z.array(Id).max(20).optional(),
}).refine(v => (v.body === undefined) !== (v.resolved === undefined), { message: 'send either body or resolved' })
export const NotificationPrefsUpdate = z.object({ comments: z.boolean() })

// Chart version history (roadmap 5).
export const SnapshotCreate = z.object({ name: z.string().trim().min(1).max(100) })
export const SnapshotBranch = z.object({ name: z.string().trim().min(1).max(100).optional() })

// Data rights (roadmap 4.2). The owner must type the workspace's name; the server compares it with the real name.
export const WorkspaceDelete = z.object({ confirmName: z.string().trim().min(1).max(100) })
export const OwnershipTransfer = z.object({ userId: Id, confirmName: z.string().trim().min(1).max(100) })
export const WorkspaceRestore = z.object({ workspaceId: Id })
export const AccountDelete = z.object({ confirm: z.literal('DELETE') })

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
const InviteId = z.string().min(1).max(100)

/** A token (from the emailed link) or the id of an invite the person picked on the "you've been invited" screen (R-56). */
export const InviteAccept = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'invalid token').optional(),
  inviteId: InviteId.optional(),
})

export const InviteDecline = z.object({ inviteId: InviteId })

// ─── Billing / AI / admin ────────────────────────────────────────────────────

export const CheckoutCreate = z.object({
  tier: z.enum(['starter', 'growth', 'scale']),
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
