import { describe, expect, it } from 'vitest'
import type { ExtractedValue } from '../data/projectData'
import { resetExtractionForCorrection, sanitizeExtractedValues } from './extractionIntegrity'

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
    const next = sanitizeExtractedValues(prior, incoming)
    expect(next[0]?.applied).toBeUndefined()
    expect(next[0]?.sccs?.composite).toContain('.')
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
    const next = sanitizeExtractedValues(prior, incoming)
    expect(next[0]?.applied).toBe(true)
    expect(next[0]?.appliedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('resetExtractionForCorrection clears posting lock', () => {
    const corrected = resetExtractionForCorrection(
      makeValue({ id: 'v1', applied: true, appliedAt: '2026-06-01T00:00:00.000Z' }),
    )
    expect(corrected.applied).toBeUndefined()
    expect(corrected.reviewStatus).toBe('pending_review')
  })
})
