import { describe, expect, it } from 'vitest'
import { applyApprovedExtractions, isApplicable, pendingApplyCount } from './applyExtractions'
import { sumCostSheetMetric, controlAccountRows } from './costAggregation'
import { createSeedState } from '../store/seedState'
import type { ExtractedValue } from '../data/projectData'
import type { ProjectState } from '../store/types'

function makeValue(partial: Partial<ExtractedValue> & { id: string }): ExtractedValue {
  return {
    id: partial.id,
    reportId: partial.reportId ?? 'rpt-001',
    field: partial.field ?? 'Test value',
    category: partial.category ?? 'forecast',
    rawValue: partial.rawValue ?? '',
    normalizedValue: partial.normalizedValue ?? 0,
    unit: partial.unit ?? 'USD',
    period: partial.period ?? '2026-W23',
    wbs: partial.wbs ?? 'A.01',
    cbs: partial.cbs ?? 'C-1000',
    standardMapping: partial.standardMapping ?? '',
    confidence: partial.confidence ?? 0.9,
    reviewStatus: partial.reviewStatus ?? 'approved',
    approvalStatus: partial.approvalStatus ?? 'approved',
    reviewer: partial.reviewer ?? 'Tester',
    owner: partial.owner ?? 'Cost Control',
    source: partial.source ?? { document: 'd', table: 't', row: '1', column: 'c', anchor: 'a' },
    validationIssues: partial.validationIssues ?? [],
    correctionHistory: partial.correctionHistory ?? [],
    applied: partial.applied,
    appliedAt: partial.appliedAt,
  }
}

function stateWithValues(values: ExtractedValue[]): ProjectState {
  return { ...createSeedState(), values }
}

function controlAccount(state: ProjectState, wbs: string) {
  return controlAccountRows(state.costSheetRows).find((r) => r.wbs === wbs)!
}

describe('applyApprovedExtractions', () => {
  it('forecast extraction sets the owning control-account EAC and moves project EAC', () => {
    const base = stateWithValues([])
    const a01Before = controlAccount(base, 'A.01').eac
    const eacBefore = sumCostSheetMetric(base.costSheetRows, 'eac')

    const state = stateWithValues([
      makeValue({ id: 'v-fc', category: 'forecast', wbs: 'A.01', normalizedValue: a01Before + 5_000_000 }),
    ])
    const { state: next, summary } = applyApprovedExtractions(state, 'Tester')

    expect(summary.appliedCount).toBe(1)
    expect(controlAccount(next, 'A.01').eac).toBe(a01Before + 5_000_000)
    expect(sumCostSheetMetric(next.costSheetRows, 'eac')).toBeCloseTo(eacBefore + 5_000_000, 2)
    expect(summary.eacDeltaUsd).toBeCloseTo(5_000_000, 2)
    expect(next.values.find((v) => v.id === 'v-fc')?.applied).toBe(true)
  })

  it('maps a detail WBS to its owning control account by prefix', () => {
    // P.04.01 has no own row; should post to control account P.04.
    const state = stateWithValues([
      makeValue({ id: 'v-fc2', category: 'forecast', wbs: 'P.04.01', normalizedValue: 100_000_000 }),
    ])
    const { state: next, summary } = applyApprovedExtractions(state, 'Tester')
    expect(summary.lines[0]?.targetControlAccountWbs).toBe('P.04')
    expect(controlAccount(next, 'P.04').eac).toBe(100_000_000)
  })

  it('cost extraction sets commitments without moving EAC', () => {
    const base = stateWithValues([])
    const eacBefore = sumCostSheetMetric(base.costSheetRows, 'eac')
    const state = stateWithValues([
      makeValue({ id: 'v-cost', category: 'cost', wbs: 'P.04', normalizedValue: 90_000_000 }),
    ])
    const { state: next, summary } = applyApprovedExtractions(state, 'Tester')
    expect(controlAccount(next, 'P.04').commitments).toBe(90_000_000)
    expect(sumCostSheetMetric(next.costSheetRows, 'eac')).toBeCloseTo(eacBefore, 2)
    expect(summary.eacDeltaUsd).toBeCloseTo(0, 2)
    expect(summary.commitmentsDeltaUsd).not.toBe(0)
  })

  it('change extraction bumps EAC and logs a submitted change (no contingency auto-draw)', () => {
    const state = stateWithValues([
      makeValue({ id: 'v-chg', category: 'change', wbs: 'U.02', normalizedValue: 4_000_000 }),
    ])
    const before = controlAccount(state, 'U.02').eac
    const { state: next, summary } = applyApprovedExtractions(state, 'Tester')
    expect(controlAccount(next, 'U.02').eac).toBe(before + 4_000_000)
    expect(summary.changesCreated).toBe(1)
    const created = next.changes.find((c) => c.id === 'CHG-ING-v-chg')
    expect(created?.status).toBe('submitted')
    expect(created?.mechanism).toBe('forecast_change')
  })

  it('only posts reviewed+approved+postable values; others are skipped', () => {
    const state = stateWithValues([
      makeValue({ id: 'a', category: 'forecast', reviewStatus: 'pending_review' }),
      makeValue({ id: 'b', category: 'forecast', approvalStatus: 'unapproved' }),
      makeValue({ id: 'c', category: 'progress', unit: '%', normalizedValue: 70 }),
      makeValue({ id: 'd', category: 'forecast', wbs: 'A.02', normalizedValue: 70_000_000 }),
    ])
    expect(pendingApplyCount(state.values)).toBe(1)
    const { summary } = applyApprovedExtractions(state, 'Tester')
    expect(summary.appliedCount).toBe(1)
    expect(summary.lines[0]?.valueId).toBe('d')
  })

  it('is idempotent — a second apply posts nothing', () => {
    const state = stateWithValues([
      makeValue({ id: 'v1', category: 'forecast', wbs: 'A.01', normalizedValue: 90_000_000 }),
    ])
    const first = applyApprovedExtractions(state, 'Tester')
    expect(first.summary.appliedCount).toBe(1)
    const second = applyApprovedExtractions(first.state, 'Tester')
    expect(second.summary.appliedCount).toBe(0)
    expect(second.state).toBe(first.state) // unchanged reference when nothing applies
  })

  it('counts unmapped WBS codes', () => {
    const state = stateWithValues([
      makeValue({ id: 'v-x', category: 'forecast', wbs: 'ZZ.99', normalizedValue: 1 }),
    ])
    const { summary } = applyApprovedExtractions(state, 'Tester')
    expect(summary.appliedCount).toBe(0)
    expect(summary.skippedUnmappedCount).toBe(1)
  })

  it('does not flag the seeded already-applied value as applicable', () => {
    const seed = createSeedState()
    expect(seed.values.some((v) => v.id === 'val-001' && v.applied)).toBe(true)
    expect(seed.values.find((v) => v.id === 'val-001')).toBeDefined()
    expect(isApplicable(seed.values.find((v) => v.id === 'val-001')!)).toBe(false)
  })
})
