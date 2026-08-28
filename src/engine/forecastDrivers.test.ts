import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import type { ForecastDriver } from '../data/forecastDrivers'
import { computeForecast, totalForecastSnapshot } from './forecast'
import {
  buildForecastDriverLedger,
  supplementalForecastDrivers,
  supersededRiskIds,
} from './forecastDrivers'

describe('unified forecast-driver ledger', () => {
  it('prevents linked realised issues and claims from double counting source records', () => {
    const state = createSeedState()
    const ledger = buildForecastDriverLedger(state)
    expect(ledger.find((driver) => driver.id === 'DRV-RISK-R-001')?.treatment).toBe('excluded')
    expect(ledger.find((driver) => driver.id === 'DRV-RISK-R-002')?.treatment).toBe('excluded')
    expect(ledger.find((driver) => driver.id === 'DRV-CLAIM-CLM-001')?.treatment).toBe('excluded')
  })

  it('adds only approved document drivers to the mapped forecast', () => {
    const state = createSeedState()
    const driver: ForecastDriver = {
      id: 'DRV-DOC-test',
      title: 'Approved contractor forecast',
      sourceType: 'document',
      sourceEntityId: 'DOC-test',
      linkedEntityIds: [],
      wbs: ['A.01'],
      impactDirection: 'cost',
      lowUsd: 800_000,
      mostLikelyUsd: 1_000_000,
      highUsd: 1_200_000,
      probability: 0.6,
      scheduleImpactDays: 0,
      treatment: 'expected_value',
      status: 'approved',
      confidence: 0.9,
      rationale: 'Reviewed',
      createdAt: '2026-08-21T00:00:00.000Z',
      createdBy: 'Reviewer',
      reviewedAt: '2026-08-21T01:00:00.000Z',
      reviewedBy: 'Approver',
    }
    const withDriver = { ...state, forecastDrivers: [driver] }
    const baseline = totalForecastSnapshot(
      computeForecast(state.costSheetRows, state.changes, state.risks, state.opportunities, {
        supplementalDrivers: supplementalForecastDrivers(state),
        supersededRiskIds: supersededRiskIds(state),
      }),
      state.costSheetRows,
    )
    const integrated = totalForecastSnapshot(
      computeForecast(withDriver.costSheetRows, withDriver.changes, withDriver.risks, withDriver.opportunities, {
        supplementalDrivers: supplementalForecastDrivers(withDriver),
        supersededRiskIds: supersededRiskIds(withDriver),
      }),
      withDriver.costSheetRows,
    )
    expect(integrated.controlLogExposure - baseline.controlLogExposure).toBeCloseTo(600_000, 2)
    expect(integrated.eacMostLikely - baseline.eacMostLikely).toBeCloseTo(600_000, 2)
  })
})
