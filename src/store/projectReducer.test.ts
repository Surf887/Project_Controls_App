import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import { projectReducer } from '../store/projectReducer'

describe('projectReducer stability', () => {
  it('does not mutate cost sheet on HYDRATE', () => {
    const seed = createSeedState()
    const hydrated = projectReducer(seed, { type: 'HYDRATE', payload: seed })
    expect(hydrated).toBe(seed)
    expect(hydrated.costSheetRows).toBe(seed.costSheetRows)
  })

  it('returns same state reference when SET_COST_SHEET payload is unchanged', () => {
    const seed = createSeedState()
    const next = projectReducer(seed, { type: 'SET_COST_SHEET', payload: seed.costSheetRows })
    expect(next).toBe(seed)
  })

  it('does not change extraction values while the reporting period is locked', () => {
    const seed = createSeedState()
    seed.settings.reportingPeriod.locked = true
    const values = seed.values.map((value) => ({ ...value, wbs: 'B.01' }))
    const next = projectReducer(seed, { type: 'SET_VALUES', payload: values })
    expect(next).toBe(seed)
  })
})
