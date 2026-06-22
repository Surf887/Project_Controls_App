import type { CostRow } from '../data/costSheet'
import type { CostAccrualEntry } from '../store/types'

export function openAccrualsByWbs(accruals: CostAccrualEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of accruals) {
    if (entry.status === 'posted' || entry.status === 'reversed') {
      continue
    }
    map.set(entry.wbs, (map.get(entry.wbs) ?? 0) + entry.accrualUsd)
  }
  return map
}

export function incurredForRow(row: CostRow, accruals: CostAccrualEntry[]): number {
  const openAccrual = openAccrualsByWbs(accruals).get(row.wbs) ?? 0
  return row.actualsToDate + openAccrual
}

export function projectIncurredTotals(rows: CostRow[], accruals: CostAccrualEntry[]) {
  const controlAccounts = rows.filter((row) => row.parentId === null)
  const accrualMap = openAccrualsByWbs(accruals)
  const actuals = controlAccounts.reduce((sum, row) => sum + row.actualsToDate, 0)
  const openAccruals = [...accrualMap.values()].reduce((sum, value) => sum + value, 0)
  return {
    actuals,
    openAccruals,
    incurred: actuals + openAccruals,
  }
}

export function incurredByControlAccount(rows: CostRow[], accruals: CostAccrualEntry[]) {
  return rows
    .filter((row) => row.parentId === null)
    .map((row) => ({
      wbs: row.wbs,
      actuals: row.actualsToDate,
      accruals: openAccrualsByWbs(accruals).get(row.wbs) ?? 0,
      incurred: incurredForRow(row, accruals),
    }))
}
