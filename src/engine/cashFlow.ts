import { PERIODS } from '../data/costSheet'
import type { CostRow } from '../data/costSheet'
import type { Invoice } from '../data/procurementFlow'
import type { CashFlowPoint } from '../data/intelligence'

export function buildCashFlowFromState(rows: CostRow[], invoices: Invoice[]): CashFlowPoint[] {
  const controlAccounts = rows.filter((row) => row.parentId === null)

  return PERIODS.map((period) => {
    const plannedMonthly = controlAccounts.reduce((sum, row) => {
      const periodRow = row.periods.find((entry) => entry.period === period)
      return sum + (periodRow?.forecast ?? 0)
    }, 0)

    const actualMonthly = controlAccounts.reduce((sum, row) => {
      const periodRow = row.periods.find((entry) => entry.period === period)
      return sum + (periodRow?.actual ?? 0)
    }, 0)

    const invoiceSpend = invoices
      .filter((invoice) => invoice.period === period && (invoice.status === 'paid' || invoice.status === 'approved'))
      .reduce((sum, invoice) => sum + invoice.amountUsd, 0)

    const actual = actualMonthly > 0 ? actualMonthly : invoiceSpend > 0 ? invoiceSpend : null
    const forecastMonthly = plannedMonthly > 0 ? plannedMonthly : null

    return {
      period,
      plannedMonthly,
      actualMonthly: actual,
      forecastMonthly,
    }
  })
}
