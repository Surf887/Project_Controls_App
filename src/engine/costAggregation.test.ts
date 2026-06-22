import { describe, expect, it } from 'vitest'
import { buildRow } from '../data/costSheet'
import { initialCostSheet } from '../data/costSheet'
import { changeRegister, opportunityRegister, riskRegister } from '../data/registers'
import {
  controlAccountRows,
  detectDoubleCount,
  sumBac,
  sumCostSheetMetric,
} from './costAggregation'
import { computeForecast, totalForecastSnapshot } from './forecast'
import { costSheetToEvmAccounts } from './evmFromCostSheet'

describe('costAggregation invariants', () => {
  it('defines control accounts as parentId === null', () => {
    const controls = controlAccountRows(initialCostSheet)
    expect(controls.every((row) => row.parentId === null)).toBe(true)
    expect(controls.length).toBeGreaterThan(0)
    expect(controls.length).toBeLessThan(initialCostSheet.length)
  })

  it('detects double-count inflation when summing all rows vs control accounts', () => {
    const report = detectDoubleCount(initialCostSheet, (row) => row.currentBudget)
    expect(report.detailRowCount).toBeGreaterThan(0)
    expect(report.allRowsTotal).toBeGreaterThan(report.controlAccountTotal)
    expect(report.ok).toBe(false)
  })

  it('control-account BAC matches sumCostSheetMetric', () => {
    const bac = sumBac(initialCostSheet)
    const manual = controlAccountRows(initialCostSheet).reduce(
      (sum, row) => sum + row.originalBudget + row.approvedChanges,
      0,
    )
    expect(bac).toBe(manual)
    expect(bac).toBeLessThan(
      initialCostSheet.reduce((sum, row) => sum + row.originalBudget + row.approvedChanges, 0),
    )
  })

  it('forecast project totals use control accounts only', () => {
    const snapshots = computeForecast(initialCostSheet, changeRegister, riskRegister, opportunityRegister)
    const allRowsTotal = totalForecastSnapshot(snapshots).eacMostLikely
    const controlTotal = totalForecastSnapshot(snapshots, initialCostSheet).eacMostLikely
    expect(controlTotal).toBeLessThan(allRowsTotal)
  })

  it('EVM accounts include each control account once', () => {
    const accounts = costSheetToEvmAccounts(initialCostSheet)
    const controlWbs = controlAccountRows(initialCostSheet).map((row) => row.wbs)
    expect(accounts.map((a) => a.wbs).sort()).toEqual(controlWbs.sort())
    expect(accounts.reduce((sum, a) => sum + a.bac, 0)).toBe(sumBac(initialCostSheet))
  })

  it('documents parallel budgeting under A.01 (detail rows exist alongside parent)', () => {
    const parent = initialCostSheet.find((row) => row.wbs === 'A.01')!
    const children = initialCostSheet.filter((row) => row.parentId === parent.id)
    expect(children.length).toBeGreaterThan(0)
    const childrenBudget = children.reduce((sum, row) => sum + row.originalBudget, 0)
    expect(childrenBudget).toBeGreaterThanOrEqual(parent.originalBudget)
    expect(detectDoubleCount(initialCostSheet, (row) => row.originalBudget).allRowsTotal).toBeGreaterThan(
      parent.originalBudget,
    )
  })

  it('sumCostSheetMetric never exceeds naive sum-all-rows for EAC', () => {
    const controlEac = sumCostSheetMetric(initialCostSheet, 'eac')
    const allEac = initialCostSheet.reduce((sum, row) => sum + row.eac, 0)
    expect(controlEac).toBeLessThan(allEac)
  })
})

describe('costAggregation helpers', () => {
  it('returns ok when no detail rows exist', () => {
    const lone = buildRow({
      id: 'X',
      parentId: null,
      level: 1,
      wbs: 'X',
      cbs: 'C-0000',
      description: 'Single account',
      discipline: 'Test',
      costType: 'CAPEX',
      phase: 'Engineering',
      currency: 'USD',
      originalBudget: 100,
      approvedChanges: 0,
      commitments: 0,
      eac: 100,
      periods: [],
      notes: '',
      lastModifiedBy: 'test',
      lastModifiedAt: '',
      isExpanded: false,
    })
    const report = detectDoubleCount([lone], (row) => row.currentBudget)
    expect(report.ok).toBe(true)
    expect(report.inflationPct).toBe(0)
  })
})
