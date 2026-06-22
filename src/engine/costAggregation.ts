import type { CostRow } from '../data/costSheet'
import type { ForecastRowSnapshot } from '../store/types'

/**
 * Financial aggregation grain for project totals (BAC, EAC, EV, portfolio, forecast roll-ups).
 *
 * Control accounts (`parentId === null`) hold authoritative budget/actual/EAC values.
 * Work packages and cost elements beneath them are detail breakdown only — never summed
 * together with their parent (EcoSys / Unifier cost control level pattern).
 */
export const FINANCIAL_AGGREGATION_GRAIN = 'control_account' as const

export type FinancialAggregationGrain = typeof FINANCIAL_AGGREGATION_GRAIN

export function isControlAccount(row: CostRow): boolean {
  return row.parentId === null
}

export function isDetailRow(row: CostRow): boolean {
  return row.parentId !== null
}

/** Rows used for project-level financial totals. */
export function controlAccountRows(rows: CostRow[]): CostRow[] {
  return rows.filter(isControlAccount)
}

/** Detail rows beneath control accounts (work packages, cost elements). */
export function detailRows(rows: CostRow[]): CostRow[] {
  return rows.filter(isDetailRow)
}

export type CostSheetMetric =
  | 'originalBudget'
  | 'approvedChanges'
  | 'currentBudget'
  | 'commitments'
  | 'actualsToDate'
  | 'eac'
  | 'ftc'
  | 'vac'

export function sumCostSheetMetric(rows: CostRow[], metric: CostSheetMetric): number {
  return controlAccountRows(rows).reduce((sum, row) => sum + row[metric], 0)
}

export function sumBac(rows: CostRow[]): number {
  return controlAccountRows(rows).reduce(
    (sum, row) => sum + row.originalBudget + row.approvedChanges,
    0,
  )
}

export function snapshotsForControlAccounts(
  snapshots: ForecastRowSnapshot[],
  rows: CostRow[],
): ForecastRowSnapshot[] {
  const controlWbs = new Set(controlAccountRows(rows).map((row) => row.wbs))
  return snapshots.filter((snapshot) => controlWbs.has(snapshot.wbs))
}

export interface DoubleCountReport {
  ok: boolean
  allRowsTotal: number
  controlAccountTotal: number
  inflationPct: number
  detailRowCount: number
  controlAccountCount: number
}

/** Detect parent + child double-counting for a numeric column derived from rows. */
export function detectDoubleCount(
  rows: CostRow[],
  pick: (row: CostRow) => number,
): DoubleCountReport {
  const allRowsTotal = rows.reduce((sum, row) => sum + pick(row), 0)
  const controlAccountTotal = controlAccountRows(rows).reduce((sum, row) => sum + pick(row), 0)
  const inflationPct =
    controlAccountTotal === 0 ? 0 : ((allRowsTotal - controlAccountTotal) / controlAccountTotal) * 100

  return {
    ok: detailRows(rows).length === 0 || allRowsTotal <= controlAccountTotal * 1.001,
    allRowsTotal,
    controlAccountTotal,
    inflationPct,
    detailRowCount: detailRows(rows).length,
    controlAccountCount: controlAccountRows(rows).length,
  }
}

export interface HierarchyValidationIssue {
  controlWbs: string
  field: CostSheetMetric
  parentValue: number
  childrenSum: number
  delta: number
}

/**
 * Warn when detail rows exist and their sum materially exceeds the control account
 * (parallel budgeting — detail is not a roll-up of parent).
 */
export function validateControlAccountHierarchy(
  rows: CostRow[],
  metrics: CostSheetMetric[] = ['originalBudget', 'currentBudget', 'eac'],
  tolerance = 1,
): HierarchyValidationIssue[] {
  const issues: HierarchyValidationIssue[] = []

  controlAccountRows(rows).forEach((parent) => {
    const children = rows.filter((row) => row.parentId === parent.id)
    if (children.length === 0) return

    metrics.forEach((field) => {
      const childrenSum = children.reduce((sum, child) => sum + child[field], 0)
      const delta = childrenSum - parent[field]
      if (Math.abs(delta) > tolerance) {
        issues.push({
          controlWbs: parent.wbs,
          field,
          parentValue: parent[field],
          childrenSum,
          delta,
        })
      }
    })
  })

  return issues
}
