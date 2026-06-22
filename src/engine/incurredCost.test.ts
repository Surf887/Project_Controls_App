import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import { projectIncurredTotals } from './incurredCost'

describe('incurredCost', () => {
  it('sums actuals and open accruals at project level', () => {
    const state = createSeedState()
    const totals = projectIncurredTotals(state.costSheetRows, state.costAccruals)
    expect(totals.incurred).toBe(totals.actuals + totals.openAccruals)
    expect(totals.incurred).toBeGreaterThan(totals.actuals)
  })
})
