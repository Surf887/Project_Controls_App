import { buildRow, type CostRow } from '../data/costSheet'
import type { ChangeItem, OpportunityItem, RiskItem } from '../data/registers'
import { changeMechanismMeta } from '../data/registers'
import type { ForecastRowSnapshot } from '../store/types'
import { computeForecast } from './forecast'
import { computeFxRiskUsd, buildPoExposures } from './forex'
import { distributeForecastPeriods, type LoadingMethod } from './loading'
import type { PurchaseOrder } from '../data/phases'
import type { FxRate, FxSettings } from '../store/types'
import type { ForecastDriver } from '../data/forecastDrivers'

function changeMatchesWbs(change: ChangeItem, wbs: string): boolean {
  if (change.affectedWbs.length === 0) {
    return true
  }

  return change.affectedWbs.some(
    (code) => wbs === code || wbs.startsWith(`${code}.`) || code.startsWith(`${wbs}.`),
  )
}

export function approvedChangesForWbs(changes: ChangeItem[], wbs: string): number {
  return changes
    .filter(
      (change) =>
        change.status === 'approved' &&
        changeMechanismMeta[change.mechanism ?? 'scope_change'].affectsBudget &&
        changeMatchesWbs(change, wbs),
    )
    .reduce((sum, change) => sum + change.costImpactUsd, 0)
}

export type EacScenarioField = 'eacBestCase' | 'eacMostLikely' | 'eacWorstCase'

export function syncCostSheetFromRegisters(
  rows: CostRow[],
  changes: ChangeItem[],
  risks: RiskItem[],
  opportunities: OpportunityItem[],
  options: {
    eacScenario: EacScenarioField
    loadingMethod: LoadingMethod
    applyLoadingCurve: boolean
    purchaseOrders?: PurchaseOrder[]
    fxRates?: FxRate[]
    fxSettings?: FxSettings
    supplementalDrivers?: ForecastDriver[]
    supersededRiskIds?: Set<string>
  },
): CostRow[] {
  const fxAdverseUsd =
    options.fxSettings?.includeFxInForecast && options.purchaseOrders && options.fxRates
      ? computeFxRiskUsd(
          buildPoExposures(options.purchaseOrders, options.fxRates),
          options.fxSettings.adverseMovePct,
        ).adverseImpactUsd
      : 0

  const snapshots = computeForecast(rows, changes, risks, opportunities, {
    fxAdverseUsd,
    supplementalDrivers: options.supplementalDrivers,
    supersededRiskIds: options.supersededRiskIds,
  })
  const snapshotByWbs = new Map(snapshots.map((snapshot) => [snapshot.wbs, snapshot]))

  return rows.map((row) => {
    const snapshot = snapshotByWbs.get(row.wbs)
    const approvedChanges = approvedChangesForWbs(changes, row.wbs)
    const eac = snapshot ? snapshot[options.eacScenario] : row.eac
    const actualsToDate = row.periods.reduce((sum, period) => sum + period.actual, 0)
    const ftc = Math.max(eac - actualsToDate, 0)

    let periods = row.periods
    if (options.applyLoadingCurve && options.loadingMethod !== 'manual') {
      const distributed = distributeForecastPeriods(ftc, options.loadingMethod)
      periods = row.periods.map((period, index) => ({
        ...period,
        forecast: distributed[index] ?? period.forecast,
      }))
    }

    return buildRow({
      ...row,
      approvedChanges,
      eac,
      periods,
    })
  })
}

export function forecastSnapshotsByWbs(
  rows: CostRow[],
  changes: ChangeItem[],
  risks: RiskItem[],
  opportunities: OpportunityItem[],
  options?: {
    fxAdverseUsd?: number
    supplementalDrivers?: ForecastDriver[]
    supersededRiskIds?: Set<string>
  },
): Map<string, ForecastRowSnapshot> {
  return new Map(computeForecast(rows, changes, risks, opportunities, options).map((row) => [row.wbs, row]))
}
