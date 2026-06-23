import { buildRow, type CostRow } from '../data/costSheet'
import type { ChangeItem } from '../data/registers'
import type { ExtractedValue } from '../data/projectData'
import { controlAccountRows } from './costAggregation'

/** Categories that carry a direct financial posting into the cost model. */
const POSTABLE_CATEGORIES: ReadonlyArray<ExtractedValue['category']> = ['cost', 'forecast', 'change']

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

export function findOwningControlAccount(rows: CostRow[], wbs: string): CostRow | null {
  const accounts = controlAccountRows(rows)
  const exact = accounts.find((row) => row.wbs === wbs)
  if (exact) return exact

  const prefixMatches = accounts
    .filter((row) => wbs === row.wbs || wbs.startsWith(`${row.wbs}.`))
    .sort((a, b) => b.wbs.length - a.wbs.length)
  return prefixMatches[0] ?? null
}

export function recomputeRow(row: CostRow): CostRow {
  const { actualsToDate: _a, ftc: _f, vac: _v, currentBudget: _c, isDirty: _d, ...rest } = row
  return buildRow(rest)
}

export function changeFromExtraction(value: ExtractedValue, targetWbs: string, actor: string): ChangeItem {
  return {
    id: `CHG-ING-${value.id}`,
    title: `${value.field} (from ${value.reportId})`,
    phase: 'Construction',
    type: 'Cost',
    mechanism: 'forecast_change',
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
