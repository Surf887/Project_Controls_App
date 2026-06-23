import type { CostRow } from '../data/costSheet'
import type { PurchaseOrder } from '../data/phases'
import type { Contract, Subcontract } from '../data/procurementFlow'

function wbsMatches(controlWbs: string, sourceWbs: string) {
  return sourceWbs === controlWbs || sourceWbs.startsWith(`${controlWbs}.`)
}

function commitmentForWbs(
  wbs: string,
  purchaseOrders: PurchaseOrder[],
  contracts: Contract[],
  subcontracts: Subcontract[],
) {
  let total = 0
  for (const subcontract of subcontracts) {
    if (wbsMatches(wbs, subcontract.wbs)) {
      total += subcontract.contractValueUsd
    }
  }
  for (const contract of contracts) {
    if (wbsMatches(wbs, contract.wbs)) {
      total += contract.committedUsd
    }
  }
  if (wbs === 'P.04' || wbs.startsWith('P.04.')) {
    total += purchaseOrders.reduce((sum, po) => sum + po.committedUsd, 0)
  }
  return total
}

export function syncCommitmentsToCostSheet(
  rows: CostRow[],
  purchaseOrders: PurchaseOrder[],
  contracts: Contract[],
  subcontracts: Subcontract[],
): CostRow[] {
  return rows.map((row) => {
    if (row.parentId !== null) {
      return row
    }
    const fromRegisters = commitmentForWbs(row.wbs, purchaseOrders, contracts, subcontracts)
    // Preserve contractor-reported commitments from ingestion when higher than register roll-up.
    const commitments = Math.max(fromRegisters, row.commitments)
    if (commitments === row.commitments) {
      return row
    }
    return { ...row, commitments, isDirty: true }
  })
}
