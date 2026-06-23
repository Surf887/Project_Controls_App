import { buildRow, type CostRow } from '../data/costSheet'
import type { ChangeItem } from '../data/registers'
import type { ExtractedValue } from '../data/projectData'
import { controlAccountRows, sumCostSheetMetric } from './costAggregation'
import { resolveSccsForExtraction } from './sccs'
import type { AppliedExtractionLine, IngestionApplySummary, ProjectState } from '../store/types'
import { isApplicable, findOwningControlAccount, recomputeRow, changeFromExtraction } from './applyExtractionsCore'

export type IngestionPostingEffect = 'commitments_set' | 'eac_set' | 'eac_increment'

/** Immutable ledger row for each extraction posted into the cost model. */
export interface IngestionPosting {
  id: string
  valueId: string
  reportId: string
  postedAt: string
  postedBy: string
  targetControlAccountId: string
  targetControlAccountWbs: string
  category: ExtractedValue['category']
  effect: IngestionPostingEffect
  amountUsd: number
  priorCommitments: number
  priorEac: number
  changeId?: string
  status: 'active' | 'reversed'
  reversedAt?: string
  reversedBy?: string
}

export function getActivePosting(state: ProjectState, valueId: string): IngestionPosting | undefined {
  return (state.ingestionPostings ?? []).find((posting) => posting.valueId === valueId && posting.status === 'active')
}

/**
 * For cost/forecast extractions on the same WBS, only the last approved value
 * in queue order is applied (absolute contractor report semantics). Change
 * extractions are all applied additively with separate ledger rows.
 */
export function selectApplicableBatch(values: ExtractedValue[]): ExtractedValue[] {
  const applicable = values.filter(isApplicable)
  const lastByKey = new Map<string, ExtractedValue>()

  for (const value of applicable) {
    if (value.category === 'change') {
      lastByKey.set(`change:${value.id}`, value)
      continue
    }
    lastByKey.set(`${value.category}:${value.wbs}`, value)
  }

  return [...lastByKey.values()]
}

/** Reverse a single active posting and restore prior cost-sheet values. */
export function reverseIngestionPosting(state: ProjectState, valueId: string, actor: string): ProjectState {
  const posting = getActivePosting(state, valueId)
  if (!posting) {
    return {
      ...state,
      values: state.values.map((value) =>
        value.id === valueId
          ? { ...value, applied: undefined, appliedAt: undefined, postingId: undefined }
          : value,
      ),
    }
  }

  const rows = state.costSheetRows.map((row) => {
    if (row.id !== posting.targetControlAccountId) return row
    if (posting.effect === 'commitments_set') {
      return recomputeRow({ ...row, commitments: posting.priorCommitments })
    }
    if (posting.effect === 'eac_set') {
      return recomputeRow({ ...row, eac: posting.priorEac })
    }
    return recomputeRow({ ...row, eac: row.eac - posting.amountUsd })
  })

  const changes = posting.changeId
    ? state.changes.filter((change) => change.id !== posting.changeId)
    : state.changes

  const postings = (state.ingestionPostings ?? []).map((entry) =>
    entry.id === posting.id
      ? {
          ...entry,
          status: 'reversed' as const,
          reversedAt: new Date().toISOString(),
          reversedBy: actor,
        }
      : entry,
  )

  const values = state.values.map((value) =>
    value.id === valueId
      ? { ...value, applied: undefined, appliedAt: undefined, postingId: undefined }
      : value,
  )

  return { ...state, costSheetRows: rows, changes, ingestionPostings: postings, values }
}

export function applyApprovedExtractions(
  state: ProjectState,
  actor: string,
): { state: ProjectState; summary: IngestionApplySummary } {
  const eacBefore = sumCostSheetMetric(state.costSheetRows, 'eac')
  const commitmentsBefore = sumCostSheetMetric(state.costSheetRows, 'commitments')

  let rows = state.costSheetRows.map((row) => ({ ...row }))
  const newChanges: ChangeItem[] = []
  const newPostings: IngestionPosting[] = []
  const lines: AppliedExtractionLine[] = []
  const appliedIds = new Set<string>()
  let skippedUnmapped = 0

  const batch = selectApplicableBatch(state.values)

  for (const value of batch) {
    const target = findOwningControlAccount(rows, value.wbs)
    if (!target) {
      skippedUnmapped += 1
      continue
    }

    const priorCommitments = target.commitments
    const priorEac = target.eac
    let effect: IngestionPostingEffect
    let changeId: string | undefined
    let nextRow: CostRow

    const currentRow = rows.find((row) => row.id === target.id)!
    if (value.category === 'cost') {
      effect = 'commitments_set'
      nextRow = recomputeRow({ ...currentRow, commitments: value.normalizedValue })
    } else if (value.category === 'forecast') {
      effect = 'eac_set'
      nextRow = recomputeRow({ ...currentRow, eac: value.normalizedValue })
    } else {
      effect = 'eac_increment'
      nextRow = recomputeRow({ ...currentRow, eac: currentRow.eac + value.normalizedValue })
    }

    rows = rows.map((row) => (row.id === target.id ? nextRow : row))

    if (value.category === 'change') {
      changeId = `CHG-ING-${value.id}`
      if (!state.changes.some((change) => change.id === changeId)) {
        newChanges.push(changeFromExtraction(value, target.wbs, actor))
      }
    }

    const postingId = `POST-${value.id}-${Date.now()}`
    newPostings.push({
      id: postingId,
      valueId: value.id,
      reportId: value.reportId,
      postedAt: new Date().toISOString(),
      postedBy: actor,
      targetControlAccountId: target.id,
      targetControlAccountWbs: target.wbs,
      category: value.category,
      effect: effect,
      amountUsd: value.normalizedValue,
      priorCommitments,
      priorEac,
      changeId,
      status: 'active',
    })

    lines.push({
      valueId: value.id,
      reportId: value.reportId,
      field: value.field,
      category: value.category,
      sourceWbs: value.wbs,
      targetControlAccountWbs: target.wbs,
      sccsComposite: resolveSccsForExtraction(value).composite,
      amountUsd: value.normalizedValue,
      effect: value.category === 'cost' ? 'commitments' : value.category === 'forecast' ? 'eac' : 'eac_via_change',
    })
    appliedIds.add(value.id)
  }

  const eacAfter = sumCostSheetMetric(rows, 'eac')
  const commitmentsAfter = sumCostSheetMetric(rows, 'commitments')
  const appliedAt = new Date().toISOString()

  const byReportMap = new Map<string, { reportId: string; reportName: string; count: number }>()
  for (const line of lines) {
    const report = state.reports.find((entry) => entry.id === line.reportId)
    const entry = byReportMap.get(line.reportId) ?? {
      reportId: line.reportId,
      reportName: report?.name ?? line.reportId,
      count: 0,
    }
    entry.count += 1
    byReportMap.set(line.reportId, entry)
  }

  const summary: IngestionApplySummary = {
    id: `ING-${appliedAt}`,
    at: appliedAt,
    actor,
    appliedCount: appliedIds.size,
    skippedUnmappedCount: skippedUnmapped,
    eacBeforeUsd: eacBefore,
    eacAfterUsd: eacAfter,
    eacDeltaUsd: eacAfter - eacBefore,
    commitmentsDeltaUsd: commitmentsAfter - commitmentsBefore,
    changesCreated: newChanges.length,
    byReport: [...byReportMap.values()],
    lines,
  }

  if (appliedIds.size === 0) {
    return { state, summary }
  }

  const postingByValueId = new Map(newPostings.map((posting) => [posting.valueId, posting.id]))

  return {
    state: {
      ...state,
      costSheetRows: rows,
      changes: [...newChanges, ...state.changes],
      ingestionPostings: [...newPostings, ...(state.ingestionPostings ?? [])],
      values: state.values.map((value) =>
        appliedIds.has(value.id)
          ? {
              ...value,
              applied: true,
              appliedAt,
              postingId: postingByValueId.get(value.id),
            }
          : value,
      ),
    },
    summary,
  }
}

export { isApplicable, pendingApplyCount } from './applyExtractionsCore'
