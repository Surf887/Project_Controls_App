import { describe, expect, it } from 'vitest'
import type { ExtractedValue } from '../data/projectData'
import { canApproveValue } from '../utils/workflow'
import { applyManualExtractionMapping } from './manualMapping'

function value(id: string, partial: Partial<ExtractedValue> = {}): ExtractedValue {
  return {
    id,
    reportId: 'report-1',
    field: 'Forecast EAC',
    category: 'forecast',
    rawValue: '100',
    normalizedValue: 100,
    unit: 'USD',
    period: 'Jun-26',
    wbs: 'UNMAPPED-WBS',
    cbs: 'UNMAPPED-CBS',
    standardMapping: 'Pending',
    confidence: 0.9,
    reviewStatus: 'approved',
    approvalStatus: 'approved',
    reviewer: 'Reviewer',
    owner: 'Cost control',
    source: { document: 'report.csv', table: 'Sheet 1', row: '2', column: 'value', anchor: 'A2' },
    validationIssues: [{ severity: 'warning', message: 'Imported value needs WBS/CBS mapping review before approval.' }],
    correctionHistory: [],
    ...partial,
  }
}

describe('manual extraction mapping', () => {
  it('blocks approval until an imported mapping is resolved', () => {
    expect(canApproveValue(value('v1', { validationIssues: [] }))).toBe(false)
  })

  it('maps one value, resets approval, and removes the unmapped warning', () => {
    const result = applyManualExtractionMapping([value('v1')], {
      valueId: 'v1',
      targetWbs: 'A.01',
      targetCbs: 'C-1000',
      manualSccs: { pbs: 'BA', sab: 'KE', cor: 'K' },
      applyToMatching: false,
      actor: 'Cost Controller',
      at: '2026-08-05T00:00:00.000Z',
    })

    expect(result.updatedCount).toBe(1)
    expect(result.values[0]).toMatchObject({
      wbs: 'A.01',
      cbs: 'C-1000',
      reviewStatus: 'pending_review',
      approvalStatus: 'unapproved',
      reviewer: 'Cost Controller',
      sccs: { composite: 'BA.KE.K', source: 'manual' },
      validationIssues: [],
    })
    expect(result.values[0]?.correctionHistory[0]?.at).toBe('2026-08-05T00:00:00.000Z')
  })

  it('can reuse a mapping for matching rows in the same report only', () => {
    const values = [
      value('v1'),
      value('v2'),
      value('v3', { reportId: 'report-2' }),
      value('v4', { wbs: 'OTHER-WBS', cbs: 'OTHER-CBS' }),
    ]
    const result = applyManualExtractionMapping(values, {
      valueId: 'v1',
      targetWbs: 'A.02',
      targetCbs: 'C-2200',
      applyToMatching: true,
      actor: 'Cost Controller',
      at: '2026-08-05T00:00:00.000Z',
    })

    expect(result.updatedCount).toBe(2)
    expect(result.values.filter((entry) => entry.wbs === 'A.02').map((entry) => entry.id)).toEqual(['v1', 'v2'])
    expect(result.values.find((entry) => entry.id === 'v1')?.sccs?.source).toBe('mapped')
    expect(result.values.find((entry) => entry.id === 'v3')?.wbs).toBe('UNMAPPED-WBS')
  })
})
