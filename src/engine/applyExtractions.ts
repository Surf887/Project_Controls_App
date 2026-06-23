import { buildRow, type CostRow } from '../data/costSheet'
import type { ChangeItem } from '../data/registers'
import type { ExtractedValue } from '../data/projectData'
import { controlAccountRows, sumCostSheetMetric } from './costAggregation'
import { resolveSccsForExtraction } from './sccs'
import type { AppliedExtractionLine, IngestionApplySummary, ProjectState } from '../store/types'

/** Categories that carry a direct financial posting into the cost model. */
const POSTABLE_CATEGORIES: ReadonlyArray<ExtractedValue['category']> = ['cost', 'forecast', 'change']

/** An extraction is ready to post when it has been both reviewed and approved, and not yet applied. */
export function isApplicable(value: ExtractedValue): boolean {
  return (
    value.reviewStatus === 'approved' &&
    value.approvalStatus === 'approved' &&
    !value.applied &&
    POSTABLE_CATEGORIES.includes(value.category)
  )
}

export function pendingApplyCount(values: ExtractedValue[]): number {
  return values.filter(isApplicable).length
}

/**
 * Find the control account (parentId === null) that owns a WBS code: an exact
 * match, otherwise the control account whose code is the longest prefix of the
 * extraction's WBS (e.g. "P.04.01" -> control account "P.04"). Project totals
 * roll up at the control-account grain, so postings must land here.
 */
function findOwningControlAccount(rows: CostRow[], wbs: string): CostRow | null {
  const accounts = controlAccountRows(rows)
  const exact = accounts.find((row) => row.wbs === wbs)
  if (exact) return exact

  const prefixMatches = accounts
    .filter((row) => wbs === row.wbs || wbs.startsWith(`${row.wbs}.`))
    .sort((a, b) => b.wbs.length - a.wbs.length)
  return prefixMatches[0] ?? null
}

function recompute(row: CostRow): CostRow {
  // buildRow recomputes currentBudget, actualsToDate, ftc, vac from the inputs.
  const { actualsToDate: _a, ftc: _f, vac: _v, currentBudget: _c, isDirty: _d, ...rest } = row
  return buildRow(rest)
}

function changeFromExtraction(value: ExtractedValue, targetWbs: string, actor: string): ChangeItem {
  return {
    // Deterministic id so re-runs in tests are stable and dedupe is possible.
    id: `CHG-ING-${value.id}`,
    title: `${value.field} (from ${value.reportId})`,
    phase: 'Construction',
    type: 'Cost',
    mechanism: 'forecast_change', // forecast-only: does NOT auto-draw contingency
    costClass: 'Other',
    description: `Auto-logged from approved contractor extraction ${value.id}. Reflected in forecast; pending change-board decision.`,
    raisedAt: new Date().toISOString().slice(0, 10),
    raisedBy: actor,
    status: 'submitted',
    costImpactUsd: value.normalizedValue,
    scheduleImpactDays: 0,
    probability: 1,
    affectedWbs: [targetWbs],
    rationale: 'Contractor-reported change captured during report ingestion.',
    approver: 'Unassigned',
    contractor: '',
  }
}

/**
 * Post all applicable approved extractions onto their owning control accounts:
 *   cost     -> set commitments
 *   forecast -> set EAC
 *   change   -> add to EAC and log a (submitted) change for the board
 * Returns the next state and a summary describing the EAC movement. Pure: does
 * not mutate `state`. Idempotent — already-applied values are skipped.
 */
export function applyApprovedExtractions(
  state: ProjectState,
  actor: string,
): { state: ProjectState; summary: IngestionApplySummary } {
  const eacBefore = sumCostSheetMetric(state.costSheetRows, 'eac')
  const commitmentsBefore = sumCostSheetMetric(state.costSheetRows, 'commitments')

  let rows = state.costSheetRows.map((row) => ({ ...row }))
  const newChanges: ChangeItem[] = []
  const lines: AppliedExtractionLine[] = []
  const appliedIds = new Set<string>()
  let skippedUnmapped = 0

  for (const value of state.values) {
    if (!isApplicable(value)) continue

    const target = findOwningControlAccount(rows, value.wbs)
    if (!target) {
      skippedUnmapped += 1
      continue
    }

    rows = rows.map((row) => {
      if (row.id !== target.id) return row
      if (value.category === 'cost') {
        return recompute({ ...row, commitments: value.normalizedValue })
      }
      if (value.category === 'forecast') {
        return recompute({ ...row, eac: value.normalizedValue })
      }
      // change
      return recompute({ ...row, eac: row.eac + value.normalizedValue })
    })

    if (value.category === 'change') {
      newChanges.push(changeFromExtraction(value, target.wbs, actor))
    }

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

  const byReportMap = new Map<string, { reportId: string; reportName: string; count: number }>()
  for (const line of lines) {
    const report = state.reports.find((r) => r.id === line.reportId)
    const entry = byReportMap.get(line.reportId) ?? {
      reportId: line.reportId,
      reportName: report?.name ?? line.reportId,
      count: 0,
    }
    entry.count += 1
    byReportMap.set(line.reportId, entry)
  }

  const appliedAt = new Date().toISOString()
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

  const nextState: ProjectState = {
    ...state,
    costSheetRows: rows,
    changes: [...newChanges, ...state.changes],
    values: state.values.map((value) =>
      appliedIds.has(value.id) ? { ...value, applied: true, appliedAt } : value,
    ),
  }

  return { state: nextState, summary }
}
