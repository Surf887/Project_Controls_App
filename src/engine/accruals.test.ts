import { describe, expect, it } from 'vitest'
import { purchaseOrders } from '../data/phases'
import { seedManualAccruals } from '../data/accruals'
import { invoices, subcontracts } from '../data/procurementFlow'
import type { CostAccrualEntry } from '../store/types'
import { accrualTotals, accruedCostForWbs, buildAccrualRegister, subcontractAccrual } from './accruals'

function makeEntry(overrides: Partial<CostAccrualEntry> & { id: string; wbs: string; accrualUsd: number }): CostAccrualEntry {
  return {
    period: 'Jun-26',
    description: 'Test accrual',
    sourceType: 'manual',
    sourceRef: overrides.id,
    basisAmountUsd: overrides.accrualUsd,
    settledAmountUsd: 0,
    status: 'reviewed',
    calculationMethod: 'manual',
    owner: 'Test',
    notes: '',
    ...overrides,
  }
}

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

  it('rolls up only the queried WBS and its descendants (no ancestor double-count)', () => {
    const entries = [
      makeEntry({ id: 'ACR-PARENT', wbs: 'P.04', accrualUsd: 1_000_000 }),
      makeEntry({ id: 'ACR-CHILD-1', wbs: 'P.04.01', accrualUsd: 200_000 }),
      makeEntry({ id: 'ACR-CHILD-2', wbs: 'P.04.02', accrualUsd: 300_000 }),
      makeEntry({ id: 'ACR-OTHER', wbs: 'A.01', accrualUsd: 999_999 }),
      makeEntry({ id: 'ACR-DRAFT', wbs: 'P.04.01', accrualUsd: 50_000, status: 'draft' }),
    ]

    // Parent query includes its own entry plus descendants (reviewed/posted only).
    expect(accruedCostForWbs(entries, 'P.04')).toBe(1_500_000)
    // A child must NOT inherit the parent-level entry (the old bidirectional
    // match attributed the full P.04 accrual to every child).
    expect(accruedCostForWbs(entries, 'P.04.01')).toBe(200_000)
    expect(accruedCostForWbs(entries, 'P.04.02')).toBe(300_000)
    // Prefix matching must not leak across sibling codes (P.04 vs P.040).
    expect(accruedCostForWbs(entries, 'P.0')).toBe(0)
  })
})
