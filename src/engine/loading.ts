import { CURRENT_PERIOD_INDEX, PERIODS } from '../data/costSheet'
import type { CostRow } from '../data/costSheet'
import { controlAccountRows } from './costAggregation'

export type LoadingMethod = 'manual' | 'linear' | 'front_end' | 'back_end'

export const loadingMethodLabels: Record<LoadingMethod, string> = {
  manual: 'Manual (user entered)',
  linear: 'Linear spread',
  front_end: 'Front-end loaded',
  back_end: 'Back-end loaded',
}

/** Distribute remaining FTC across open forecast periods using the selected loading curve. */
export function distributeForecastPeriods(
  remainingFtc: number,
  method: LoadingMethod,
  currentPeriodIndex = CURRENT_PERIOD_INDEX,
): number[] {
  const forecasts = PERIODS.map(() => 0)
  if (method === 'manual' || remainingFtc <= 0) {
    return forecasts
  }

  const openIndexes = PERIODS.map((_, i) => i).filter((i) => i >= currentPeriodIndex)
  if (openIndexes.length === 0) {
    return forecasts
  }

  const weights = openIndexes.map((_, idx) => {
    const t = (idx + 1) / openIndexes.length
    if (method === 'front_end') return 1.4 - t * 0.8
    if (method === 'back_end') return 0.6 + t * 0.8
    return 1
  })

  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  openIndexes.forEach((periodIndex, idx) => {
    forecasts[periodIndex] = Math.round((remainingFtc * weights[idx]) / weightTotal)
  })

  return forecasts
}

/** S-curve cumulative % points derived from cost sheet period actuals + forecasts. */
export function buildScurveFromCostSheet(
  rows: Array<{
    parentId?: string | null
    originalBudget: number
    approvedChanges: number
    periods: Array<{ actual: number; forecast: number }>
  }>,
) {
  const scoped = controlAccountRows(rows as CostRow[])

  const totalBudget = scoped.reduce((sum, row) => sum + row.originalBudget + row.approvedChanges, 0) || 1

  return PERIODS.map((period, index) => {
    const cumulativeActual = scoped.reduce((sum, row) => {
      return sum + row.periods.slice(0, index + 1).reduce((periodSum, p) => periodSum + p.actual, 0)
    }, 0)
    const cumulativeForecast = scoped.reduce((sum, row) => {
      const actualPart = row.periods.slice(0, CURRENT_PERIOD_INDEX).reduce((s, p) => s + p.actual, 0)
      const forecastPart = row.periods
        .slice(CURRENT_PERIOD_INDEX, index + 1)
        .reduce((s, p) => s + p.forecast, 0)
      return sum + actualPart + forecastPart
    }, 0)

    const planned = ((index + 1) / PERIODS.length) * 100
    const actualPct = index < CURRENT_PERIOD_INDEX ? (cumulativeActual / totalBudget) * 100 : null
    const forecastPct = index >= CURRENT_PERIOD_INDEX - 1 ? (cumulativeForecast / totalBudget) * 100 : null

    return {
      period,
      planned: Math.round(planned * 10) / 10,
      actual: actualPct === null ? null : Math.round(actualPct * 10) / 10,
      forecast: forecastPct === null ? null : Math.round(forecastPct * 10) / 10,
    }
  })
}
