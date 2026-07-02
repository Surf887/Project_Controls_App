import type { PurchaseOrder } from '../data/phases'
import type { FxExposure, FxRate, SupportedCurrency } from '../store/types'

/** Raised when a conversion is requested for a currency with no treasury rate. */
export class MissingFxRateError extends Error {
  currency: SupportedCurrency
  constructor(currency: SupportedCurrency) {
    super(`No ${currency}→USD rate configured — add it to the treasury rate table`)
    this.name = 'MissingFxRateError'
    this.currency = currency
  }
}

/** USD conversion rate for a currency, or null when none is configured. */
export function findUsdRate(currency: SupportedCurrency, rates: FxRate[]): number | null {
  if (currency === 'USD') {
    return 1
  }
  const rate = rates.find((item) => item.from === currency && item.to === 'USD')
  return rate ? rate.rate : null
}

/**
 * Convert a foreign amount to USD. A missing rate throws rather than silently
 * treating the foreign amount as USD (a missing EUR rate used to report a
 * €10M PO as $10M with no warning). Callers that render partial data should
 * use `findUsdRate` and flag the gap instead of catching.
 */
export function convertToUsd(
  amountForeign: number,
  currency: SupportedCurrency,
  rates: FxRate[],
): number {
  const rate = findUsdRate(currency, rates)
  if (rate == null) {
    throw new MissingFxRateError(currency)
  }
  return amountForeign * rate
}

export function buildPoExposures(purchaseOrders: PurchaseOrder[], rates: FxRate[]): FxExposure[] {
  return purchaseOrders.map((po) => {
    const amountForeign = po.poValueForeign ?? po.poValueUsd
    const rate = findUsdRate(po.currency, rates)
    const unhedgedForeign = amountForeign * (1 - po.hedgedPct / 100)

    // No configured rate: report the exposure as unquantified (0 USD, flagged)
    // instead of pretending the foreign amount is already USD.
    const amountUsd = rate == null ? 0 : amountForeign * rate
    const unhedgedUsd = rate == null ? 0 : unhedgedForeign * rate

    return {
      id: `FX-${po.id}`,
      referenceType: 'po',
      referenceId: po.id,
      description: po.description,
      currency: po.currency,
      amountForeign,
      amountUsd,
      hedgedPct: po.hedgedPct,
      hedgeInstrument: po.hedgeInstrument,
      unhedgedUsd,
      rateMissing: rate == null,
    }
  })
}

export function computeFxRiskUsd(
  exposures: FxExposure[],
  adverseMovePct = 5,
): {
  totalUnhedgedUsd: number
  adverseImpactUsd: number
  byCurrency: Record<SupportedCurrency, number>
  missingRateCurrencies: SupportedCurrency[]
} {
  const byCurrency: Record<SupportedCurrency, number> = {
    USD: 0,
    EUR: 0,
    GBP: 0,
    AED: 0,
    SGD: 0,
  }

  let totalUnhedgedUsd = 0
  const missing = new Set<SupportedCurrency>()
  exposures.forEach((exposure) => {
    if (exposure.rateMissing) {
      missing.add(exposure.currency)
      return
    }
    totalUnhedgedUsd += exposure.unhedgedUsd
    byCurrency[exposure.currency] += exposure.unhedgedUsd
  })

  return {
    totalUnhedgedUsd,
    adverseImpactUsd: totalUnhedgedUsd * (adverseMovePct / 100),
    byCurrency,
    missingRateCurrencies: [...missing],
  }
}

export function formatCurrencyCode(currency: SupportedCurrency) {
  return currency
}
