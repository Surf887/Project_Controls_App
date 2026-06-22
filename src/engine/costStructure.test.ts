import { describe, expect, it } from 'vitest'
import { initialCostSheet } from '../data/costSheet'
import { seedBurdenRules, seedCbsNodes } from '../data/controlsConfig'
import { directIndirectTotals, enrichedRowBudget, tecopBreakdown } from './costStructure'

describe('costStructure engine', () => {
  it('splits direct and indirect from CBS mapping', () => {
    const totals = directIndirectTotals(initialCostSheet, seedCbsNodes)

    expect(totals.direct).toBeGreaterThan(0)
    expect(totals.indirect).toBeGreaterThan(0)
    expect(totals.total).toBeGreaterThan(totals.direct)
  })

  it('builds TECOP category totals', () => {
    const tecop = tecopBreakdown(initialCostSheet, seedCbsNodes)

    expect(tecop.P).toBeGreaterThan(0)
    expect(tecop.Reserve).toBeGreaterThan(0)
  })

  it('applies burden rules to direct control accounts', () => {
    const row = initialCostSheet.find((item) => item.wbs === 'P.04')!
    const enriched = enrichedRowBudget(row, seedCbsNodes, seedBurdenRules)

    expect(enriched.loadedBudget).toBeGreaterThan(enriched.baseBudget)
  })
})
