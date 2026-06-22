import { describe, expect, it } from 'vitest'
import { changeRegister, riskRegister } from '../data/registers'
import { defaultScenarioInputs } from '../store/types'
import { runMonteCarlo } from './scenario'

describe('runMonteCarlo', () => {
  it('returns P10 < P50 < P90 for a realistic base EAC', () => {
    const result = runMonteCarlo(320_000_000, changeRegister, riskRegister, defaultScenarioInputs, 500)

    expect(result.p10).toBeLessThan(result.p50)
    expect(result.p50).toBeLessThan(result.p90)
    expect(result.samples).toHaveLength(500)
    expect(result.drivers.length).toBeGreaterThan(0)
  })
})
