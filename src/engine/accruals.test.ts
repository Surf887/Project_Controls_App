import { describe, expect, it } from 'vitest'
import { purchaseOrders } from '../data/phases'
import { seedManualAccruals } from '../data/accruals'
import { invoices, subcontracts } from '../data/procurementFlow'
import { accrualTotals, buildAccrualRegister, subcontractAccrual } from './accruals'

describe('accruals engine', () => {
  it('calculates subcontract accrual as earned minus invoiced', () => {
    const sc = subcontracts[0]
    const entry = subcontractAccrual(sc, 'Jun-26')

    expect(entry?.accrualUsd).toBe(sc.earnedUsd - sc.invoicedUsd)
  })

  it('builds a register from subcontracts, POs, invoices, and manual entries', () => {
    const register = buildAccrualRegister(subcontracts, purchaseOrders, invoices, seedManualAccruals)
    const totals = accrualTotals(register)

    expect(register.length).toBeGreaterThan(5)
    expect(totals.totalOpen).toBeGreaterThan(0)
    expect(totals.bySource.subcontract).toBeGreaterThan(0)
    expect(totals.bySource.manual + totals.bySource.timesheet).toBeGreaterThan(0)
  })
})
