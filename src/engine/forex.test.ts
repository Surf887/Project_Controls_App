import { describe, expect, it } from 'vitest'
import { purchaseOrders } from '../data/phases'
import { seedFxRates } from '../store/types'
import { buildPoExposures, computeFxRiskUsd, convertToUsd } from './forex'

describe('forex engine', () => {
  it('converts foreign currency to USD using rate table', () => {
    expect(convertToUsd(100, 'EUR', seedFxRates)).toBeCloseTo(108, 2)
  })

  it('computes unhedged exposure from PO commitments', () => {
    const exposures = buildPoExposures(purchaseOrders, seedFxRates)
    const risk = computeFxRiskUsd(exposures, 5)

    expect(exposures.length).toBe(purchaseOrders.length)
    expect(risk.totalUnhedgedUsd).toBeGreaterThan(0)
    expect(risk.adverseImpactUsd).toBeCloseTo(risk.totalUnhedgedUsd * 0.05, 2)
  })
})
