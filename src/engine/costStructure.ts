import type { CostRow } from '../data/costSheet'
import type { BurdenRule, CbsNode, TecCategory } from '../store/types'
import { controlAccountRows } from './costAggregation'

export function findCbsNode(nodes: CbsNode[], code: string): CbsNode | undefined {
  return nodes.find((node) => node.code === code)
}

export function directIndirectTotals(rows: CostRow[], cbsNodes: CbsNode[]) {
  let direct = 0
  let indirect = 0
  let unmapped = 0

  controlAccountRows(rows).forEach((row) => {
    const node = findCbsNode(cbsNodes, row.cbs)
    const amount = row.originalBudget + row.approvedChanges
    if (!node) {
      unmapped += amount
      return
    }

    if (node.costNature === 'direct') {
      direct += amount
    } else {
      indirect += amount
    }
  })

  return { direct, indirect, unmapped, total: direct + indirect + unmapped }
}

export function tecopBreakdown(rows: CostRow[], cbsNodes: CbsNode[]): Record<TecCategory, number> {
  const totals: Record<TecCategory, number> = {
    T: 0,
    E: 0,
    C: 0,
    O: 0,
    P: 0,
    NTR: 0,
    Owner: 0,
    Reserve: 0,
  }

  controlAccountRows(rows).forEach((row) => {
    const node = findCbsNode(cbsNodes, row.cbs)
    const amount = row.originalBudget + row.approvedChanges
    if (node) {
      totals[node.tecCategory] += amount
    }
  })

  return totals
}

export function applyBurdenToDirect(directCost: number, rules: BurdenRule[], tecCategory: TecCategory): number {
  const applicable = rules.filter((rule) => rule.appliesToTec.includes(tecCategory))
  const burdenPct = applicable.reduce((sum, rule) => sum + rule.burdenPct, 0)
  return directCost * (1 + burdenPct / 100)
}

export function rowCostMeta(row: CostRow, cbsNodes: CbsNode[]) {
  const node = findCbsNode(cbsNodes, row.cbs)
  return {
    costNature: node?.costNature ?? 'direct',
    tecCategory: node?.tecCategory ?? 'C',
    burdenPct: node?.defaultBurdenPct ?? 0,
    description: node?.description ?? row.description,
  }
}

export function enrichedRowBudget(row: CostRow, cbsNodes: CbsNode[], burdenRules: BurdenRule[]) {
  const meta = rowCostMeta(row, cbsNodes)
  const base = row.originalBudget + row.approvedChanges
  const loaded =
    meta.costNature === 'direct'
      ? applyBurdenToDirect(base, burdenRules, meta.tecCategory)
      : base

  return { ...meta, baseBudget: base, loadedBudget: loaded }
}
