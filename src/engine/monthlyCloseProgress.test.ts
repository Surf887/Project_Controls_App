import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import { evaluateMonthlyClose } from './monthlyCloseProgress'

describe('evaluateMonthlyClose', () => {
  it('returns 8 steps with sequential gating', () => {
    const state = createSeedState()
    const result = evaluateMonthlyClose(state)

    expect(result.totalSteps).toBe(8)
    expect(result.steps.length).toBe(8)
    expect(result.currentStep.order).toBeGreaterThanOrEqual(1)
    expect(result.percentComplete).toBeGreaterThanOrEqual(0)
  })

  it('marks later steps blocked when baseline incomplete', () => {
    const state = createSeedState()
    state.basisOfEstimate = { ...state.basisOfEstimate, scope: '', methodology: '' }
    const result = evaluateMonthlyClose(state)

    const wbs = result.steps.find((step) => step.step.id === 'wbs')!
    expect(wbs.status).toBe('blocked')
    expect(wbs.blockers[0]).toMatch(/baseline/i)
  })

  it('identifies change board queue as blocker', () => {
    const state = createSeedState()
    state.changes = state.changes.map((change, index) =>
      index === 0 ? { ...change, status: 'under_review' as const } : change,
    )
    const changesStep = evaluateMonthlyClose(state).steps.find((step) => step.step.id === 'changes')!
    expect(changesStep.blockers.some((b) => b.includes('board'))).toBe(true)
  })
})
