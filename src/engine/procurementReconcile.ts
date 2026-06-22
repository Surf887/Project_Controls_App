import type { PurchaseOrder } from '../data/phases'
import type { Contract, Invoice, Subcontract } from '../data/procurementFlow'

export interface PoReconciliation {
  poId: string
  poValueUsd: number
  committedUsd: number
  invoicedOnPo: number
  invoicedInRegister: number
  variance: number
  status: 'matched' | 'under_invoiced' | 'over_invoiced' | 'held'
}

export interface ContractSummary {
  contract: Contract
  utilizationPct: number
  invoiceGapUsd: number
  openPoCount: number
}

export function reconcilePoInvoices(
  purchaseOrders: PurchaseOrder[],
  invoices: Invoice[],
): PoReconciliation[] {
  return purchaseOrders.map((po) => {
    const registerInvoices = invoices.filter((inv) => inv.poId === po.id)
    const invoicedInRegister = registerInvoices
      .filter((inv) => inv.status === 'paid' || inv.status === 'approved')
      .reduce((sum, inv) => sum + inv.amountUsd, 0)
    const held = registerInvoices.some((inv) => inv.status === 'held')
    const variance = po.invoicedUsd - invoicedInRegister

    let status: PoReconciliation['status'] = 'matched'
    if (held) {
      status = 'held'
    } else if (variance > 1000) {
      status = 'over_invoiced'
    } else if (variance < -1000) {
      status = 'under_invoiced'
    }

    return {
      poId: po.id,
      poValueUsd: po.poValueUsd,
      committedUsd: po.committedUsd,
      invoicedOnPo: po.invoicedUsd,
      invoicedInRegister,
      variance,
      status,
    }
  })
}

export function summarizeContracts(contracts: Contract[]): ContractSummary[] {
  return contracts.map((contract) => ({
    contract,
    utilizationPct: contract.contractValueUsd === 0 ? 0 : (contract.committedUsd / contract.contractValueUsd) * 100,
    invoiceGapUsd: contract.committedUsd - contract.invoicedUsd,
    openPoCount: contract.poIds.length,
  }))
}

export function subcontractMetrics(subcontracts: Subcontract[]) {
  const totalValue = subcontracts.reduce((sum, sc) => sum + sc.contractValueUsd, 0)
  const totalEarned = subcontracts.reduce((sum, sc) => sum + sc.earnedUsd, 0)
  const totalInvoiced = subcontracts.reduce((sum, sc) => sum + sc.invoicedUsd, 0)
  const underBilled = totalEarned - totalInvoiced

  return { totalValue, totalEarned, totalInvoiced, underBilled }
}

export function invoicePipeline(invoices: Invoice[]) {
  return {
    submitted: invoices.filter((inv) => inv.status === 'submitted').reduce((s, i) => s + i.amountUsd, 0),
    approved: invoices.filter((inv) => inv.status === 'approved').reduce((s, i) => s + i.amountUsd, 0),
    paid: invoices.filter((inv) => inv.status === 'paid').reduce((s, i) => s + i.amountUsd, 0),
    held: invoices.filter((inv) => inv.status === 'held').reduce((s, i) => s + i.amountUsd, 0),
  }
}
