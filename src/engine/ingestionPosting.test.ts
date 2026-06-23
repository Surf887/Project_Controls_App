import { describe, expect, it } from 'vitest'
import type { ExtractedValue } from '../data/projectData'
import { createSeedState } from '../store/seedState'
import type { ProjectState } from '../store/types'
import {
  applyApprovedExtractions,
  reverseIngestionPosting,
  selectApplicableBatch,
} from './ingestionPosting'
import { applyValuesUpdate, resetExtractionForCorrection } from './extractionIntegrity'
import { sumCostSheetMetric, controlAccountRows } from './costAggregation'

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
    postingId: partial.postingId,
  }
}

function stateWithValues(values: ExtractedValue[]): ProjectState {
  return { ...createSeedState(), values }
}

function controlAccount(state: ProjectState, wbs: string) {
  return controlAccountRows(state.costSheetRows).find((r) => r.wbs === wbs)!
}

describe('ingestionPosting ledger', () => {
  it('reverses an active forecast posting and restores prior EAC', () => {
    const base = stateWithValues([])
    const priorEac = controlAccount(base, 'A.01').eac
    const state = stateWithValues([
      makeValue({ id: 'v1', category: 'forecast', wbs: 'A.01', normalizedValue: priorEac + 2_000_000 }),
    ])
    const { state: posted } = applyApprovedExtractions(state, 'Tester')
    expect(controlAccount(posted, 'A.01').eac).toBe(priorEac + 2_000_000)

    const reversed = reverseIngestionPosting(posted, 'v1', 'Tester')
    expect(controlAccount(reversed, 'A.01').eac).toBeCloseTo(priorEac, 2)
    expect(reversed.values.find((v) => v.id === 'v1')?.applied).toBeUndefined()
    expect(reversed.ingestionPostings?.[0]?.status).toBe('reversed')
  })

  it('does not double-count EAC when corrected and re-applied', () => {
    const base = stateWithValues([])
    const priorEac = controlAccount(base, 'A.01').eac
    const targetEac = priorEac + 3_000_000
    let state = stateWithValues([
      makeValue({ id: 'v1', category: 'forecast', wbs: 'A.01', normalizedValue: targetEac }),
    ])

    state = applyApprovedExtractions(state, 'Tester').state
    expect(controlAccount(state, 'A.01').eac).toBe(targetEac)

    const corrected = resetExtractionForCorrection(state.values[0]!)
    state = applyValuesUpdate(state, [corrected], 'Reviewer')
    expect(controlAccount(state, 'A.01').eac).toBeCloseTo(priorEac, 2)

    const reapproved = {
      ...corrected,
      reviewStatus: 'approved' as const,
      approvalStatus: 'approved' as const,
      normalizedValue: targetEac,
    }
    state = { ...state, values: [reapproved] }
    state = applyApprovedExtractions(state, 'Tester').state
    expect(controlAccount(state, 'A.01').eac).toBe(targetEac)
    expect(sumCostSheetMetric(state.costSheetRows, 'eac')).toBeCloseTo(
      sumCostSheetMetric(base.costSheetRows, 'eac') + 3_000_000,
      2,
    )
  })

  it('selectApplicableBatch keeps only the last forecast per WBS', () => {
    const values = [
      makeValue({ id: 'v1', category: 'forecast', wbs: 'A.01', normalizedValue: 1 }),
      makeValue({ id: 'v2', category: 'forecast', wbs: 'A.01', normalizedValue: 2 }),
      makeValue({ id: 'v3', category: 'change', wbs: 'U.02', normalizedValue: 100 }),
      makeValue({ id: 'v4', category: 'change', wbs: 'U.02', normalizedValue: 200 }),
    ]
    const batch = selectApplicableBatch(values)
    expect(batch.map((v) => v.id).sort()).toEqual(['v2', 'v3', 'v4'])
  })

  it('reverses posting when a financial field changes while still approved', () => {
    const base = stateWithValues([])
    const priorEac = controlAccount(base, 'A.01').eac
    let state = stateWithValues([
      makeValue({ id: 'v1', category: 'forecast', wbs: 'A.01', normalizedValue: priorEac + 1_000_000 }),
    ])
    state = applyApprovedExtractions(state, 'Tester').state

    const edited = { ...state.values[0]!, normalizedValue: priorEac + 5_000_000 }
    state = applyValuesUpdate(state, [edited], 'Cost Controller')
    expect(controlAccount(state, 'A.01').eac).toBeCloseTo(priorEac, 2)
    expect(state.values[0]?.applied).toBeUndefined()
  })
})
