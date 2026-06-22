import { describe, expect, it } from 'vitest'
import type { CostRow } from '@pc/data/costSheet.js'
import { createSeedState } from '@pc/store/seedState.js'
import { computeProjectEvm, computeProjectForecast } from './computeService.js'

describe('computeService', () => {
  it('EVM summary EAC uses per-WBS forecast map, not project total repeated', () => {
    const state = createSeedState()
    const { summary, accounts } = computeProjectEvm(state)
    const controlCount = state.costSheetRows.filter((row: CostRow) => row.parentId === null).length

    expect(accounts).toBe(controlCount)
    expect(summary.eac).toBeGreaterThan(0)
    expect(summary.eac).toBeLessThan(summary.bac * 3)
  })

  it('forecast includes FX load when FX is enabled in settings', () => {
    const state = createSeedState()
    state.settings.fx.includeFxInForecast = true
    const withFx = computeProjectForecast(state).totals.fxExposure
    state.settings.fx.includeFxInForecast = false
    const withoutFx = computeProjectForecast(state).totals.fxExposure

    expect(withFx).toBeGreaterThan(0)
    expect(withoutFx).toBe(0)
  })
})
