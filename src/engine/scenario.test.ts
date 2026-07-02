import { describe, expect, it } from 'vitest'
import { changeRegister, riskRegister, type ChangeItem } from '../data/registers'
import { defaultScenarioInputs } from '../store/types'
import { runMonteCarlo } from './scenario'

function makeChange(overrides: Partial<ChangeItem>): ChangeItem {
  return {
    id: 'CO-T1',
    title: 'Test change',
    phase: 'Construction',
    type: 'scope',
    mechanism: 'forecast_change',
    costClass: 'direct',
    description: '',
    raisedAt: '2026-06-01',
    raisedBy: 'Test',
    status: 'pending',
    costImpactUsd: 0,
    scheduleImpactDays: 0,
    probability: 1,
    affectedWbs: [],
    rationale: '',
    approver: 'Approver',
    contractor: 'Contractor',
    ...overrides,
  }
}

const neutralInputs = {
  ...defaultScenarioInputs,
  productivityFactor: 1,
  changeApprovalProbability: 1,
}

describe('runMonteCarlo', () => {
  it('returns P10 < P50 < P90 for a realistic base EAC', () => {
    const result = runMonteCarlo(320_000_000, changeRegister, riskRegister, defaultScenarioInputs, 500)

    expect(result.p10).toBeLessThan(result.p50)
    expect(result.p50).toBeLessThan(result.p90)
    expect(result.samples).toHaveLength(500)
    expect(result.drivers.length).toBeGreaterThan(0)
  })

  it('is deterministic for the same seed and differs for another seed', () => {
    const a = runMonteCarlo(320_000_000, changeRegister, riskRegister, defaultScenarioInputs, 300)
    const b = runMonteCarlo(320_000_000, changeRegister, riskRegister, defaultScenarioInputs, 300)
    const c = runMonteCarlo(320_000_000, changeRegister, riskRegister, defaultScenarioInputs, 300, 99)

    expect(a.samples).toEqual(b.samples)
    expect(a.p50).toBe(b.p50)
    expect(c.samples).not.toEqual(a.samples)
  })

  it('samples credit (negative) changes inside their triangular bounds', () => {
    // A -$1,000,000 credit change: contribution must stay within
    // [1.2 × impact, 0.8 × impact] = [-1,200,000, -800,000].
    const credit = makeChange({ costImpactUsd: -1_000_000 })
    const result = runMonteCarlo(0, [credit], [], neutralInputs, 500)

    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(-1_200_000)
      expect(sample).toBeLessThanOrEqual(-800_000)
    }
  })

  it('produces finite samples for a zero-impact change (degenerate triangle)', () => {
    const zero = makeChange({ costImpactUsd: 0 })
    const result = runMonteCarlo(0, [zero], [], neutralInputs, 100)

    expect(result.samples.every((sample) => Number.isFinite(sample))).toBe(true)
    expect(result.p50).toBe(0)
  })

  it('aligns tornado drivers with the simulated population', () => {
    const pending = makeChange({ id: 'CO-P', costImpactUsd: 500_000, status: 'pending' })
    const underReview = makeChange({ id: 'CO-UR', costImpactUsd: 300_000, status: 'under_review' })
    const rejected = makeChange({ id: 'CO-REJ', costImpactUsd: 900_000, status: 'rejected' })

    const result = runMonteCarlo(0, [pending, underReview, rejected], [], neutralInputs, 50)
    const changeDriver = result.drivers.find((driver) => driver.label === 'Pending changes')

    // under_review counts (it is simulated); rejected does not.
    expect(changeDriver?.impact).toBe(800_000)
  })
})
