import type {
  ScheduleActivity,
  ScheduleActivityStatus,
  ScheduleActivityType,
  ScheduleImportBatch,
  ScheduleImportIssue,
  ScheduleRelationship,
  ScheduleRelationshipType,
} from '../data/schedule'
import { normalizeHeader, parseCsvTable } from './workflow'

export type P6Field =
  | 'activityId'
  | 'activityName'
  | 'wbs'
  | 'activityType'
  | 'status'
  | 'calendar'
  | 'baselineStart'
  | 'baselineFinish'
  | 'currentStart'
  | 'currentFinish'
  | 'actualStart'
  | 'actualFinish'
  | 'remainingDuration'
  | 'totalFloat'
  | 'percentComplete'
  | 'physicalPercentComplete'
  | 'plannedLaborHours'
  | 'actualLaborHours'
  | 'primaryResource'
  | 'predecessors'

interface P6FieldDefinition {
  key: P6Field
  label: string
  required: boolean
  aliases: string[]
}

export const P6_FIELD_DEFINITIONS: P6FieldDefinition[] = [
  { key: 'activityId', label: 'Activity ID', required: true, aliases: ['Activity ID', 'Activity Code', 'Task ID'] },
  { key: 'activityName', label: 'Activity Name', required: true, aliases: ['Activity Name', 'Task Name', 'Name'] },
  { key: 'wbs', label: 'WBS Code', required: true, aliases: ['WBS Code', 'WBS', 'Project WBS'] },
  { key: 'activityType', label: 'Activity Type', required: false, aliases: ['Activity Type', 'Type'] },
  { key: 'status', label: 'Activity Status', required: false, aliases: ['Activity Status', 'Status'] },
  { key: 'calendar', label: 'Calendar', required: false, aliases: ['Calendar', 'Calendar Name'] },
  { key: 'baselineStart', label: 'Baseline Start', required: true, aliases: ['BL Project Start', 'Baseline Start', 'BL Start'] },
  { key: 'baselineFinish', label: 'Baseline Finish', required: true, aliases: ['BL Project Finish', 'Baseline Finish', 'BL Finish'] },
  { key: 'currentStart', label: 'Current Start', required: true, aliases: ['Start', 'Current Start', 'Forecast Start'] },
  { key: 'currentFinish', label: 'Current Finish', required: true, aliases: ['Finish', 'Current Finish', 'Forecast Finish'] },
  { key: 'actualStart', label: 'Actual Start', required: false, aliases: ['Actual Start'] },
  { key: 'actualFinish', label: 'Actual Finish', required: false, aliases: ['Actual Finish'] },
  { key: 'remainingDuration', label: 'Remaining Duration', required: false, aliases: ['Remaining Duration', 'Remaining Duration Days'] },
  { key: 'totalFloat', label: 'Total Float', required: false, aliases: ['Total Float', 'Total Float Days'] },
  { key: 'percentComplete', label: 'Duration % Complete', required: true, aliases: ['Activity % Complete', 'Duration % Complete', '% Complete'] },
  { key: 'physicalPercentComplete', label: 'Physical % Complete', required: false, aliases: ['Physical % Complete'] },
  { key: 'plannedLaborHours', label: 'Planned Labor Units', required: false, aliases: ['Planned Labor Units', 'Budgeted Labor Units', 'Planned Labor Hours'] },
  { key: 'actualLaborHours', label: 'Actual Labor Units', required: false, aliases: ['Actual Labor Units', 'Actual Labor Hours'] },
  { key: 'primaryResource', label: 'Primary Resource', required: false, aliases: ['Primary Resource', 'Resource Name'] },
  { key: 'predecessors', label: 'Predecessors', required: false, aliases: ['Predecessors', 'Predecessor Details'] },
]

export type P6ColumnMap = Partial<Record<P6Field, string>>

export interface P6CsvInspection {
  headers: string[]
  rowCount: number
  suggestedMap: P6ColumnMap
  missingRequiredFields: P6Field[]
  duplicateHeaders: string[]
}

export interface P6CsvImportOptions {
  fileName: string
  dataDate: string
  importedBy: string
  knownWbs: string[]
  columnMap: P6ColumnMap
  now?: string
}

export interface P6CsvImportResult {
  batch: ScheduleImportBatch
  activities: ScheduleActivity[]
  relationships: ScheduleRelationship[]
}

export function inspectP6Csv(text: string): P6CsvInspection {
  const table = parseCsvTable(text)
  const suggestedMap: P6ColumnMap = {}

  for (const definition of P6_FIELD_DEFINITIONS) {
    const aliases = new Set(definition.aliases.map(normalizeHeader))
    const index = table.normalizedHeaders.findIndex((header) => aliases.has(header))
    if (index >= 0) {
      suggestedMap[definition.key] = table.headers[index]
    }
  }

  return {
    headers: table.headers,
    rowCount: table.rows.length,
    suggestedMap,
    missingRequiredFields: P6_FIELD_DEFINITIONS.filter(
      (definition) => definition.required && !suggestedMap[definition.key],
    ).map((definition) => definition.key),
    duplicateHeaders: table.headers.filter(
      (header, index) => table.normalizedHeaders.indexOf(normalizeHeader(header)) !== index,
    ),
  }
}

function readField(row: Record<string, string>, field: P6Field, map: P6ColumnMap): string {
  const header = map[field]
  return header ? row[normalizeHeader(header)]?.trim() ?? '' : ''
}

function parseDate(value: string): string | null {
  if (!value.trim()) return null
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`
    return Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ? null : candidate
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10)
}

function parseNumber(value: string, fallback = 0): number {
  if (!value.trim()) return fallback
  const parsed = Number(value.replace(/[% ,]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function inferActivityType(value: string): ScheduleActivityType {
  const normalized = value.toLowerCase()
  if (normalized.includes('start') && normalized.includes('milestone')) return 'start_milestone'
  if (normalized.includes('finish') && normalized.includes('milestone')) return 'finish_milestone'
  if (normalized.includes('level of effort') || normalized === 'loe') return 'level_of_effort'
  return 'task'
}

function inferStatus(
  value: string,
  percentComplete: number,
  actualStart?: string,
  actualFinish?: string,
): ScheduleActivityStatus {
  const normalized = value.toLowerCase()
  if (actualFinish || normalized.includes('complete') && !normalized.includes('not')) return 'completed'
  if (actualStart || percentComplete > 0 || normalized.includes('progress')) return 'in_progress'
  return 'not_started'
}

function internalActivityId(sourceActivityId: string): string {
  return `P6:${sourceActivityId}`
}

function resolveWbs(sourceWbs: string, knownWbs: string[]): { wbs: string; mapped: boolean } {
  const candidates = knownWbs
    .filter((wbs) => sourceWbs === wbs || sourceWbs.startsWith(`${wbs}.`))
    .sort((a, b) => b.length - a.length)
  return candidates.length > 0 ? { wbs: sourceWbs, mapped: true } : { wbs: 'UNMAPPED-WBS', mapped: false }
}

function addIssue(
  issues: ScheduleImportIssue[],
  batchId: string,
  row: number,
  severity: ScheduleImportIssue['severity'],
  field: string,
  message: string,
  sourceActivityId?: string,
) {
  issues.push({
    id: `${batchId}:ISSUE:${issues.length + 1}`,
    row,
    severity,
    field,
    message,
    sourceActivityId,
  })
}

function parsePredecessor(
  token: string,
): { sourceId: string; type: ScheduleRelationshipType; lagDays: number } | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const typed = trimmed.match(/^(.+?)(?::|\s+)\s*(FS|SS|FF|SF)(?:\s*([+-]\s*\d+)\s*d?)?$/i)
  if (!typed) {
    return { sourceId: trimmed, type: 'FS', lagDays: 0 }
  }
  return {
    sourceId: typed[1].trim(),
    type: typed[2].toUpperCase() as ScheduleRelationshipType,
    lagDays: Number((typed[3] ?? '0').replace(/\s/g, '')),
  }
}

export function buildP6CsvImport(text: string, options: P6CsvImportOptions): P6CsvImportResult {
  const table = parseCsvTable(text)
  const importedAt = options.now ?? new Date().toISOString()
  const batchId = `SCH-IMP-${Date.parse(importedAt)}`
  const issues: ScheduleImportIssue[] = []
  const required = P6_FIELD_DEFINITIONS.filter((definition) => definition.required)
  const missingColumns = required.filter((definition) => !options.columnMap[definition.key])
  const dataDate = parseDate(options.dataDate)
  const duplicateHeaders = table.headers.filter(
    (header, index) => table.normalizedHeaders.indexOf(normalizeHeader(header)) !== index,
  )

  if (table.rows.length === 0) {
    addIssue(issues, batchId, 1, 'error', 'file', 'P6 CSV requires a header and at least one activity row.')
  }
  if (table.rows.length > 1_000) {
    addIssue(
      issues,
      batchId,
      1,
      'error',
      'file',
      'Browser-reviewed P6 CSV imports are limited to 1,000 activities; use the streaming adapter for larger programmes.',
    )
  }
  duplicateHeaders.forEach((header) =>
    addIssue(issues, batchId, 1, 'error', 'headers', `Duplicate CSV header ${header}.`),
  )
  missingColumns.forEach((definition) =>
    addIssue(issues, batchId, 1, 'error', definition.key, `Map the required ${definition.label} column.`),
  )
  if (!dataDate) {
    addIssue(issues, batchId, 1, 'error', 'dataDate', 'Provide a valid schedule data date.')
  }

  const candidates: ScheduleActivity[] = []
  const predecessorValues = new Map<string, { row: number; value: string }>()
  const seenSourceIds = new Set<string>()

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2
    const sourceActivityId = readField(row, 'activityId', options.columnMap)
    const name = readField(row, 'activityName', options.columnMap)
    const sourceWbs = readField(row, 'wbs', options.columnMap)

    if (!sourceActivityId || !name || !sourceWbs) {
      addIssue(
        issues,
        batchId,
        rowNumber,
        'error',
        'required',
        'Activity ID, Activity Name, and WBS are required on every row.',
        sourceActivityId || undefined,
      )
      return
    }
    if (seenSourceIds.has(sourceActivityId)) {
      addIssue(
        issues,
        batchId,
        rowNumber,
        'error',
        'activityId',
        `Duplicate Activity ID ${sourceActivityId}.`,
        sourceActivityId,
      )
      return
    }
    seenSourceIds.add(sourceActivityId)

    const dateFields = {
      baselineStart: parseDate(readField(row, 'baselineStart', options.columnMap)),
      baselineFinish: parseDate(readField(row, 'baselineFinish', options.columnMap)),
      currentStart: parseDate(readField(row, 'currentStart', options.columnMap)),
      currentFinish: parseDate(readField(row, 'currentFinish', options.columnMap)),
    }
    if (Object.values(dateFields).some((value) => value == null)) {
      addIssue(
        issues,
        batchId,
        rowNumber,
        'error',
        'dates',
        'Baseline and current start/finish dates must be valid.',
        sourceActivityId,
      )
      return
    }
    if (dateFields.baselineFinish! < dateFields.baselineStart! || dateFields.currentFinish! < dateFields.currentStart!) {
      addIssue(
        issues,
        batchId,
        rowNumber,
        'error',
        'dates',
        'Finish date cannot be earlier than start date.',
        sourceActivityId,
      )
      return
    }

    const percentRaw = readField(row, 'percentComplete', options.columnMap)
    if (!percentRaw) {
      addIssue(
        issues,
        batchId,
        rowNumber,
        'error',
        'percentComplete',
        'Activity % Complete is required on every row.',
        sourceActivityId,
      )
      return
    }
    if (!Number.isFinite(Number(percentRaw.replace(/[% ,]/g, '')))) {
      addIssue(
        issues,
        batchId,
        rowNumber,
        'error',
        'percentComplete',
        'Activity % Complete must be numeric.',
        sourceActivityId,
      )
      return
    }
    const percentComplete = clampPercent(parseNumber(percentRaw))
    const physicalRaw = readField(row, 'physicalPercentComplete', options.columnMap)
    const physicalPercentComplete = clampPercent(
      physicalRaw ? parseNumber(physicalRaw) : percentComplete,
    )
    const actualStart = parseDate(readField(row, 'actualStart', options.columnMap)) ?? undefined
    const actualFinish = parseDate(readField(row, 'actualFinish', options.columnMap)) ?? undefined
    const mapping = resolveWbs(sourceWbs, options.knownWbs)

    if (!mapping.mapped) {
      addIssue(
        issues,
        batchId,
        rowNumber,
        'warning',
        'wbs',
        `Source WBS ${sourceWbs} needs a project control-account mapping.`,
        sourceActivityId,
      )
    }

    const activity: ScheduleActivity = {
      id: internalActivityId(sourceActivityId),
      sourceActivityId,
      sourceWbs,
      wbs: mapping.wbs,
      name,
      activityType: inferActivityType(readField(row, 'activityType', options.columnMap)),
      status: inferStatus(readField(row, 'status', options.columnMap), percentComplete, actualStart, actualFinish),
      calendar: readField(row, 'calendar', options.columnMap) || 'Unspecified',
      baselineStart: dateFields.baselineStart!,
      baselineFinish: dateFields.baselineFinish!,
      currentStart: dateFields.currentStart!,
      currentFinish: dateFields.currentFinish!,
      actualStart,
      actualFinish,
      remainingDurationDays: Math.max(0, parseNumber(readField(row, 'remainingDuration', options.columnMap))),
      totalFloatDays: parseNumber(readField(row, 'totalFloat', options.columnMap)),
      percentComplete,
      physicalPercentComplete,
      plannedLaborHours: Math.max(0, parseNumber(readField(row, 'plannedLaborHours', options.columnMap))),
      actualLaborHours: Math.max(0, parseNumber(readField(row, 'actualLaborHours', options.columnMap))),
      primaryResource: readField(row, 'primaryResource', options.columnMap) || undefined,
      sourceSystem: 'p6_csv',
      sourceBatchId: batchId,
      mappingStatus: mapping.mapped ? 'mapped' : 'unmapped',
    }
    candidates.push(activity)
    predecessorValues.set(activity.id, {
      row: rowNumber,
      value: readField(row, 'predecessors', options.columnMap),
    })
  })

  const candidateIds = new Set(candidates.map((activity) => activity.id))
  const relationships: ScheduleRelationship[] = []
  for (const successor of candidates) {
    const predecessorCell = predecessorValues.get(successor.id)
    if (!predecessorCell?.value) continue
    const tokens = predecessorCell.value.split(/[;,]/)
    for (const token of tokens) {
      const parsed = parsePredecessor(token)
      if (!parsed) continue
      const predecessorId = internalActivityId(parsed.sourceId)
      if (!candidateIds.has(predecessorId) || predecessorId === successor.id) {
        addIssue(
          issues,
          batchId,
          predecessorCell.row,
          'warning',
          'predecessors',
          `Predecessor ${parsed.sourceId} is missing or self-referencing and was skipped.`,
          successor.sourceActivityId,
        )
        continue
      }
      relationships.push({
        id: `${batchId}:REL:${relationships.length + 1}`,
        predecessorId,
        successorId: successor.id,
        type: parsed.type,
        lagDays: parsed.lagDays,
        sourceSystem: 'p6_csv',
        sourceBatchId: batchId,
      })
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const accepted = errorCount === 0
  const activities = accepted ? candidates : []
  const acceptedRelationships = accepted ? relationships : []
  const batch: ScheduleImportBatch = {
    id: batchId,
    sourceSystem: 'p6_csv',
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
    columnMap: Object.fromEntries(
      Object.entries(options.columnMap).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ),
  }

  return { batch, activities, relationships: acceptedRelationships }
}

export function sampleP6Csv(): string {
  return [
    'Activity ID,Activity Name,WBS Code,Activity Type,Activity Status,Calendar,BL Project Start,BL Project Finish,Start,Finish,Actual Start,Actual Finish,Remaining Duration,Total Float,Activity % Complete,Physical % Complete,Planned Labor Units,Actual Labor Units,Primary Resource,Predecessors',
    'ENG-100,Issue piping IFC package,A.01.01,Task Dependent,Completed,Project 6x10,2026-01-05,2026-02-20,2026-01-05,2026-02-24,2026-01-05,2026-02-24,0,12,100,100,2400,2520,Piping Engineering,',
    'CON-210,Install process-area piping,A.02.02,Task Dependent,In Progress,Construction 6x10,2026-03-01,2026-08-30,2026-03-08,2026-09-20,2026-03-08,,72,-4,62,58,18000,12100,Piping Construction,ENG-100:FS+0',
    'COM-300,Mechanical completion,A.02.02,Finish Milestone,Not Started,Project 6x10,2026-09-01,2026-09-01,2026-09-22,2026-09-22,,,0,-4,0,0,0,0,Commissioning,CON-210:FS+0',
  ].join('\n')
}
