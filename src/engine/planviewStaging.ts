import type { MappingProfile } from '../data/mappingProfiles'
import type { PlanviewGovernanceItem, PlanviewItemType, PlanviewSyncBatch } from '../data/planview'
import type { ProjectState } from '../store/types'
import type { ActionItem, DecisionLogEntry, IssueItem } from '../data/registers'
import type { ScheduleActivity } from '../data/schedule'
import { applyMappingProfile } from './dynamicMapping'
import { findOwningControlAccount } from './applyExtractionsCore'

function itemType(value: string): PlanviewItemType | null {
  const normalized = value.trim().toLowerCase()
  if (['milestone', 'gate', 'stage_gate'].includes(normalized)) return 'milestone'
  if (['action', 'task', 'todo'].includes(normalized)) return 'action'
  if (['issue', 'problem', 'exception'].includes(normalized)) return 'issue'
  if (['decision', 'approval'].includes(normalized)) return 'decision'
  return null
}

function date(value: string): string | null {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10)
}

function number(value: string | undefined): number {
  const parsed = Number((value ?? '').replace(/[$,%\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildPlanviewBatch(
  profile: MappingProfile,
  headers: string[],
  rows: Record<string, string>[],
  existingItems: PlanviewGovernanceItem[],
  state: ProjectState,
  importedBy: string,
  options?: { now?: string; cursor?: string },
): { batch: PlanviewSyncBatch; items: PlanviewGovernanceItem[] } {
  const mapped = applyMappingProfile(profile, headers, rows)
  const importedAt = options?.now ?? new Date().toISOString()
  const batchId = `PV-${Date.parse(importedAt)}`
  const issues: PlanviewSyncBatch['issues'] = mapped.issues.map((issue) => ({
    ...issue,
    externalId: undefined,
  }))
  const existing = new Set(existingItems.map((item) => item.externalId))
  const seen = new Set<string>()
  const items: PlanviewGovernanceItem[] = []

  mapped.rows.forEach((row, index) => {
    const externalId = row.externalId?.trim()
    const type = itemType(row.itemType ?? '')
    const dueDate = date(row.dueDate ?? '')
    if (!externalId || !type || !row.title?.trim() || !row.owner?.trim() || !row.status?.trim() || !dueDate) {
      issues.push({
        row: index + 2,
        externalId,
        field: 'required',
        severity: 'error',
        message: 'ID, item type, title, owner, status, and due date are required.',
      })
      return
    }
    const duplicate = seen.has(externalId) || existing.has(externalId)
    seen.add(externalId)
    if (duplicate) {
      issues.push({
        row: index + 2,
        externalId,
        field: 'externalId',
        severity: 'warning',
        message: `Duplicate Planview item ${externalId} will not be posted again.`,
      })
    }
    const sourceWbs = row.wbs?.trim() ?? ''
    const account = sourceWbs ? findOwningControlAccount(state.costSheetRows, sourceWbs) : null
    if (sourceWbs && !account) {
      issues.push({
        row: index + 2,
        externalId,
        field: 'wbs',
        severity: 'warning',
        message: `Planview WBS ${sourceWbs} needs a project control-account mapping.`,
      })
    }
    items.push({
      id: `${batchId}:${externalId}`,
      batchId,
      externalId,
      projectCode: row.projectCode?.trim() ?? '',
      itemType: type,
      title: row.title.trim(),
      description: row.description?.trim() ?? '',
      owner: row.owner.trim(),
      sourceStatus: row.status.trim(),
      dueDate,
      progressPercent: Math.min(100, Math.max(0, number(row.progressPercent))),
      sourceWbs,
      wbs: account?.wbs ?? (sourceWbs ? 'UNMAPPED-WBS' : ''),
      costImpactUsd: number(row.costImpactUsd),
      scheduleImpactDays: number(row.scheduleImpactDays),
      sourceUpdatedAt: date(row.updatedAt ?? '') ?? undefined,
      mappingStatus:
        account || (!sourceWbs && type !== 'milestone') ? 'mapped' : 'unmapped',
      duplicate,
      status: 'staged',
    })
  })

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const accepted = errorCount === 0 ? items : []
  const batch: PlanviewSyncBatch = {
    id: batchId,
    profileId: profile.id,
    profileVersion: profile.version,
    dataset: profile.dataset,
    importedAt,
    importedBy,
    status: errorCount > 0 ? 'rejected' : 'staged',
    rowCount: accepted.length,
    mappedCount: accepted.filter((item) => item.mappingStatus === 'mapped').length,
    duplicateCount: accepted.filter((item) => item.duplicate).length,
    errorCount,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    cursor: options?.cursor,
    issues,
  }
  return { batch, items: accepted }
}

function normalizedStatus(value: string): 'open' | 'in_progress' | 'closed' {
  const normalized = value.toLowerCase()
  if (normalized.includes('complete') || normalized.includes('closed') || normalized.includes('done')) return 'closed'
  if (normalized.includes('progress') || normalized.includes('active')) return 'in_progress'
  return 'open'
}

export function postPlanviewBatch(state: ProjectState, batchId: string, actor: string): ProjectState {
  const batch = state.planviewSyncBatches.find((entry) => entry.id === batchId)
  if (!batch || batch.status !== 'approved') return state
  const items = state.planviewItems.filter(
    (item) => item.batchId === batchId && item.status === 'approved' && !item.duplicate,
  )
  const actions: ActionItem[] = items
    .filter((item) => item.itemType === 'action')
    .map((item) => ({
      id: `PV-ACT-${item.externalId}`,
      title: item.title,
      phase: 'Cross-phase' as const,
      description: item.description,
      owner: item.owner,
      raisedAt: item.sourceUpdatedAt ?? new Date().toISOString().slice(0, 10),
      dueDate: item.dueDate,
      status: normalizedStatus(item.sourceStatus),
      priority: 'medium' as const,
      source: 'Meeting' as const,
    }))
  const issues: IssueItem[] = items
    .filter((item) => item.itemType === 'issue')
    .map((item) => ({
      id: `PV-ISS-${item.externalId}`,
      title: item.title,
      phase: 'Cross-phase' as const,
      description: item.description,
      raisedAt: item.sourceUpdatedAt ?? new Date().toISOString().slice(0, 10),
      raisedBy: 'Planview',
      owner: item.owner,
      severity: 'medium' as const,
      status: normalizedStatus(item.sourceStatus),
      costImpactUsd: item.costImpactUsd,
      scheduleImpactDays: item.scheduleImpactDays,
      resolution: '',
      dueDate: item.dueDate,
    }))
  const decisions: DecisionLogEntry[] = items
    .filter((item) => item.itemType === 'decision')
    .map((item) => ({
      id: `PV-DEC-${item.externalId}`,
      title: item.title,
      phase: 'Cross-phase' as const,
      description: item.description,
      decision: item.sourceStatus,
      alternativesConsidered: '',
      decidedBy: item.owner,
      decidedAt: item.sourceUpdatedAt ?? new Date().toISOString().slice(0, 10),
      status: normalizedStatus(item.sourceStatus) === 'closed' ? 'approved' as const : 'pending' as const,
      cost: item.costImpactUsd,
      rationale: item.description,
    }))
  const milestones: ScheduleActivity[] = items
    .filter((item) => item.itemType === 'milestone')
    .map((item) => ({
      id: `PLANVIEW:${item.externalId}`,
      sourceActivityId: item.externalId,
      sourceWbs: item.sourceWbs,
      wbs: item.wbs || 'UNMAPPED-WBS',
      name: item.title,
      activityType: 'finish_milestone' as const,
      status:
        item.progressPercent >= 100
          ? 'completed' as const
          : item.progressPercent > 0
            ? 'in_progress' as const
            : 'not_started' as const,
      calendar: 'Planview',
      baselineStart: item.dueDate,
      baselineFinish: item.dueDate,
      currentStart: item.dueDate,
      currentFinish: item.dueDate,
      actualFinish: item.progressPercent >= 100 ? item.dueDate : undefined,
      remainingDurationDays: 0,
      totalFloatDays: 0,
      percentComplete: item.progressPercent,
      physicalPercentComplete: item.progressPercent,
      plannedLaborHours: 0,
      actualLaborHours: 0,
      sourceSystem: 'planview' as const,
      sourceBatchId: batch.id,
      mappingStatus: item.mappingStatus,
    }))
  const appendUnique = <T extends { id: string }>(incoming: T[], current: T[]) => [
    ...incoming.filter((item) => !current.some((existing) => existing.id === item.id)),
    ...current,
  ]
  const postedAt = new Date().toISOString()
  return {
    ...state,
    actions: appendUnique(actions, state.actions),
    issues: appendUnique(issues, state.issues),
    decisions: appendUnique(decisions, state.decisions),
    scheduleActivities: appendUnique(milestones, state.scheduleActivities),
    planviewItems: state.planviewItems.map((item) =>
      items.some((candidate) => candidate.id === item.id)
        ? { ...item, status: 'posted', postedAt, postedBy: actor }
        : item,
    ),
    planviewSyncBatches: state.planviewSyncBatches.map((entry) =>
      entry.id === batchId ? { ...entry, status: 'posted' } : entry,
    ),
  }
}
