import { describe, expect, it } from 'vitest'
import { initialCostSheet } from '../data/costSheet'
import { seedProgressCredits, seedRuleOfCreditTemplates } from '../data/controlsConfig'
import { computeEarnedPercent, syncWorkFrontEarned, wbsEarnedPercent } from './rulesOfCredit'

describe('rulesOfCredit engine', () => {
  it('sums completed step credits for earned percent', () => {
    const template = seedRuleOfCreditTemplates.find((item) => item.id === 'roc-engineering-drawing')!
    const entry = seedProgressCredits.find((item) => item.id === 'pc-del-002')!

    expect(computeEarnedPercent(template, entry)).toBe(70)
  })

  it('uses quantity override when installed exceeds step credit', () => {
    const template = seedRuleOfCreditTemplates.find((item) => item.id === 'roc-construction-piping')!
    const entry = seedProgressCredits.find((item) => item.id === 'pc-wf-a01')!

    expect(computeEarnedPercent(template, entry)).toBe(45)
  })

  it('feeds WBS earned percent into EVM path', () => {
    const earned = wbsEarnedPercent('P.04', seedRuleOfCreditTemplates, seedProgressCredits)
    expect(earned).toBe(55)
  })

  it('syncs work front earned from assignment', () => {
    const workFront = {
      id: 'WF-A02',
      area: 'Test',
      discipline: 'Civil' as const,
      package: 'Foundations',
      plannedStart: '2026-01-01',
      plannedFinish: '2026-06-01',
      forecastFinish: '2026-06-01',
      earnedPercent: 0,
      plannedPercent: 50,
      manhoursPlanned: 1000,
      manhoursActual: 900,
      status: 'in_progress' as const,
      owner: 'Test',
      blockers: [],
    }

    expect(syncWorkFrontEarned(workFront, seedRuleOfCreditTemplates, seedProgressCredits)).toBe(85)
  })
})
