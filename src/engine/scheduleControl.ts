import type { CostRow } from '../data/costSheet'
import type { ScheduleActivity, ScheduleImportBatch, ScheduleRelationship } from '../data/schedule'
import { controlAccountRows } from './costAggregation'
import { findOwningControlAccount } from './applyExtractionsCore'

const DAY_MS = 24 * 60 * 60 * 1000

function timestamp(value: string): number {
  return Date.parse(`${value}T00:00:00Z`)
}

export function daysBetween(start: string, finish: string): number {
  return Math.round((timestamp(finish) - timestamp(start)) / DAY_MS)
}

function activityWeight(activity: ScheduleActivity): number {
  if (activity.plannedLaborHours > 0) return activity.plannedLaborHours
  return Math.max(daysBetween(activity.baselineStart, activity.baselineFinish) + 1, 1)
}

export function plannedActivityProgress(activity: ScheduleActivity, dataDate: string): number {
  const start = timestamp(activity.baselineStart)
  const finish = timestamp(activity.baselineFinish)
  const status = timestamp(dataDate)
  if (status < start) return 0
  if (status >= finish || finish <= start) return 100
  return ((status - start) / (finish - start)) * 100
}

function weightedProgress(
  activities: ScheduleActivity[],
  selector: (activity: ScheduleActivity) => number,
): number {
  const totalWeight = activities.reduce((sum, activity) => sum + activityWeight(activity), 0)
  if (totalWeight === 0) return 0
  return (
    activities.reduce(
      (sum, activity) => sum + activityWeight(activity) * Math.min(100, Math.max(0, selector(activity))),
      0,
    ) / totalWeight
  )
}

export function latestAcceptedScheduleImport(
  batches: ScheduleImportBatch[],
): ScheduleImportBatch | undefined {
  return batches.find((batch) => batch.status !== 'rejected')
}

export interface ScheduleSummary {
  dataDate: string | null
  activityCount: number
  relationshipCount: number
  mappedCount: number
  unmappedCount: number
  criticalCount: number
  lateCount: number
  overdueCount: number
  baselineFinish: string | null
  forecastFinish: string | null
  finishVarianceDays: number
  plannedProgress: number
  actualProgress: number
  spi: number
}

export function scheduleSummary(
  activities: ScheduleActivity[],
  relationships: ScheduleRelationship[],
  dataDate: string | null,
): ScheduleSummary {
  if (activities.length === 0 || !dataDate) {
    return {
      dataDate,
      activityCount: activities.length,
      relationshipCount: relationships.length,
      mappedCount: 0,
      unmappedCount: activities.length,
      criticalCount: 0,
      lateCount: 0,
      overdueCount: 0,
      baselineFinish: null,
      forecastFinish: null,
      finishVarianceDays: 0,
      plannedProgress: 0,
      actualProgress: 0,
      spi: 0,
    }
  }

  const baselineFinish = activities.reduce(
    (latest, activity) => (activity.baselineFinish > latest ? activity.baselineFinish : latest),
    activities[0].baselineFinish,
  )
  const forecastFinish = activities.reduce(
    (latest, activity) => (activity.currentFinish > latest ? activity.currentFinish : latest),
    activities[0].currentFinish,
  )
  const plannedProgress = weightedProgress(activities, (activity) =>
    plannedActivityProgress(activity, dataDate),
  )
  const actualProgress = weightedProgress(
    activities,
    (activity) => activity.physicalPercentComplete,
  )

  return {
    dataDate,
    activityCount: activities.length,
    relationshipCount: relationships.length,
    mappedCount: activities.filter((activity) => activity.mappingStatus !== 'unmapped').length,
    unmappedCount: activities.filter((activity) => activity.mappingStatus === 'unmapped').length,
    criticalCount: activities.filter(
      (activity) => activity.status !== 'completed' && activity.totalFloatDays <= 0,
    ).length,
    lateCount: activities.filter(
      (activity) =>
        activity.status !== 'completed' && activity.currentFinish > activity.baselineFinish,
    ).length,
    overdueCount: activities.filter(
      (activity) => activity.status !== 'completed' && activity.currentFinish < dataDate,
    ).length,
    baselineFinish,
    forecastFinish,
    finishVarianceDays: daysBetween(baselineFinish, forecastFinish),
    plannedProgress,
    actualProgress,
    spi: plannedProgress === 0 ? 0 : actualProgress / plannedProgress,
  }
}

export interface ControlAccountSchedulePerformance {
  controlAccountId: string
  wbs: string
  description: string
  activityCount: number
  criticalCount: number
  plannedProgress: number
  actualProgress: number
  bac: number
  pv: number
  ev: number
  ac: number
  spi: number
  cpi: number
  forecastFinish: string
}

export function controlAccountSchedulePerformance(
  activities: ScheduleActivity[],
  costRows: CostRow[],
  dataDate: string,
): ControlAccountSchedulePerformance[] {
  const accounts = controlAccountRows(costRows)
  const byAccount = new Map<string, ScheduleActivity[]>()

  activities.forEach((activity) => {
    const account = findOwningControlAccount(costRows, activity.wbs)
    if (!account) return
    const rows = byAccount.get(account.id) ?? []
    rows.push(activity)
    byAccount.set(account.id, rows)
  })

  return accounts.flatMap((account) => {
    const linked = byAccount.get(account.id)
    if (!linked || linked.length === 0) return []
    const plannedProgress = weightedProgress(linked, (activity) =>
      plannedActivityProgress(activity, dataDate),
    )
    const actualProgress = weightedProgress(
      linked,
      (activity) => activity.physicalPercentComplete,
    )
    const bac = account.originalBudget + account.approvedChanges
    const pv = bac * (plannedProgress / 100)
    const ev = bac * (actualProgress / 100)
    const ac = account.actualsToDate
    return [
      {
        controlAccountId: account.id,
        wbs: account.wbs,
        description: account.description,
        activityCount: linked.length,
        criticalCount: linked.filter(
          (activity) => activity.status !== 'completed' && activity.totalFloatDays <= 0,
        ).length,
        plannedProgress,
        actualProgress,
        bac,
        pv,
        ev,
        ac,
        spi: pv === 0 ? 0 : ev / pv,
        cpi: ac === 0 ? 0 : ev / ac,
        forecastFinish: linked.reduce(
          (latest, activity) => (activity.currentFinish > latest ? activity.currentFinish : latest),
          linked[0].currentFinish,
        ),
      },
    ]
  })
}

export interface ScheduleCurvePoint {
  period: string
  planned: number
  forecast: number
  actual: number | null
}

function monthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

export function buildScheduleCompletionCurve(
  activities: ScheduleActivity[],
  dataDate: string,
): ScheduleCurvePoint[] {
  if (activities.length === 0) return []
  const starts = activities.flatMap((activity) => [timestamp(activity.baselineStart), timestamp(activity.currentStart)])
  const finishes = activities.flatMap((activity) => [timestamp(activity.baselineFinish), timestamp(activity.currentFinish)])
  const start = new Date(Math.min(...starts))
  const final = new Date(Math.max(...finishes))
  const periods: Date[] = []
  let cursor = monthEnd(start)
  const end = monthEnd(final)
  while (cursor <= end && periods.length < 60) {
    periods.push(cursor)
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 2, 0))
  }

  const totalWeight = activities.reduce((sum, activity) => sum + activityWeight(activity), 0)
  const completion = (period: Date, selector: (activity: ScheduleActivity) => string | undefined) =>
    totalWeight === 0
      ? 0
      : (activities.reduce((sum, activity) => {
          const date = selector(activity)
          return date && timestamp(date) <= period.getTime() ? sum + activityWeight(activity) : sum
        }, 0) /
          totalWeight) *
        100

  return periods.map((period) => {
    const periodIso = period.toISOString().slice(0, 10)
    return {
      period: period.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      planned: completion(period, (activity) => activity.baselineFinish),
      forecast: completion(period, (activity) => activity.currentFinish),
      actual:
        periodIso <= dataDate
          ? completion(period, (activity) => activity.actualFinish)
          : null,
    }
  })
}
