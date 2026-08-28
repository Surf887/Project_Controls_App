import type {
  ScheduleActivity,
  ScheduleActivityStatus,
  ScheduleActivityType,
  ScheduleImportBatch,
  ScheduleImportIssue,
  ScheduleRelationship,
  ScheduleRelationshipType,
} from '../data/schedule'
import type { P6CsvImportResult } from './p6CsvImport'

type XerRow = Record<string, string>

export interface P6XerImportOptions {
  fileName: string
  importedBy: string
  knownWbs: string[]
  dataDate?: string
  now?: string
}

export interface P6XerInspection {
  tables: string[]
  activityCount: number
  relationshipCount: number
  projectDataDate?: string
  warnings: string[]
}

function parseTables(text: string): Map<string, XerRow[]> {
  const tables = new Map<string, XerRow[]>()
  let table = ''
  let fields: string[] = []
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line) => {
    const cells = line.split('\t')
    if (cells[0] === '%T') {
      table = cells[1]?.trim().toUpperCase() ?? ''
      fields = []
      if (table && !tables.has(table)) tables.set(table, [])
      return
    }
    if (cells[0] === '%F') {
      fields = cells.slice(1).map((field) => field.trim())
      return
    }
    if (cells[0] !== '%R' || !table || fields.length === 0) return
    const row: XerRow = {}
    fields.forEach((field, index) => {
      row[field] = cells[index + 1]?.trim() ?? ''
    })
    tables.get(table)!.push(row)
  })
  return tables
}

function date(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const normalized = value.trim().replace(/^(\d{4}-\d{2}-\d{2}).*$/, '$1')
  const timestamp = Date.parse(`${normalized}T00:00:00Z`)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10)
}

function number(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function percent(value: string | undefined): number {
  const parsed = number(value)
  return Math.min(100, Math.max(0, parsed <= 1 && parsed > 0 ? parsed * 100 : parsed))
}

function activityType(value: string): ScheduleActivityType {
  const normalized = value.toLowerCase()
  if (normalized.includes('startmile')) return 'start_milestone'
  if (normalized.includes('finmile')) return 'finish_milestone'
  if (normalized.includes('loe')) return 'level_of_effort'
  return 'task'
}

function status(value: string, complete: number): ScheduleActivityStatus {
  const normalized = value.toLowerCase()
  if (normalized.includes('complete') || complete >= 100) return 'completed'
  if (normalized.includes('active') || complete > 0) return 'in_progress'
  return 'not_started'
}

function relationshipType(value: string): ScheduleRelationshipType {
  const normalized = value.toUpperCase()
  if (normalized.includes('SS')) return 'SS'
  if (normalized.includes('FF')) return 'FF'
  if (normalized.includes('SF')) return 'SF'
  return 'FS'
}

function wbsPaths(rows: XerRow[]): Map<string, string> {
  const byId = new Map(rows.map((row) => [row.wbs_id, row]))
  const cache = new Map<string, string>()
  const resolve = (id: string, seen = new Set<string>()): string => {
    if (cache.has(id)) return cache.get(id)!
    const row = byId.get(id)
    if (!row || seen.has(id)) return ''
    seen.add(id)
    const code = row.wbs_short_name || row.wbs_name || id
    const parent = row.parent_wbs_id ? resolve(row.parent_wbs_id, seen) : ''
    const path = !parent || code === parent || code.startsWith(`${parent}.`) ? code : `${parent}.${code}`
    cache.set(id, path)
    return path
  }
  byId.forEach((_row, id) => resolve(id))
  return cache
}

function mappedWbs(sourceWbs: string, knownWbs: string[]): { wbs: string; mapped: boolean } {
  const match = knownWbs
    .filter((known) => sourceWbs === known || sourceWbs.startsWith(`${known}.`))
    .sort((left, right) => right.length - left.length)[0]
  return match ? { wbs: sourceWbs, mapped: true } : { wbs: 'UNMAPPED-WBS', mapped: false }
}

function issue(
  issues: ScheduleImportIssue[],
  batchId: string,
  severity: 'warning' | 'error',
  field: string,
  message: string,
  sourceActivityId?: string,
) {
  issues.push({
    id: `${batchId}:ISSUE:${issues.length + 1}`,
    row: 0,
    severity,
    field,
    message,
    sourceActivityId,
  })
}

export function inspectP6Xer(text: string): P6XerInspection {
  const tables = parseTables(text)
  const project = tables.get('PROJECT')?.[0]
  const warnings: string[] = []
  if (!tables.has('TASK')) warnings.push('TASK table is missing.')
  if (!tables.has('PROJWBS')) warnings.push('PROJWBS table is missing.')
  return {
    tables: [...tables.keys()],
    activityCount: tables.get('TASK')?.length ?? 0,
    relationshipCount: tables.get('TASKPRED')?.length ?? 0,
    projectDataDate: date(project?.last_recalc_date) ?? undefined,
    warnings,
  }
}

export function buildP6XerImport(text: string, options: P6XerImportOptions): P6CsvImportResult {
  const tables = parseTables(text)
  const importedAt = options.now ?? new Date().toISOString()
  const batchId = `SCH-XER-${Date.parse(importedAt)}`
  const issues: ScheduleImportIssue[] = []
  const tasks = tables.get('TASK') ?? []
  const paths = wbsPaths(tables.get('PROJWBS') ?? [])
  const calendars = new Map((tables.get('CALENDAR') ?? []).map((row) => [row.clndr_id, row.clndr_name]))
  const projectDataDate = date(tables.get('PROJECT')?.[0]?.last_recalc_date)
  const dataDate = date(options.dataDate) ?? projectDataDate

  if (tasks.length === 0) issue(issues, batchId, 'error', 'TASK', 'XER file contains no TASK activities.')
  if (paths.size === 0) issue(issues, batchId, 'error', 'PROJWBS', 'XER file contains no WBS dictionary.')
  if (!dataDate) issue(issues, batchId, 'error', 'dataDate', 'XER project data date is missing; provide one before import.')
  if (tasks.length > 1_000) {
    issue(issues, batchId, 'error', 'TASK', 'Reviewed XER imports are limited to 1,000 activities; use the streaming adapter for larger programmes.')
  }

  const taskIdToActivity = new Map<string, string>()
  const seenCodes = new Set<string>()
  const candidates: ScheduleActivity[] = []
  tasks.forEach((task) => {
    const sourceId = task.task_code || task.task_id
    if (!sourceId || !task.task_name) {
      issue(issues, batchId, 'error', 'TASK', 'Activity ID and name are required.', sourceId || undefined)
      return
    }
    if (seenCodes.has(sourceId)) {
      issue(issues, batchId, 'error', 'task_code', `Duplicate Activity ID ${sourceId}.`, sourceId)
      return
    }
    seenCodes.add(sourceId)
    const baselineStart = date(task.target_start_date)
    const baselineFinish = date(task.target_end_date)
    const currentStart = date(task.start_date) ?? date(task.restart_date) ?? baselineStart
    const currentFinish = date(task.end_date) ?? date(task.expect_end_date) ?? baselineFinish
    if (!baselineStart || !baselineFinish || !currentStart || !currentFinish) {
      issue(issues, batchId, 'error', 'dates', 'Activity requires valid planned and current dates.', sourceId)
      return
    }
    if (baselineFinish < baselineStart || currentFinish < currentStart) {
      issue(issues, batchId, 'error', 'dates', 'Activity finish cannot precede start.', sourceId)
      return
    }
    const sourceWbs = paths.get(task.wbs_id) ?? ''
    const mapping = mappedWbs(sourceWbs, options.knownWbs)
    if (!mapping.mapped) {
      issue(issues, batchId, 'warning', 'wbs', `Source WBS ${sourceWbs || task.wbs_id} needs mapping.`, sourceId)
    }
    const complete = percent(task.complete_pct)
    const physical = percent(task.phys_complete_pct || task.complete_pct)
    const id = `P6:${sourceId}`
    taskIdToActivity.set(task.task_id, id)
    candidates.push({
      id,
      sourceActivityId: sourceId,
      sourceWbs,
      wbs: mapping.wbs,
      name: task.task_name,
      activityType: activityType(task.task_type),
      status: status(task.status_code, complete),
      calendar: calendars.get(task.clndr_id) || task.clndr_id || 'Unspecified',
      baselineStart,
      baselineFinish,
      currentStart,
      currentFinish,
      actualStart: date(task.act_start_date) ?? undefined,
      actualFinish: date(task.act_end_date) ?? undefined,
      remainingDurationDays: Math.max(0, number(task.remain_drtn_hr_cnt) / 8),
      totalFloatDays: number(task.total_float_hr_cnt) / 8,
      percentComplete: complete,
      physicalPercentComplete: physical,
      plannedLaborHours: Math.max(0, number(task.target_work_qty)),
      actualLaborHours: Math.max(0, number(task.act_work_qty)),
      primaryResource: task.rsrc_id || undefined,
      sourceSystem: 'p6_xer',
      sourceBatchId: batchId,
      mappingStatus: mapping.mapped ? 'mapped' : 'unmapped',
    })
  })

  const candidateIds = new Set(candidates.map((activity) => activity.id))
  const relationships: ScheduleRelationship[] = []
  ;(tables.get('TASKPRED') ?? []).forEach((row) => {
    const predecessorId = taskIdToActivity.get(row.pred_task_id)
    const successorId = taskIdToActivity.get(row.task_id)
    if (!predecessorId || !successorId || !candidateIds.has(predecessorId) || !candidateIds.has(successorId)) {
      issue(issues, batchId, 'warning', 'TASKPRED', 'Relationship references an activity outside the imported project.')
      return
    }
    relationships.push({
      id: `${batchId}:REL:${relationships.length + 1}`,
      predecessorId,
      successorId,
      type: relationshipType(row.pred_type),
      lagDays: number(row.lag_hr_cnt) / 8,
      sourceSystem: 'p6_xer',
      sourceBatchId: batchId,
    })
  })

  const errorCount = issues.filter((entry) => entry.severity === 'error').length
  const warningCount = issues.filter((entry) => entry.severity === 'warning').length
  const accepted = errorCount === 0
  const activities = accepted ? candidates : []
  const acceptedRelationships = accepted ? relationships : []
  const batch: ScheduleImportBatch = {
    id: batchId,
    sourceSystem: 'p6_xer',
    fileName: options.fileName,
    dataDate: dataDate ?? importedAt.slice(0, 10),
    importedAt,
    importedBy: options.importedBy,
    status: !accepted ? 'rejected' : warningCount > 0 ? 'accepted_with_warnings' : 'accepted',
    activityCount: activities.length,
    relationshipCount: acceptedRelationships.length,
    mappedCount: activities.filter((activity) => activity.mappingStatus !== 'unmapped').length,
    warningCount,
    errorCount,
    issues,
    columnMap: {},
  }
  return { batch, activities, relationships: acceptedRelationships }
}

export function sampleP6Xer(): string {
  return [
    'ERMHDR\t23.12\t2026-08-21\tProject Controls',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date',
    '%R\t1\tDEMO\t2026-06-30 00:00',
    '%T\tPROJWBS',
    '%F\twbs_id\tparent_wbs_id\twbs_short_name\twbs_name',
    '%R\t10\t\tA\tArea A',
    '%R\t11\t10\t01\tMechanical',
    '%R\t12\t10\t02\tPiping',
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name',
    '%R\t1\tProject 6x10',
    '%T\tTASK',
    '%F\ttask_id\ttask_code\ttask_name\twbs_id\ttask_type\tstatus_code\tclndr_id\ttarget_start_date\ttarget_end_date\tstart_date\tend_date\tact_start_date\tact_end_date\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tcomplete_pct\tphys_complete_pct\ttarget_work_qty\tact_work_qty',
    '%R\t100\tENG-100\tIssue piping IFC package\t11\tTT_Task\tTK_Complete\t1\t2026-01-05\t2026-02-20\t2026-01-05\t2026-02-24\t2026-01-05\t2026-02-24\t0\t96\t100\t100\t2400\t2520',
    '%R\t200\tCON-210\tInstall process-area piping\t12\tTT_Task\tTK_Active\t1\t2026-03-01\t2026-08-30\t2026-03-08\t2026-09-20\t2026-03-08\t\t576\t-32\t62\t58\t18000\t12100',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\t1\t200\t100\tPR_FS\t0',
    '%E',
  ].join('\n')
}
