import type { PurchaseOrder } from '../data/phases'
import type { Invoice, Subcontract } from '../data/procurementFlow'
import type { CostAccrualEntry } from '../store/types'

export function subcontractAccrual(sc: Subcontract, period: string): CostAccrualEntry | null {
  const accrualUsd = Math.max(sc.earnedUsd - sc.invoicedUsd, 0)
  if (accrualUsd <= 0) {
    return null
  }

  return {
    id: `ACR-SC-${sc.id}`,
    period,
    wbs: sc.wbs,
    description: `Unbilled subcontract progress — ${sc.title}`,
    sourceType: 'subcontract',
    sourceRef: sc.number,
    basisAmountUsd: sc.earnedUsd,
    settledAmountUsd: sc.invoicedUsd,
    accrualUsd,
    status: 'reviewed',
    calculationMethod: 'Earned value minus invoiced (subcontract)',
    owner: sc.subcontractor,
    notes: `${sc.progressPct}% physical progress; invoice lag ${formatUsd(accrualUsd)}.`,
  }
}

export function purchaseOrderAccrual(po: PurchaseOrder, period: string): CostAccrualEntry | null {
  const accrualUsd = Math.max(po.committedUsd - po.invoicedUsd, 0)
  if (accrualUsd <= 0) {
    return null
  }

  return {
    id: `ACR-PO-${po.id}`,
    period,
    wbs: 'P.04',
    description: `Commitment accrual — ${po.description}`,
    sourceType: 'purchase_order',
    sourceRef: po.id,
    basisAmountUsd: po.committedUsd,
    settledAmountUsd: po.invoicedUsd,
    accrualUsd,
    status: 'reviewed',
    calculationMethod: 'PO committed minus invoiced',
    owner: po.vendor,
    notes: `PO status ${po.status}; site forecast ${po.forecastSiteDate}.`,
  }
}

export function pendingInvoiceAccrual(invoice: Invoice, period: string): CostAccrualEntry | null {
  if (invoice.status !== 'approved' && invoice.status !== 'submitted') {
    return null
  }

  return {
    id: `ACR-INV-${invoice.id}`,
    period,
    wbs: invoice.wbs,
    description: `Invoice accrual — ${invoice.description}`,
    sourceType: 'invoice_pending',
    sourceRef: invoice.number,
    basisAmountUsd: invoice.amountUsd,
    settledAmountUsd: 0,
    accrualUsd: invoice.amountUsd,
    status: invoice.status === 'approved' ? 'reviewed' : 'draft',
    calculationMethod: 'Approved/submitted invoice not yet in actuals',
    owner: invoice.vendor,
    notes: `Invoice date ${invoice.invoiceDate}.`,
  }
}

export function buildAccrualRegister(
  subcontracts: Subcontract[],
  purchaseOrders: PurchaseOrder[],
  invoices: Invoice[],
  manualEntries: CostAccrualEntry[],
  period = 'Jun-26',
): CostAccrualEntry[] {
  const generated = [
    ...subcontracts.map((sc) => subcontractAccrual(sc, period)).filter(Boolean),
    ...purchaseOrders.map((po) => purchaseOrderAccrual(po, period)).filter(Boolean),
    ...invoices.map((inv) => pendingInvoiceAccrual(inv, period)).filter(Boolean),
  ] as CostAccrualEntry[]

  const byId = new Map<string, CostAccrualEntry>()
  generated.forEach((entry) => byId.set(entry.id, entry))
  manualEntries.forEach((entry) => byId.set(entry.id, entry))

  return [...byId.values()].sort((a, b) => b.accrualUsd - a.accrualUsd)
}

export function accrualTotals(entries: CostAccrualEntry[]) {
  const open = entries.filter((entry) => entry.status !== 'posted' && entry.status !== 'reversed')
  const posted = entries.filter((entry) => entry.status === 'posted')

  return {
    totalOpen: open.reduce((sum, entry) => sum + entry.accrualUsd, 0),
    totalPosted: posted.reduce((sum, entry) => sum + entry.accrualUsd, 0),
    bySource: open.reduce<Record<CostAccrualEntry['sourceType'], number>>(
      (acc, entry) => {
        acc[entry.sourceType] = (acc[entry.sourceType] ?? 0) + entry.accrualUsd
        return acc
      },
      { subcontract: 0, purchase_order: 0, invoice_pending: 0, manual: 0, timesheet: 0 },
    ),
    byWbs: open.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.wbs] = (acc[entry.wbs] ?? 0) + entry.accrualUsd
      return acc
    }, {}),
  }
}

export function accruedCostForWbs(entries: CostAccrualEntry[], wbs: string): number {
  // Roll up the queried account and its descendants only. The previous
  // bidirectional match also pulled in ancestor accruals (entries booked on a
  // parent WBS), so a parent-level entry — e.g. the PO accruals booked to
  // 'P.04' — was attributed in full to every child, double-counting it across
  // sibling subtrees.
  return entries
    .filter((entry) => entry.wbs === wbs || entry.wbs.startsWith(`${wbs}.`))
    .filter((entry) => entry.status === 'reviewed' || entry.status === 'posted')
    .reduce((sum, entry) => sum + entry.accrualUsd, 0)
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}
