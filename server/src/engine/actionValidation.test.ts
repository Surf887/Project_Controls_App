import { describe, expect, it } from 'vitest'
import { createSeedState } from '@pc/store/seedState.js'
import { validateProjectAction, ActionValidationError } from '@pc/engine/actionValidation.js'
import { applyProjectAction } from '@pc/store/projectReducer.js'
import type { ExtractedValue } from '@pc/data/projectData.js'
import { buildP6CsvImport, inspectP6Csv, sampleP6Csv } from '@pc/utils/p6CsvImport.js'

describe('validateProjectAction', () => {
  it('blocks LOCK_REPORTING_PERIOD when approved extractions are pending apply', () => {
    const state = createSeedState()
    const values = state.values.map((value) =>
      value.id === 'val-003'
        ? ({ ...value, reviewStatus: 'approved', approvalStatus: 'approved', applied: undefined } as ExtractedValue)
        : value,
    )
    const withPending = applyProjectAction(state, { type: 'SET_VALUES', payload: values })

    expect(() =>
      validateProjectAction(withPending, {
        type: 'LOCK_REPORTING_PERIOD',
        payload: { actor: 'PM', period: withPending.settings.reportingPeriod.period },
      }),
    ).toThrow(ActionValidationError)
  })

  it('blocks extraction and mapping edits after the period is locked', () => {
    const base = createSeedState()
    const state = {
      ...base,
      settings: {
        ...base.settings,
        reportingPeriod: { ...base.settings.reportingPeriod, locked: true },
      },
    }

    expect(() =>
      validateProjectAction(state, {
        type: 'SET_VALUES',
        payload: state.values,
      }),
    ).toThrow(/reporting period is locked/)
  })

  it('blocks approval when a financial extraction has no target control account', () => {
    const state = createSeedState()
    const values = state.values.map((value) =>
      value.id === 'val-003'
        ? ({
            ...value,
            category: 'forecast',
            wbs: 'DOES-NOT-EXIST',
            reviewStatus: 'approved',
            approvalStatus: 'approved',
          } as ExtractedValue)
        : value,
    )

    expect(() => validateProjectAction(state, { type: 'SET_VALUES', payload: values })).toThrow(/does not map/)
  })

  it('accepts a consistent P6 batch and rejects forged import counts', () => {
    const state = createSeedState()
    const text = sampleP6Csv()
    const imported = buildP6CsvImport(text, {
      fileName: 'p6.csv',
      dataDate: '2026-06-30',
      importedBy: 'Planner',
      knownWbs: state.wbsNodes.map((node) => node.wbs),
      columnMap: inspectP6Csv(text).suggestedMap,
      now: '2026-08-05T00:00:00.000Z',
    })

    expect(() => validateProjectAction(state, { type: 'IMPORT_SCHEDULE', payload: imported })).not.toThrow()
    expect(() =>
      validateProjectAction(state, {
        type: 'IMPORT_SCHEDULE',
        payload: {
          ...imported,
          batch: { ...imported.batch, activityCount: imported.batch.activityCount + 1 },
        },
      }),
    ).toThrow(/counts/)
  })
})
