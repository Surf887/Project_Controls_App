import { describe, expect, it } from 'vitest'
import { buildP6XerImport, inspectP6Xer, sampleP6Xer } from './p6XerImport'

describe('P6 XER ingestion', () => {
  it('parses activities, WBS hierarchy, relationships, and data date', () => {
    const text = sampleP6Xer()
    const inspection = inspectP6Xer(text)
    expect(inspection.activityCount).toBe(2)
    expect(inspection.relationshipCount).toBe(1)
    expect(inspection.projectDataDate).toBe('2026-06-30')

    const result = buildP6XerImport(text, {
      fileName: 'schedule.xer',
      importedBy: 'Planner',
      knownWbs: ['A.01', 'A.02'],
      now: '2026-08-21T00:00:00.000Z',
    })
    expect(result.batch.status).toBe('accepted')
    expect(result.batch.sourceSystem).toBe('p6_xer')
    expect(result.activities.map((activity) => activity.sourceWbs)).toEqual(['A.01', 'A.02'])
    expect(result.activities[1]).toMatchObject({
      sourceActivityId: 'CON-210',
      totalFloatDays: -4,
      remainingDurationDays: 72,
      physicalPercentComplete: 58,
    })
    expect(result.relationships[0]).toMatchObject({
      predecessorId: 'P6:ENG-100',
      successorId: 'P6:CON-210',
      type: 'FS',
    })
  })

  it('retains unmapped activities as governed warnings', () => {
    const result = buildP6XerImport(sampleP6Xer(), {
      fileName: 'schedule.xer',
      importedBy: 'Planner',
      knownWbs: ['Z.01'],
      now: '2026-08-21T00:00:00.000Z',
    })
    expect(result.batch.status).toBe('accepted_with_warnings')
    expect(result.batch.mappedCount).toBe(0)
    expect(result.activities.every((activity) => activity.mappingStatus === 'unmapped')).toBe(true)
  })

  it('rejects XER without activities instead of partially importing', () => {
    const result = buildP6XerImport('%T\tPROJECT\n%F\tproj_id\n%R\t1\n%E', {
      fileName: 'empty.xer',
      importedBy: 'Planner',
      knownWbs: [],
      dataDate: '2026-06-30',
      now: '2026-08-21T00:00:00.000Z',
    })
    expect(result.batch.status).toBe('rejected')
    expect(result.activities).toEqual([])
    expect(result.batch.errorCount).toBeGreaterThan(0)
  })
})
