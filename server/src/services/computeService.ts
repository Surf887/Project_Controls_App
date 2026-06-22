import { computeForecast, totalForecastSnapshot } from '@pc/engine/forecast.js'
import { buildPoExposures, computeFxRiskUsd } from '@pc/engine/forex.js'
import { costSheetToEvmAccounts, computeEvmWithMethod } from '@pc/engine/evmFromCostSheet.js'
import type { ProjectState } from '@pc/store/types.js'

export function forecastFxAdverseUsd(state: ProjectState): number {
  if (!state.settings.fx.includeFxInForecast) {
    return 0
  }
  return computeFxRiskUsd(
    buildPoExposures(state.purchaseOrders, state.fxRates),
    state.settings.fx.adverseMovePct,
  ).adverseImpactUsd
}

export function computeProjectForecast(state: ProjectState) {
  const snapshots = computeForecast(state.costSheetRows, state.changes, state.risks, state.opportunities, {
    fxAdverseUsd: forecastFxAdverseUsd(state),
  })
  return {
    snapshots,
    totals: totalForecastSnapshot(snapshots, state.costSheetRows),
  }
}

export function computeProjectEvm(state: ProjectState) {
  const { snapshots } = computeProjectForecast(state)
  const forecastByWbs = new Map(snapshots.map((row) => [row.wbs, row.eacMostLikely]))
  const accounts = costSheetToEvmAccounts(state.costSheetRows, {
    templates: state.ruleOfCreditTemplates,
    progressCredits: state.progressCredits,
  }).map((account) =>
    computeEvmWithMethod(account, state.settings.evmEacMethod, forecastByWbs.get(account.wbs)),
  )

  const summary = accounts.reduce(
    (acc, row) => ({
      bac: acc.bac + row.bac,
      ev: acc.ev + row.ev,
      ac: acc.ac + row.ac,
      eac: acc.eac + row.eac,
    }),
    { bac: 0, ev: 0, ac: 0, eac: 0 },
  )

  return { summary, accounts: accounts.length }
}
