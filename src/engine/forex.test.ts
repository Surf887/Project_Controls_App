import { describe, expect, it } from 'vitest'
import { purchaseOrders, type PurchaseOrder } from '../data/phases'
import { seedFxRates } from '../store/types'
import {
  buildPoExposures,
  computeFxRiskUsd,
  convertToUsd,
  findUsdRate,
  MissingFxRateError,
} from './forex'

describe('forex engine', () => {
  it('converts foreign currency to USD using rate table', () => {
    expect(convertToUsd(100, 'EUR', seedFxRates)).toBeCloseTo(108, 2)
    expect(convertToUsd(100, 'USD', [])).toBe(100)
  })

  it('throws MissingFxRateError instead of silently treating foreign amounts as USD', () => {
    expect(() => convertToUsd(100, 'EUR', [])).toThrow(MissingFxRateError)
    expect(findUsdRate('EUR', [])).toBeNull()
    expect(findUsdRate('USD', [])).toBe(1)
  })

  it('computes unhedged exposure from PO commitments', () => {
    const exposures = buildPoExposures(purchaseOrders, seedFxRates)
    const risk = computeFxRiskUsd(exposures, 5)

    expect(exposures.length).toBe(purchaseOrders.length)
    expect(risk.totalUnhedgedUsd).toBeGreaterThan(0)
    expect(risk.adverseImpactUsd).toBeCloseTo(risk.totalUnhedgedUsd * 0.05, 2)
    expect(risk.missingRateCurrencies).toEqual([])
  })

  it('flags exposures with no configured rate and excludes them from USD totals', () => {
    const eurPo = purchaseOrders.find((po): po is PurchaseOrder => po.currency === 'EUR')
    expect(eurPo).toBeDefined()

    const ratesWithoutEur = seedFxRates.filter((rate) => rate.from !== 'EUR')
    const exposures = buildPoExposures(purchaseOrders, ratesWithoutEur)
    const flagged = exposures.filter((exposure) => exposure.currency === 'EUR')

    expect(flagged.length).toBeGreaterThan(0)
    expect(flagged.every((exposure) => exposure.rateMissing)).toBe(true)
    expect(flagged.every((exposure) => exposure.amountUsd === 0 && exposure.unhedgedUsd === 0)).toBe(true)

    const risk = computeFxRiskUsd(exposures, 5)
    expect(risk.missingRateCurrencies).toContain('EUR')
    expect(risk.byCurrency.EUR).toBe(0)
  })
})
