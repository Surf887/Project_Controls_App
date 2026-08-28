import { describe, expect, it } from 'vitest'
import { changeRegister, riskRegister } from '../data/registers'
import { defaultScenarioInputs } from '../store/types'
import { runMonteCarlo } from './scenario'
import { createSeedState } from '../store/seedState'
import { supplementalForecastDrivers, supersededRiskIds } from './forecastDrivers'

describe('runMonteCarlo', () => {
  it('returns P10 < P50 < P90 for a realistic base EAC', () => {
    const result = runMonteCarlo(320_000_000, changeRegister, riskRegister, defaultScenarioInputs, 500)

    expect(result.p10).toBeLessThan(result.p50)
    expect(result.p50).toBeLessThan(result.p90)
    expect(result.samples).toHaveLength(500)
    expect(result.drivers.length).toBeGreaterThan(0)
  })

  it('samples opportunities and governed control-log drivers without NaN values', () => {
    const state = createSeedState()
    const result = runMonteCarlo(
      300_000_000,
      state.changes,
      state.risks,
      defaultScenarioInputs,
      200,
      {
        opportunities: state.opportunities,
        supplementalDrivers: supplementalForecastDrivers(state),
        supersededRiskIds: supersededRiskIds(state),
      },
    )
    expect(result.samples.every(Number.isFinite)).toBe(true)
    expect(result.drivers.map((driver) => driver.label)).toContain('Opportunities')
    expect(result.drivers.map((driver) => driver.label)).toContain('Control logs / documents')
  })
})
