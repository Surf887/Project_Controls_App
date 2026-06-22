import { describe, expect, it } from 'vitest'
import { purchaseOrders } from '../data/phases'
import { contracts, invoices } from '../data/procurementFlow'
import { invoicePipeline, reconcilePoInvoices, summarizeContracts } from './procurementReconcile'

describe('procurementReconcile', () => {
  it('flags held invoices in PO reconciliation', () => {
    const rows = reconcilePoInvoices(purchaseOrders, invoices)
    const po2014 = rows.find((row) => row.poId === 'PO-2014')

    expect(po2014?.status).toBe('held')
  })

  it('summarizes contract utilization', () => {
    const summaries = summarizeContracts(contracts)
    const rotating = summaries.find((item) => item.contract.id === 'CTR-1001')

    expect(rotating?.utilizationPct).toBe(100)
    expect(rotating?.invoiceGapUsd).toBe(9_200_000)
  })

  it('totals invoice pipeline by status', () => {
    const pipeline = invoicePipeline(invoices)

    expect(pipeline.paid).toBeGreaterThan(0)
    expect(pipeline.held).toBeGreaterThan(0)
  })
})
