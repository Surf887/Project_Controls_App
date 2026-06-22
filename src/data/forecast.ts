// Forecast engine — change-order-aware, classified by CapEx / OpEx / Contingency / Owner cost.
// All math is deterministic (rules-based) to remain auditable.

import { changeRegister, type ChangeItem, type CostClass } from './registers'

export interface ForecastBaseline {
  costClass: CostClass
  wbs: string
  description: string
  bacUsd: number
  committedUsd: number
  actualToDateUsd: number
  remainingForecastUsd: number
}

export const forecastBaseline: ForecastBaseline[] = [
  { costClass: 'CapEx', wbs: 'A.01.03', description: 'Mechanical - Process Area A', bacUsd: 84_000_000, committedUsd: 62_000_000, actualToDateUsd: 51_500_000, remainingForecastUsd: 34_500_000 },
  { costClass: 'CapEx', wbs: 'A.02.01', description: 'Piping - Process Area A', bacUsd: 61_000_000, committedUsd: 41_000_000, actualToDateUsd: 34_200_000, remainingForecastUsd: 28_500_000 },
  { costClass: 'CapEx', wbs: 'P.04.01', description: 'Procurement - Rotating equipment', bacUsd: 96_000_000, committedUsd: 89_000_000, actualToDateUsd: 71_500_000, remainingForecastUsd: 26_500_000 },
  { costClass: 'CapEx', wbs: 'U.02.00', description: 'Utilities & offsites', bacUsd: 48_000_000, committedUsd: 22_000_000, actualToDateUsd: 22_800_000, remainingForecastUsd: 26_200_000 },
  { costClass: 'CapEx', wbs: 'E.05.00', description: 'Electrical & I&C', bacUsd: 38_000_000, committedUsd: 18_000_000, actualToDateUsd: 12_400_000, remainingForecastUsd: 26_500_000 },
  { costClass: 'OpEx', wbs: 'O.99.10', description: 'Operations readiness & training', bacUsd: 6_000_000, committedUsd: 1_200_000, actualToDateUsd: 720_000, remainingForecastUsd: 4_800_000 },
  { costClass: 'OpEx', wbs: 'O.99.20', description: 'First-fill, consumables', bacUsd: 3_400_000, committedUsd: 400_000, actualToDateUsd: 220_000, remainingForecastUsd: 3_200_000 },
  { costClass: 'Owner Cost', wbs: 'OW.10.00', description: 'Owner team & project management', bacUsd: 14_500_000, committedUsd: 14_500_000, actualToDateUsd: 9_800_000, remainingForecastUsd: 4_700_000 },
  { costClass: 'Contingency', wbs: 'CN.00.00', description: 'Project contingency', bacUsd: 22_000_000, committedUsd: 0, actualToDateUsd: 0, remainingForecastUsd: 22_000_000 },
]

export interface ChangeIncludeMatrix {
  approved: boolean
  pending: boolean
  underReview: boolean
  submitted: boolean
  rejected: boolean
}

export const defaultChangeMatrix: ChangeIncludeMatrix = {
  approved: true,
  pending: true,
  underReview: false,
  submitted: false,
  rejected: false,
}

export interface WhatIfDrivers {
  productivityDeltaPct: number     // +/- % change to remaining cost (labour-driven)
  scheduleSlipMonths: number       // months of schedule slip; drives time-related cost burn
  scopeChangePct: number           // +/- % to remaining CapEx scope (driven by potential scope)
  fxImpactPct: number              // +/- % FX exposure on remaining commitments
  contingencyDrawPct: number       // 0-100 % of contingency drawn into forecast
}

export const defaultWhatIfDrivers: WhatIfDrivers = {
  productivityDeltaPct: 0,
  scheduleSlipMonths: 0,
  scopeChangePct: 0,
  fxImpactPct: 0,
  contingencyDrawPct: 0,
}

export interface ForecastBreakdown {
  costClass: CostClass
  bac: number
  actualToDate: number
  committed: number
  remainingBaseline: number
  changesIncluded: number
  whatIfDelta: number
  forecastTotal: number
  rows: ForecastRow[]
}

export interface ForecastRow {
  wbs: string
  description: string
  costClass: CostClass
  bac: number
  committed: number
  actualToDate: number
  remainingBaseline: number
  changesIncluded: number
  whatIfDelta: number
  forecastTotal: number
}

// Time-related cost burn assumption (USD per month of slip) by cost class.
const timeRelatedBurn: Record<CostClass, number> = {
  CapEx: 1_800_000,      // owner-side site indirects, contractor preliminaries
  OpEx: 240_000,
  'Owner Cost': 950_000,
  Contingency: 0,
  Other: 120_000,
}

export function changeClassMatches(change: ChangeItem, matrix: ChangeIncludeMatrix): boolean {
  switch (change.status) {
    case 'approved':
      return matrix.approved
    case 'pending':
      return matrix.pending
    case 'under_review':
      return matrix.underReview
    case 'submitted':
      return matrix.submitted
    case 'rejected':
      return matrix.rejected
    default:
      return false
  }
}

export function changeImpactByClass(matrix: ChangeIncludeMatrix): Record<CostClass, number> {
  const initial: Record<CostClass, number> = {
    CapEx: 0,
    OpEx: 0,
    Contingency: 0,
    'Owner Cost': 0,
    Other: 0,
  }

  return changeRegister.reduce((acc, change) => {
    if (changeClassMatches(change, matrix)) {
      acc[change.costClass] = (acc[change.costClass] ?? 0) + change.costImpactUsd
    }
    return acc
  }, initial)
}

export function buildForecast(matrix: ChangeIncludeMatrix, drivers: WhatIfDrivers): ForecastBreakdown[] {
  const changeImpact = changeImpactByClass(matrix)

  const grouped = new Map<CostClass, ForecastRow[]>()
  forecastBaseline.forEach((row) => {
    const productivityDelta = (row.remainingForecastUsd * drivers.productivityDeltaPct) / 100
    const scopeDelta = row.costClass === 'CapEx' ? (row.remainingForecastUsd * drivers.scopeChangePct) / 100 : 0
    const fxDelta = row.costClass === 'CapEx' ? (row.committedUsd * drivers.fxImpactPct) / 100 : 0
    const timeDelta = (timeRelatedBurn[row.costClass] ?? 0) * drivers.scheduleSlipMonths

    // Allocate change impact pro-rata within cost class (sum applied at class level later)
    const classImpactPerRow = 0

    const whatIfDelta = productivityDelta + scopeDelta + fxDelta + timeDelta + classImpactPerRow
    const forecastTotal = row.actualToDateUsd + row.remainingForecastUsd + whatIfDelta

    if (!grouped.has(row.costClass)) {
      grouped.set(row.costClass, [])
    }

    grouped.get(row.costClass)!.push({
      wbs: row.wbs,
      description: row.description,
      costClass: row.costClass,
      bac: row.bacUsd,
      committed: row.committedUsd,
      actualToDate: row.actualToDateUsd,
      remainingBaseline: row.remainingForecastUsd,
      changesIncluded: 0,
      whatIfDelta,
      forecastTotal,
    })
  })

  const breakdowns: ForecastBreakdown[] = []
  grouped.forEach((rows, costClass) => {
    const changeAmount = changeImpact[costClass] ?? 0

    // Distribute change impact pro-rata across rows by remaining baseline.
    const totalRemaining = rows.reduce((sum, r) => sum + Math.max(r.remainingBaseline, 1), 0)
    rows.forEach((row) => {
      const share = Math.max(row.remainingBaseline, 1) / totalRemaining
      row.changesIncluded = changeAmount * share
      row.forecastTotal += row.changesIncluded
    })

    const bac = rows.reduce((s, r) => s + r.bac, 0)
    const actualToDate = rows.reduce((s, r) => s + r.actualToDate, 0)
    const committed = rows.reduce((s, r) => s + r.committed, 0)
    const remainingBaseline = rows.reduce((s, r) => s + r.remainingBaseline, 0)
    const whatIfDelta = rows.reduce((s, r) => s + r.whatIfDelta, 0)
    const forecastTotal = rows.reduce((s, r) => s + r.forecastTotal, 0)

    // Apply contingency draw at the Contingency class level (separate effect).
    let appliedChanges = changeAmount
    let appliedForecast = forecastTotal

    if (costClass === 'Contingency') {
      const draw = (drivers.contingencyDrawPct / 100) * remainingBaseline
      // Drawing contingency reduces the forecast (it's already in baseline as a reserve).
      appliedForecast = forecastTotal - draw
      appliedChanges -= draw
      rows[0].whatIfDelta -= draw
      rows[0].forecastTotal -= draw
    }

    breakdowns.push({
      costClass,
      bac,
      actualToDate,
      committed,
      remainingBaseline,
      changesIncluded: appliedChanges,
      whatIfDelta,
      forecastTotal: appliedForecast,
      rows,
    })
  })

  return breakdowns.sort((a, b) => costClassOrder(a.costClass) - costClassOrder(b.costClass))
}

function costClassOrder(c: CostClass): number {
  switch (c) {
    case 'CapEx': return 1
    case 'OpEx': return 2
    case 'Owner Cost': return 3
    case 'Contingency': return 4
    case 'Other': return 5
  }
}

export function totalForecast(breakdowns: ForecastBreakdown[]): {
  bac: number
  forecast: number
  changes: number
  whatIfDelta: number
} {
  return breakdowns.reduce(
    (acc, b) => ({
      bac: acc.bac + b.bac,
      forecast: acc.forecast + b.forecastTotal,
      changes: acc.changes + b.changesIncluded,
      whatIfDelta: acc.whatIfDelta + b.whatIfDelta,
    }),
    { bac: 0, forecast: 0, changes: 0, whatIfDelta: 0 },
  )
}

export function changeStatusBreakdown(): Array<{ status: string; count: number; impact: number }> {
  const groups = new Map<string, { count: number; impact: number }>()
  changeRegister.forEach((c) => {
    const cur = groups.get(c.status) ?? { count: 0, impact: 0 }
    cur.count += 1
    cur.impact += c.costImpactUsd
    groups.set(c.status, cur)
  })

  return Array.from(groups.entries()).map(([status, value]) => ({
    status,
    count: value.count,
    impact: value.impact,
  }))
}
