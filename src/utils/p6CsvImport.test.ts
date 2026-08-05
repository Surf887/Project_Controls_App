import { describe, expect, it } from 'vitest'
import {
  buildP6CsvImport,
  inspectP6Csv,
  sampleP6Csv,
  type P6ColumnMap,
} from './p6CsvImport'

const options = {
  fileName: 'p6-export.csv',
  dataDate: '2026-06-30',
  importedBy: 'Planner',
  knownWbs: ['A.01', 'A.02'],
  now: '2026-08-05T00:00:00.000Z',
}

describe('P6 CSV ingestion', () => {
  it('detects standard P6 columns and imports activities with relationships', () => {
    const text = sampleP6Csv()
    const inspection = inspectP6Csv(text)
    expect(inspection.missingRequiredFields).toEqual([])

    const result = buildP6CsvImport(text, {
      ...options,
      columnMap: inspection.suggestedMap,
    })

    expect(result.batch.status).toBe('accepted')
    expect(result.batch.activityCount).toBe(3)
    expect(result.batch.relationshipCount).toBe(2)
    expect(result.activities.every((activity) => activity.mappingStatus === 'mapped')).toBe(true)
    expect(result.relationships[0]).toMatchObject({
      predecessorId: 'P6:ENG-100',
      successorId: 'P6:CON-210',
      type: 'FS',
      lagDays: 0,
    })
  })

  it('accepts an unmapped source WBS with a governed warning', () => {
    const text = sampleP6Csv().replaceAll('A.02.02', 'Z.99')
    const inspection = inspectP6Csv(text)
    const result = buildP6CsvImport(text, {
      ...options,
      columnMap: inspection.suggestedMap,
    })

    expect(result.batch.status).toBe('accepted_with_warnings')
    expect(result.batch.mappedCount).toBe(1)
    expect(result.activities.filter((activity) => activity.mappingStatus === 'unmapped')).toHaveLength(2)
    expect(result.batch.issues.some((issue) => issue.field === 'wbs')).toBe(true)
  })

  it('rejects the whole batch when activity IDs are duplicated', () => {
    const text = [
      'ID,Name,WBS,BL Start,BL Finish,Start,Finish,Percent',
      'A1,First,A.01,2026-01-01,2026-02-01,2026-01-01,2026-02-01,20',
      'A1,Duplicate,A.01,2026-02-01,2026-03-01,2026-02-01,2026-03-01,0',
    ].join('\n')
    const columnMap: P6ColumnMap = {
      activityId: 'ID',
      activityName: 'Name',
      wbs: 'WBS',
      baselineStart: 'BL Start',
      baselineFinish: 'BL Finish',
      currentStart: 'Start',
      currentFinish: 'Finish',
      percentComplete: 'Percent',
    }
    const result = buildP6CsvImport(text, { ...options, columnMap })

    expect(result.batch.status).toBe('rejected')
    expect(result.activities).toEqual([])
    expect(result.batch.errorCount).toBeGreaterThan(0)
    expect(result.batch.issues.some((issue) => issue.message.includes('Duplicate'))).toBe(true)
  })
})
