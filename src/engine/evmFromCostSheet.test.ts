import { describe, expect, it } from 'vitest'
import { buildRow, CURRENT_PERIOD_INDEX, PERIODS, type CostRow } from '../data/costSheet'
import type { ProgressCreditEntry, RuleOfCreditTemplate } from '../store/types'
import {
  computeEvmWithMethod,
  costSheetToEvmAccounts,
  resolvePeriodIndex,
} from './evmFromCostSheet'

function makeControlAccount(overrides: Partial<CostRow> & { wbs: string }): CostRow {
  return buildRow({
    id: overrides.wbs,
    parentId: null,
    level: 1,
    cbs: 'CBS-1',
    description: `Account ${overrides.wbs}`,
    discipline: 'Mechanical',
    costType: 'CAPEX',
    phase: 'Construction',
    currency: 'USD',
    originalBudget: 0,
    approvedChanges: 0,
    commitments: 0,
    eac: 0,
    periods: [],
    notes: '',
    lastModifiedBy: 'test',
    lastModifiedAt: '2026-06-01',
    isExpanded: false,
    ...overrides,
  })
}

const rocTemplate: RuleOfCreditTemplate = {
  id: 'roc-1',
  name: 'Piping install',
  discipline: 'Piping',
  appliesTo: 'wbs',
  steps: [
    { id: 's1', sequence: 1, name: 'Fit-up', creditPercent: 40 },
    { id: 's2', sequence: 2, name: 'Weld-out', creditPercent: 60 },
  ],
}

describe('resolvePeriodIndex', () => {
  it('maps a known period label to its index', () => {
    expect(resolvePeriodIndex('Jan-26')).toBe(0)
    expect(resolvePeriodIndex('Sep-26')).toBe(8)
  })

  it('falls back to the calendar default for unknown or absent labels', () => {
    expect(resolvePeriodIndex(undefined)).toBe(CURRENT_PERIOD_INDEX)
    expect(resolvePeriodIndex('Nonsense-99')).toBe(CURRENT_PERIOD_INDEX)
  })
})

describe('costSheetToEvmAccounts', () => {
  it('derives PV from the reporting period instead of a hardcoded month', () => {
    const rows = [makeControlAccount({ wbs: 'A.01', originalBudget: 12_000_000 })]

    const juneAccounts = costSheetToEvmAccounts(rows, { currentPeriod: 'Jun-26' })
    expect(juneAccounts[0].pv).toBeCloseTo(12_000_000 * (6 / PERIODS.length), 6)

    const septemberAccounts = costSheetToEvmAccounts(rows, { currentPeriod: 'Sep-26' })
    expect(septemberAccounts[0].pv).toBeCloseTo(12_000_000 * (9 / PERIODS.length), 6)

    // Default matches the seed calendar's open period (Jun-26 => 50%).
    const defaultAccounts = costSheetToEvmAccounts(rows)
    expect(defaultAccounts[0].pv).toBeCloseTo(juneAccounts[0].pv, 6)
  })

  it('includes approved changes in BAC and only maps control accounts', () => {
    const control = makeControlAccount({
      wbs: 'A.01',
      originalBudget: 10_000_000,
      approvedChanges: 2_000_000,
    })
    const detail = makeControlAccount({ wbs: 'A.01.1', originalBudget: 4_000_000 })
    const detailRow = { ...detail, parentId: 'A.01', level: 2 }

    const accounts = costSheetToEvmAccounts([control, detailRow])
    expect(accounts).toHaveLength(1)
    expect(accounts[0].bac).toBe(12_000_000)
  })

  it('uses rules-of-credit earned percent when assigned to the WBS', () => {
    const rows = [makeControlAccount({ wbs: 'A.01', originalBudget: 10_000_000 })]
    const credits: ProgressCreditEntry[] = [
      { id: 'pc-1', targetType: 'wbs', targetId: 'A.01', templateId: 'roc-1', completedStepIds: ['s1'] },
    ]

    const accounts = costSheetToEvmAccounts(rows, { templates: [rocTemplate], progressCredits: credits })
    expect(accounts[0].ev).toBeCloseTo(10_000_000 * 0.4, 6)
  })

  it('caps the cost-ratio earned fallback at 95%', () => {
    const overspent = makeControlAccount({
      wbs: 'A.02',
      originalBudget: 1_000_000,
      periods: [{ period: 'Jan-26', actual: 2_000_000, forecast: 0, locked: true }],
    })

    const accounts = costSheetToEvmAccounts([overspent])
    expect(accounts[0].ev).toBeCloseTo(950_000, 6)
  })

  it('reports zero EV/PV for a zero-BAC account instead of NaN', () => {
    const rows = [makeControlAccount({ wbs: 'Z.00', originalBudget: 0 })]
    const [account] = costSheetToEvmAccounts(rows)
    expect(account.ev).toBe(0)
    expect(account.pv).toBe(0)
  })
})

describe('computeEvmWithMethod', () => {
  const account = { wbs: 'A.01', description: '', discipline: '', bac: 100, pv: 50, ev: 40, ac: 50 }

  it('computes CPI = EV/AC and SPI = EV/PV', () => {
    const result = computeEvmWithMethod(account, 'ac_plus_remaining')
    expect(result.cpi).toBeCloseTo(0.8, 6)
    expect(result.spi).toBeCloseTo(0.8, 6)
    expect(result.cv).toBe(-10)
    expect(result.sv).toBe(-10)
  })

  it('computes EAC = BAC/CPI for the bac_cpi method', () => {
    const result = computeEvmWithMethod(account, 'bac_cpi')
    expect(result.eac).toBeCloseTo(100 / 0.8, 6)
    expect(result.vac).toBeCloseTo(100 - 100 / 0.8, 6)
  })

  it('computes EAC = AC + (BAC - EV) for the ac_plus_remaining method', () => {
    const result = computeEvmWithMethod(account, 'ac_plus_remaining')
    expect(result.eac).toBe(50 + 60)
    expect(result.percentComplete).toBeCloseTo(40, 6)
  })

  it('uses the engine EAC when provided, falling back to AC + remaining', () => {
    expect(computeEvmWithMethod(account, 'engine_most_likely', 123).eac).toBe(123)
    expect(computeEvmWithMethod(account, 'engine_most_likely').eac).toBe(110)
  })

  it('guards divisions when AC or PV are zero', () => {
    const untouched = { ...account, ac: 0, pv: 0 }
    const result = computeEvmWithMethod(untouched, 'bac_cpi')
    expect(result.cpi).toBe(0)
    expect(result.spi).toBe(0)
    expect(result.eac).toBe(untouched.bac)
  })
})
