import type { PurchaseOrder } from '../data/phases'
import type { FxExposure, FxRate, SupportedCurrency } from '../store/types'

export function convertToUsd(
  amountForeign: number,
  currency: SupportedCurrency,
  rates: FxRate[],
): number {
  if (currency === 'USD') {
    return amountForeign
  }

  const rate = rates.find((item) => item.from === currency && item.to === 'USD')
  if (!rate) {
    return amountForeign
  }

  return amountForeign * rate.rate
}

export function buildPoExposures(purchaseOrders: PurchaseOrder[], rates: FxRate[]): FxExposure[] {
  return purchaseOrders.map((po) => {
    const amountForeign = po.poValueForeign ?? po.poValueUsd
    const amountUsd = convertToUsd(amountForeign, po.currency, rates)
    const unhedgedForeign = amountForeign * (1 - po.hedgedPct / 100)
    const unhedgedUsd = convertToUsd(unhedgedForeign, po.currency, rates)

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
    }
  })
}

export function computeFxRiskUsd(
  exposures: FxExposure[],
  adverseMovePct = 5,
): { totalUnhedgedUsd: number; adverseImpactUsd: number; byCurrency: Record<SupportedCurrency, number> } {
  const byCurrency: Record<SupportedCurrency, number> = {
    USD: 0,
    EUR: 0,
    GBP: 0,
    AED: 0,
    SGD: 0,
  }

  let totalUnhedgedUsd = 0
  exposures.forEach((exposure) => {
    totalUnhedgedUsd += exposure.unhedgedUsd
    byCurrency[exposure.currency] += exposure.unhedgedUsd
  })

  return {
    totalUnhedgedUsd,
    adverseImpactUsd: totalUnhedgedUsd * (adverseMovePct / 100),
    byCurrency,
  }
}

export function formatCurrencyCode(currency: SupportedCurrency) {
  return currency
}
