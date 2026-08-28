import type { CostRow } from '../data/costSheet'
import type { ChangeItem, OpportunityItem, RiskItem } from '../data/registers'
import { changeMechanismMeta } from '../data/registers'
import type { ForecastRowSnapshot } from '../store/types'
import { controlAccountRows, snapshotsForControlAccounts } from './costAggregation'
import { isReserveCostType } from './contingency'
import type { ForecastDriver } from '../data/forecastDrivers'

function likelihoodToProbability(likelihood: number): number {
  return likelihood / 5
}

function changeMatchesWbs(change: ChangeItem, wbs: string): boolean {
  if (change.affectedWbs.length === 0) {
    return true
  }

  return change.affectedWbs.some(
    (code) => wbs === code || wbs.startsWith(`${code}.`) || code.startsWith(`${wbs}.`),
  )
}

function changeAffectsForecast(change: ChangeItem): boolean {
  const mechanism = change.mechanism ?? 'scope_change'
  return changeMechanismMeta[mechanism].affectsForecast
}

function matchingChanges(
  changes: ChangeItem[],
  rowWbs: string,
  statusFilter: (change: ChangeItem) => boolean,
): ChangeItem[] {
  return changes.filter(
    (change) => changeAffectsForecast(change) && statusFilter(change) && changeMatchesWbs(change, rowWbs),
  )
}

function changeAffectsBudget(change: ChangeItem): boolean {
  const mechanism = change.mechanism ?? 'scope_change'
  return changeMechanismMeta[mechanism].affectsBudget
}

function remainingFromCurrentBudget(row: CostRow): number {
  return Math.max(row.currentBudget - row.actualsToDate, 0)
}

function remainingBudget(row: CostRow): number {
  return Math.max(row.eac - row.actualsToDate, 0)
}

export function computeForecast(
  rows: CostRow[],
  changes: ChangeItem[],
  risks: RiskItem[],
  opportunities: OpportunityItem[],
  options?: {
    fxAdverseUsd?: number
    supplementalDrivers?: ForecastDriver[]
    supersededRiskIds?: Set<string>
  },
): ForecastRowSnapshot[] {
  // Project-level risk/opportunity exposure is allocated across control accounts only
  // (the same rows that totalForecastSnapshot sums), so the per-row share and the
  // totals aggregation use the same denominator. Allocating across all rows
  // (including work packages / cost elements) and then summing only control
  // accounts materially understates EAC — see totalForecastSnapshot below.
  const activeControlAccounts = controlAccountRows(rows).filter((row) => !isReserveCostType(row.costType))
  const fxShare =
    options?.fxAdverseUsd && activeControlAccounts.length > 0
      ? options.fxAdverseUsd / activeControlAccounts.length
      : 0

  const threatExposure = risks
    .filter(
      (risk) =>
        risk.status !== 'closed' &&
        risk.status !== 'rejected' &&
        !options?.supersededRiskIds?.has(risk.id),
    )
    .reduce((sum, risk) => {
      const probability = likelihoodToProbability(risk.postMitigationLikelihood)
      return sum + probability * risk.costExposureUsd
    }, 0)

  const opportunityOffset = opportunities
    .filter((item) => item.status !== 'closed' && item.status !== 'rejected')
    .reduce((sum, item) => {
      const probability = likelihoodToProbability(item.likelihood)
      return sum + probability * item.costSavingUsd
    }, 0)

  const netRiskExposure = threatExposure - opportunityOffset
  const riskShare = activeControlAccounts.length === 0 ? 0 : netRiskExposure / activeControlAccounts.length

  const openRiskWorstCase = risks
    .filter(
      (risk) =>
        risk.status !== 'closed' &&
        risk.status !== 'rejected' &&
        !options?.supersededRiskIds?.has(risk.id),
    )
    .reduce((sum, risk) => sum + risk.costExposureUsd, 0)
  const worstCaseShare =
    activeControlAccounts.length === 0 ? 0 : openRiskWorstCase / activeControlAccounts.length

  return rows.map((row) => {
    if (isReserveCostType(row.costType)) {
      const eacBase = row.actualsToDate + remainingBudget(row)
      return {
        wbs: row.wbs,
        eacBase,
        approvedChangesDelta: row.approvedChanges,
        pendingChangesExpectedDelta: 0,
        riskExposure: 0,
        controlLogExposure: 0,
        contingencyDraw: Math.abs(Math.min(row.approvedChanges, 0)),
        fxExposure: 0,
        eacBestCase: eacBase,
        eacMostLikely: eacBase,
        eacWorstCase: eacBase,
      }
    }

    const eacBase = row.actualsToDate + remainingFromCurrentBudget(row)

    // Budget-approved changes are already in currentBudget / approvedChanges on the sheet.
    // Only stack forecast-only approved items (variance, forecast change) on top of the base.
    const approvedChangesDelta = matchingChanges(
      changes,
      row.wbs,
      (change) => change.status === 'approved' && !changeAffectsBudget(change),
    ).reduce((sum, change) => sum + change.costImpactUsd, 0)

    const pendingChangesExpectedDelta = matchingChanges(
      changes,
      row.wbs,
      (change) => change.status === 'pending' || change.status === 'under_review',
    ).reduce((sum, change) => sum + change.costImpactUsd * change.probability, 0)

    const pendingChangesFullDelta = matchingChanges(
      changes,
      row.wbs,
      (change) => change.status === 'pending' || change.status === 'under_review',
    ).reduce((sum, change) => sum + change.costImpactUsd, 0)

    // Risk/opportunity is only allocated to non-reserve control accounts. Detail
    // rows (work packages / cost elements) inherit their parent's exposure via
    // the control-account roll-up, so they get zero here to avoid double counting.
    const isAllocatableControlAccount =
      row.parentId === null && !isReserveCostType(row.costType)
    const riskExposure = isAllocatableControlAccount ? riskShare : 0
    const openRiskWorstCaseShare = isAllocatableControlAccount ? worstCaseShare : 0
    const relevantDrivers = isAllocatableControlAccount
      ? (options?.supplementalDrivers ?? []).flatMap((driver) => {
          if (driver.treatment === 'excluded' || driver.status === 'rejected' || driver.status === 'superseded') {
            return []
          }
          if (
            (driver.sourceType === 'document' || driver.sourceType === 'manual') &&
            driver.status !== 'approved'
          ) {
            return []
          }
          const candidateAccounts =
            driver.wbs.length === 0
              ? activeControlAccounts
              : activeControlAccounts.filter((account) =>
                  driver.wbs.some(
                    (code) =>
                      account.wbs === code ||
                      account.wbs.startsWith(`${code}.`) ||
                      code.startsWith(`${account.wbs}.`),
                  ),
                )
          if (!candidateAccounts.some((account) => account.id === row.id)) return []
          return [{ driver, divisor: Math.max(candidateAccounts.length, 1) }]
        })
      : []
    const signed = (driver: ForecastDriver, amount: number) =>
      (driver.impactDirection === 'saving' ? -1 : 1) * amount
    const controlLogExposure = relevantDrivers.reduce(
      (sum, { driver, divisor }) =>
        sum +
        signed(
          driver,
          driver.treatment === 'deterministic'
            ? driver.mostLikelyUsd / divisor
            : (driver.mostLikelyUsd * driver.probability) / divisor,
        ),
      0,
    )
    const deterministicLogExposure = relevantDrivers
      .filter(({ driver }) => driver.treatment === 'deterministic')
      .reduce(
        (sum, { driver, divisor }) => sum + signed(driver, driver.mostLikelyUsd / divisor),
        0,
      )
    const worstCaseLogExposure = relevantDrivers.reduce(
      (sum, { driver, divisor }) =>
        sum +
        signed(
          driver,
          (driver.impactDirection === 'saving' ? driver.lowUsd : driver.highUsd) / divisor,
        ),
      0,
    )

    const eacBestCase = eacBase + approvedChangesDelta + deterministicLogExposure
    const eacMostLikely =
      eacBase +
      approvedChangesDelta +
      pendingChangesExpectedDelta +
      riskExposure +
      controlLogExposure +
      fxShare
    const eacWorstCase =
      eacBase +
      approvedChangesDelta +
      pendingChangesFullDelta +
      openRiskWorstCaseShare +
      worstCaseLogExposure +
      fxShare * 2

    return {
      wbs: row.wbs,
      eacBase,
      approvedChangesDelta,
      pendingChangesExpectedDelta,
      riskExposure,
      controlLogExposure,
      contingencyDraw: 0,
      fxExposure: fxShare,
      eacBestCase,
      eacMostLikely,
      eacWorstCase,
    }
  })
}

export function totalForecastSnapshot(snapshots: ForecastRowSnapshot[], rows?: CostRow[]) {
  const scoped = rows ? snapshotsForControlAccounts(snapshots, rows) : snapshots
  return scoped.reduce(
    (acc, row) => ({
      eacBase: acc.eacBase + row.eacBase,
      approvedChangesDelta: acc.approvedChangesDelta + row.approvedChangesDelta,
      pendingChangesExpectedDelta: acc.pendingChangesExpectedDelta + row.pendingChangesExpectedDelta,
      riskExposure: acc.riskExposure + row.riskExposure,
      controlLogExposure: acc.controlLogExposure + row.controlLogExposure,
      contingencyDraw: acc.contingencyDraw + row.contingencyDraw,
      fxExposure: acc.fxExposure + row.fxExposure,
      eacBestCase: acc.eacBestCase + row.eacBestCase,
      eacMostLikely: acc.eacMostLikely + row.eacMostLikely,
      eacWorstCase: acc.eacWorstCase + row.eacWorstCase,
    }),
    {
      eacBase: 0,
      approvedChangesDelta: 0,
      pendingChangesExpectedDelta: 0,
      riskExposure: 0,
      controlLogExposure: 0,
      contingencyDraw: 0,
      fxExposure: 0,
      eacBestCase: 0,
      eacMostLikely: 0,
      eacWorstCase: 0,
    },
  )
}
