import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import { projectReducer } from '../store/projectReducer'
import { buildP6CsvImport, inspectP6Csv, sampleP6Csv } from '../utils/p6CsvImport'

describe('projectReducer stability', () => {
  it('does not mutate cost sheet on HYDRATE', () => {
    const seed = createSeedState()
    const hydrated = projectReducer(seed, { type: 'HYDRATE', payload: seed })
    expect(hydrated).toBe(seed)
    expect(hydrated.costSheetRows).toBe(seed.costSheetRows)
  })

  it('returns same state reference when SET_COST_SHEET payload is unchanged', () => {
    const seed = createSeedState()
    const next = projectReducer(seed, { type: 'SET_COST_SHEET', payload: seed.costSheetRows })
    expect(next).toBe(seed)
  })

  it('does not change extraction values while the reporting period is locked', () => {
    const base = createSeedState()
    const seed = {
      ...base,
      settings: {
        ...base.settings,
        reportingPeriod: { ...base.settings.reportingPeriod, locked: true },
      },
    }
    const values = seed.values.map((value) => ({ ...value, wbs: 'B.01' }))
    const next = projectReducer(seed, { type: 'SET_VALUES', payload: values })
    expect(next).toBe(seed)
  })

  it('atomically replaces the current schedule source on import', () => {
    const seed = createSeedState()
    const text = sampleP6Csv()
    const inspection = inspectP6Csv(text)
    const imported = buildP6CsvImport(text, {
      fileName: 'p6.csv',
      dataDate: '2026-06-30',
      importedBy: 'Planner',
      knownWbs: seed.wbsNodes.map((node) => node.wbs),
      columnMap: inspection.suggestedMap,
      now: '2026-08-05T00:00:00.000Z',
    })
    const next = projectReducer(seed, { type: 'IMPORT_SCHEDULE', payload: imported })
    expect(next.scheduleActivities).toHaveLength(3)
    expect(next.scheduleRelationships).toHaveLength(2)
    expect(next.scheduleImports[0]?.status).toBe('accepted')
    expect(next.auditLog[0]?.entityType).toBe('schedule')

    const manuallyMapped = projectReducer(next, {
      type: 'UPDATE_SCHEDULE_ACTIVITY_MAPPING',
      payload: { activityId: next.scheduleActivities[0]!.id, wbs: 'A.02', actor: 'Planner' },
    })
    const refreshedImport = buildP6CsvImport(text, {
      fileName: 'p6-refresh.csv',
      dataDate: '2026-07-31',
      importedBy: 'Planner',
      knownWbs: seed.wbsNodes.map((node) => node.wbs),
      columnMap: inspection.suggestedMap,
      now: '2026-08-06T00:00:00.000Z',
    })
    const refreshed = projectReducer(manuallyMapped, {
      type: 'IMPORT_SCHEDULE',
      payload: refreshedImport,
    })
    expect(refreshed.scheduleActivities.find((activity) => activity.id === next.scheduleActivities[0]!.id)).toMatchObject({
      wbs: 'A.02',
      mappingStatus: 'manual',
    })
  })
})
