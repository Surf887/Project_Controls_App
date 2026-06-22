import { describe, expect, it } from 'vitest'
import { initialCostSheet } from '../data/costSheet'
import { changeRegister, opportunityRegister, riskRegister } from '../data/registers'
import { computeForecast, totalForecastSnapshot } from './forecast'

describe('computeForecast', () => {
  it('returns deterministic EAC scenarios ordered best <= most likely <= worst per row', () => {
    const snapshots = computeForecast(initialCostSheet, changeRegister, riskRegister, opportunityRegister)

    expect(snapshots.length).toBeGreaterThan(0)

    snapshots.forEach((row) => {
      expect(row.eacBestCase).toBeLessThanOrEqual(row.eacMostLikely + 1)
      expect(row.eacMostLikely).toBeLessThanOrEqual(row.eacWorstCase + 1)
      expect(row.eacBase).toBeGreaterThan(0)
    })
  })

  it('includes pending change exposure in most likely forecast', () => {
    const snapshots = computeForecast(initialCostSheet, changeRegister, riskRegister, opportunityRegister)
    const totals = totalForecastSnapshot(snapshots, initialCostSheet)

    expect(totals.pendingChangesExpectedDelta).toBeGreaterThan(0)
    expect(totals.eacMostLikely).not.toBe(totals.eacBase)
  })

  it('is stable when computed twice with the same inputs', () => {
    const first = computeForecast(initialCostSheet, changeRegister, riskRegister, opportunityRegister)
    const second = computeForecast(initialCostSheet, changeRegister, riskRegister, opportunityRegister)
    expect(totalForecastSnapshot(first, initialCostSheet)).toEqual(totalForecastSnapshot(second, initialCostSheet))
  })

  it('applies forecast variance mechanism to EAC without mixing budget logic', () => {
    const withVariance = computeForecast(initialCostSheet, changeRegister, riskRegister, opportunityRegister)
    const withoutVariance = computeForecast(
      initialCostSheet,
      changeRegister.filter((c) => c.mechanism !== 'forecast_variance'),
      riskRegister,
      opportunityRegister,
    )

    expect(totalForecastSnapshot(withVariance, initialCostSheet).eacMostLikely).not.toBe(
      totalForecastSnapshot(withoutVariance, initialCostSheet).eacMostLikely,
    )
  })
})
