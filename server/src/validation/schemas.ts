import { z } from 'zod'
import { ACTION_MIN_ROLE, isBlockedClientAction } from '../auth/actionPolicy.js'

const sccsAssignmentSchema = z.object({
  pbs: z.string().regex(/^[A-Z0-9]{1,8}$/),
  sab: z.string().regex(/^[A-Z0-9]{1,8}$/),
  cor: z.string().regex(/^[A-Z0-9]{1,8}$/),
  composite: z.string().regex(/^[A-Z0-9]{1,8}\.[A-Z0-9]{1,8}\.[A-Z0-9]{1,8}$/),
  source: z.enum(['mapped', 'manual', 'import']),
})

const costRowSchema = z
  .object({
    id: z.string().min(1).max(128),
    wbs: z.string().min(1).max(128),
    cbs: z.string().max(128),
    description: z.string().min(1).max(1000),
    parentId: z.string().nullable(),
    sccs: sccsAssignmentSchema.optional(),
  })
  .passthrough()

const extractedValueSchema = z
  .object({
    id: z.string().min(1).max(128),
    reportId: z.string().min(1).max(128),
    field: z.string().min(1).max(500),
    category: z.enum(['cost', 'progress', 'change', 'procurement', 'forecast']),
    normalizedValue: z.number().finite(),
    unit: z.string().min(1).max(32),
    wbs: z.string().min(1).max(128),
    cbs: z.string().min(1).max(128),
    reviewStatus: z.enum(['pending_review', 'needs_correction', 'approved']),
    approvalStatus: z.enum(['unapproved', 'approved', 'rejected']),
    sccs: sccsAssignmentSchema.optional(),
  })
  .passthrough()

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const scheduleSourceSchema = z.enum(['p6_csv', 'p6_xer', 'planview', 'manual'])
const scheduleActivitySchema = z.object({
  id: z.string().min(1).max(256),
  sourceActivityId: z.string().min(1).max(128),
  sourceWbs: z.string().max(256),
  wbs: z.string().min(1).max(256),
  name: z.string().min(1).max(1000),
  activityType: z.enum(['task', 'start_milestone', 'finish_milestone', 'level_of_effort']),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  calendar: z.string().max(200),
  baselineStart: isoDateSchema,
  baselineFinish: isoDateSchema,
  currentStart: isoDateSchema,
  currentFinish: isoDateSchema,
  actualStart: isoDateSchema.optional(),
  actualFinish: isoDateSchema.optional(),
  remainingDurationDays: z.number().finite().min(0).max(100_000),
  totalFloatDays: z.number().finite().min(-100_000).max(100_000),
  percentComplete: z.number().finite().min(0).max(100),
  physicalPercentComplete: z.number().finite().min(0).max(100),
  plannedLaborHours: z.number().finite().min(0).max(1_000_000_000),
  actualLaborHours: z.number().finite().min(0).max(1_000_000_000),
  primaryResource: z.string().max(200).optional(),
  sourceSystem: scheduleSourceSchema,
  sourceBatchId: z.string().min(1).max(256),
  mappingStatus: z.enum(['mapped', 'manual', 'unmapped']),
})
const scheduleRelationshipSchema = z.object({
  id: z.string().min(1).max(512),
  predecessorId: z.string().min(1).max(256),
  successorId: z.string().min(1).max(256),
  type: z.enum(['FS', 'SS', 'FF', 'SF']),
  lagDays: z.number().finite().min(-100_000).max(100_000),
  sourceSystem: scheduleSourceSchema,
  sourceBatchId: z.string().min(1).max(256),
})
const scheduleImportIssueSchema = z.object({
  id: z.string().min(1).max(256),
  row: z.number().int().min(0).max(10_000_000),
  severity: z.enum(['warning', 'error']),
  field: z.string().min(1).max(128),
  message: z.string().min(1).max(2000),
  sourceActivityId: z.string().max(128).optional(),
})
const scheduleImportBatchSchema = z.object({
  id: z.string().min(1).max(256),
  sourceSystem: scheduleSourceSchema,
  fileName: z.string().min(1).max(500),
  dataDate: isoDateSchema,
  importedAt: z.string().datetime(),
  importedBy: z.string().min(1).max(200),
  status: z.enum(['accepted', 'accepted_with_warnings', 'rejected']),
  activityCount: z.number().int().min(0).max(1_000_000),
  relationshipCount: z.number().int().min(0).max(5_000_000),
  mappedCount: z.number().int().min(0).max(1_000_000),
  warningCount: z.number().int().min(0).max(1_000_000),
  errorCount: z.number().int().min(0).max(1_000_000),
  issues: z.array(scheduleImportIssueSchema).max(100_000),
  columnMap: z
    .record(z.string().min(1).max(128), z.string().min(1).max(500))
    .refine((mapping) => Object.keys(mapping).length <= 50, 'Too many schedule column mappings'),
})

const wbsNodeSchema = z.object({ id: z.string(), code: z.string() }).passthrough()
const changeItemSchema = z.object({ id: z.string(), title: z.string() }).passthrough()
const forecastPackageSchema = z.object({ id: z.string(), status: z.string() }).passthrough()

const actionSchemas = [
  z.object({ type: z.literal('SET_META'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SET_SETTINGS'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SET_BASIS_OF_ESTIMATE'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SET_WBS_NODES'), payload: z.array(wbsNodeSchema) }),
  z.object({ type: z.literal('SET_COST_SHEET'), payload: z.array(costRowSchema) }),
  z.object({ type: z.literal('SET_DELIVERABLES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_CHANGES'), payload: z.array(changeItemSchema) }),
  z.object({ type: z.literal('SET_RISKS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_OPPORTUNITIES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_ISSUES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_ACTIONS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_DECISIONS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_LESSONS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_CLAIMS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_VENDORS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_PURCHASE_ORDERS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_CONTRACTS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_RFQ_BIDS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_INVOICES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_SUBCONTRACTS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_FIELD_DAILY_REPORTS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_FIELD_OBSERVATIONS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_TURNOVER_CHECKLISTS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_WORK_FRONTS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_PUNCH_LIST'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_CONTINGENCY_DRAWS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_CONTINGENCY_RULES'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SET_FX_RATES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_FX_SETTINGS'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SET_CONNECTORS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('UPDATE_CONNECTOR'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('ADD_SYNC_JOB'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SET_RULE_OF_CREDIT_TEMPLATES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_PROGRESS_CREDITS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('UPDATE_PROGRESS_CREDIT'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SET_LONG_LEAD_ITEMS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_CBS_NODES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_BURDEN_RULES'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_COST_ACCRUALS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('UPDATE_COST_ACCRUAL'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('RECONCILE_ACCRUALS') }),
  z.object({ type: z.literal('SET_FORECAST_APPROVALS'), payload: z.array(forecastPackageSchema) }),
  z.object({ type: z.literal('UPDATE_FORECAST_APPROVAL'), payload: forecastPackageSchema }),
  z.object({
    type: z.literal('SUBMIT_FORECAST'),
    payload: z.object({ packageId: z.string().min(1), actor: z.string().min(1), comment: z.string().optional() }),
  }),
  z.object({
    type: z.literal('APPROVE_FORECAST'),
    payload: z.object({ packageId: z.string().min(1), actor: z.string().min(1), comment: z.string().optional() }),
  }),
  z.object({
    type: z.literal('REJECT_FORECAST'),
    payload: z.object({ packageId: z.string().min(1), actor: z.string().min(1), comment: z.string().optional() }),
  }),
  z.object({ type: z.literal('CREATE_CHANGE'), payload: changeItemSchema }),
  z.object({
    type: z.literal('SUBMIT_CHANGE'),
    payload: z.object({
      changeId: z.string().min(1),
      actor: z.string().min(1),
      role: z.string().min(1),
      comment: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('DECIDE_CHANGE'),
    payload: z.object({
      changeId: z.string().min(1),
      decision: z.enum(['approved', 'rejected']),
      actor: z.string().min(1),
      role: z.string().min(1),
      comment: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal('ADD_GENERATED_REPORT'), payload: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('SYNC_PORTFOLIO') }),
  z.object({ type: z.literal('RECONCILE_CONTINGENCY') }),
  z.object({ type: z.literal('SYNC_COMMITMENTS') }),
  z.object({
    type: z.literal('LOCK_REPORTING_PERIOD'),
    payload: z.object({ actor: z.string().min(1), period: z.string().min(1) }),
  }),
  z.object({
    type: z.literal('UNLOCK_REPORTING_PERIOD'),
    payload: z.object({ actor: z.string().min(1) }),
  }),
  z.object({
    type: z.literal('SUBMIT_CONTINGENCY_DRAW'),
    payload: z.object({ drawId: z.string().min(1), actor: z.string().min(1) }),
  }),
  z.object({
    type: z.literal('APPROVE_CONTINGENCY_DRAW'),
    payload: z.object({ drawId: z.string().min(1), actor: z.string().min(1) }),
  }),
  z.object({ type: z.literal('SET_REPORTS'), payload: z.array(z.record(z.string(), z.unknown())) }),
  z.object({ type: z.literal('SET_VALUES'), payload: z.array(extractedValueSchema).max(10_000) }),
  z.object({ type: z.literal('SET_SELECTED_VALUE'), payload: z.string().min(1) }),
  z.object({
    type: z.literal('IMPORT_SCHEDULE'),
    payload: z.object({
      batch: scheduleImportBatchSchema,
      activities: z.array(scheduleActivitySchema).max(1_000_000),
      relationships: z.array(scheduleRelationshipSchema).max(5_000_000),
    }),
  }),
  z.object({
    type: z.literal('UPDATE_SCHEDULE_ACTIVITY_MAPPING'),
    payload: z.object({
      activityId: z.string().min(1).max(256),
      wbs: z.string().min(1).max(256),
      actor: z.string().min(1).max(200),
    }),
  }),
  z.object({ type: z.literal('APPLY_APPROVED_EXTRACTIONS'), payload: z.object({ actor: z.string().min(1) }) }),
] as const satisfies ReadonlyArray<z.ZodTypeAny>

const projectActionSchema = z.union(actionSchemas)

export function parseProjectAction(body: unknown) {
  const envelope = z.object({ type: z.string().min(1) }).safeParse(body)
  if (!envelope.success) {
    return envelope
  }

  if (isBlockedClientAction(envelope.data.type)) {
    return {
      success: false as const,
      error: new z.ZodError([
        {
          code: 'custom',
          message: `Action ${envelope.data.type} is server-controlled`,
          path: ['type'],
        },
      ]),
    }
  }

  if (!(envelope.data.type in ACTION_MIN_ROLE)) {
    return {
      success: false as const,
      error: new z.ZodError([
        {
          code: 'custom',
          message: `Unknown action type: ${envelope.data.type}`,
          path: ['type'],
        },
      ]),
    }
  }

  return projectActionSchema.safeParse(body)
}

// ---------------------------------------------------------------------------
// Auth payloads
// ---------------------------------------------------------------------------

const roleSchema = z.enum(['viewer', 'cost_controller', 'approver', 'admin'])

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
})

export const oidcLoginSchema = z.object({
  idToken: z.string().min(1),
})

export const registerUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: roleSchema,
  password: z.string().min(12).max(200),
})

export const projectRoleSchema = z.object({
  userId: z.string().min(1).max(128),
  role: roleSchema,
})

export const saveFilterSchema = z.object({
  name: z.string().min(1).max(200),
  scope: z.string().min(1).max(100),
  payload: z.record(z.string(), z.string()).refine((obj) => Object.keys(obj).length <= 50, 'Too many filter keys'),
  shared: z.boolean().optional(),
})

export const workflowDelegationSchema = z.object({
  workflowId: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128).optional(),
  fromUserId: z.string().min(1).max(128),
  toUserId: z.string().min(1).max(128),
  until: z.string().datetime(),
})

export const createBaselineSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
})

export const exportJobSchema = z.object({
  scheduleCron: z.string().max(100).optional(),
})

export const integrationSyncSchema = z.object({
  connectorId: z.string().min(1).max(128),
  domain: z.enum(['erp', 'schedule', 'contracts', 'procurement', 'document_control']),
  projectId: z.string().min(1).max(128).optional(),
})

export const connectorOAuthSchema = z.record(z.string().max(128), z.string().max(4096)).refine(
  (obj) => Object.keys(obj).length <= 20,
  'Too many OAuth fields',
)

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterUserInput = z.infer<typeof registerUserSchema>
