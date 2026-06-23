import { describe, expect, it } from 'vitest'
import type { ExtractedValue } from '../data/projectData'
import { createSeedState } from '../store/seedState'
import { applyApprovedExtractions } from './applyExtractions'
import { resetExtractionForCorrection, sanitizeExtractedValues, applyValuesUpdate } from './extractionIntegrity'
import { controlAccountRows } from './costAggregation'

function makeValue(partial: Partial<ExtractedValue> & { id: string }): ExtractedValue {
  return {
    id: partial.id,
    reportId: partial.reportId ?? 'rpt-001',
    field: partial.field ?? 'Test',
    category: partial.category ?? 'forecast',
    rawValue: partial.rawValue ?? '',
    normalizedValue: partial.normalizedValue ?? 100,
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
    sccs: partial.sccs,
  }
}

describe('extractionIntegrity', () => {
  it('clears applied flag when a posted value is no longer fully approved', () => {
    const prior = [
      makeValue({
        id: 'v1',
        applied: true,
        appliedAt: '2026-06-01T00:00:00.000Z',
      }),
    ]
    const incoming = [
      makeValue({
        id: 'v1',
        reviewStatus: 'pending_review',
        approvalStatus: 'unapproved',
        applied: true,
      }),
    ]
    const { values, reverseValueIds } = sanitizeExtractedValues(prior, incoming)
    expect(values[0]?.applied).toBeUndefined()
    expect(reverseValueIds).toEqual(['v1'])
    expect(values[0]?.sccs?.composite).toContain('.')
  })

  it('prevents clearing applied via SET_VALUES while still approved', () => {
    const prior = [
      makeValue({
        id: 'v1',
        applied: true,
        appliedAt: '2026-06-01T00:00:00.000Z',
      }),
    ]
    const incoming = [makeValue({ id: 'v1', applied: undefined })]
    const { values, reverseValueIds } = sanitizeExtractedValues(prior, incoming)
    expect(values[0]?.applied).toBe(true)
    expect(values[0]?.appliedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(reverseValueIds).toEqual([])
  })

  it('resetExtractionForCorrection clears posting lock', () => {
    const corrected = resetExtractionForCorrection(
      makeValue({ id: 'v1', applied: true, appliedAt: '2026-06-01T00:00:00.000Z' }),
    )
    expect(corrected.applied).toBeUndefined()
    expect(corrected.reviewStatus).toBe('pending_review')
  })

  it('applyValuesUpdate reverses cost sheet when correction is dispatched', () => {
    const base = createSeedState()
    const account = controlAccountRows(base.costSheetRows).find((r) => r.wbs === 'A.01')!
    const value = makeValue({
      id: 'v-test',
      category: 'forecast',
      wbs: 'A.01',
      normalizedValue: account.eac + 500_000,
    })
    let state = { ...base, values: [value] }
    state = applyApprovedExtractions(state, 'Tester').state
    const postedEac = controlAccountRows(state.costSheetRows).find((r) => r.wbs === 'A.01')!.eac
    expect(postedEac).toBe(account.eac + 500_000)

    state = applyValuesUpdate(state, [resetExtractionForCorrection(state.values[0]!)], 'Reviewer')
    const restored = controlAccountRows(state.costSheetRows).find((r) => r.wbs === 'A.01')!.eac
    expect(restored).toBeCloseTo(account.eac, 2)
  })
})
