import type { ExpeditingMilestone, PurchaseOrder } from '../data/phases'
import type { LongLeadItem } from '../store/types'

export function computeLeadTimeStatus(item: LongLeadItem): 'on_track' | 'at_risk' | 'critical' {
  const required = new Date(item.requiredOnSiteDate).getTime()
  const forecast = new Date(item.forecastOnSiteDate).getTime()
  const slipDays = (forecast - required) / (1000 * 60 * 60 * 24)

  if (slipDays > 14 || item.scheduleImpactDays > 7) {
    return 'critical'
  }

  if (slipDays > 0 || item.scheduleImpactDays > 0) {
    return 'at_risk'
  }

  return 'on_track'
}

export function daysToRequired(item: LongLeadItem, asOf = new Date()): number {
  const required = new Date(item.requiredOnSiteDate).getTime()
  return Math.round((required - asOf.getTime()) / (1000 * 60 * 60 * 24))
}

export function linkPoToLli(
  item: LongLeadItem,
  purchaseOrders: PurchaseOrder[],
  milestones: ExpeditingMilestone[],
) {
  if (!item.poId) {
    return { po: undefined, milestones: [] as ExpeditingMilestone[] }
  }

  return {
    po: purchaseOrders.find((po) => po.id === item.poId),
    milestones: milestones.filter((milestone) => milestone.poId === item.poId),
  }
}

export function criticalLliCount(items: LongLeadItem[]): number {
  return items.filter((item) => computeLeadTimeStatus(item) === 'critical').length
}

export function totalScheduleExposureDays(items: LongLeadItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(item.scheduleImpactDays, 0), 0)
}
