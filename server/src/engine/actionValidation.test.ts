import { describe, expect, it } from 'vitest'
import { createSeedState } from '@pc/store/seedState.js'
import { validateProjectAction, ActionValidationError } from '@pc/engine/actionValidation.js'
import { applyProjectAction } from '@pc/store/projectReducer.js'
import type { ExtractedValue } from '@pc/data/projectData.js'
import { buildP6CsvImport, inspectP6Csv, sampleP6Csv } from '@pc/utils/p6CsvImport.js'
import type { ForecastDriver } from '@pc/data/forecastDrivers.js'
import { schemaFingerprint, suggestMappingRules } from '@pc/engine/dynamicMapping.js'

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

  it('requires document drivers to be reviewed before approver decisions', () => {
    const state = createSeedState()
    const driver: ForecastDriver = {
      id: 'DRV-DOC-test',
      title: 'OCR forecast',
      sourceType: 'document',
      sourceEntityId: 'DOC-test',
      linkedEntityIds: [],
      wbs: ['A.01'],
      impactDirection: 'cost',
      lowUsd: 80,
      mostLikelyUsd: 100,
      highUsd: 120,
      probability: 0.5,
      scheduleImpactDays: 0,
      treatment: 'expected_value',
      status: 'draft',
      confidence: 0.9,
      rationale: 'Draft',
      evidence: {
        documentId: 'DOC-test',
        fileName: 'forecast.txt',
        page: 1,
        excerpt: 'Forecast USD 100',
      },
      createdAt: '2026-08-21T00:00:00.000Z',
      createdBy: 'Reviewer',
    }
    const document = {
      id: 'DOC-test',
      projectId: state.meta.id,
      fileName: 'forecast.txt',
      mimeType: 'text/plain',
      sizeBytes: 16,
      sha256: 'a'.repeat(64),
      provider: 'local' as const,
      status: 'review_required' as const,
      uploadedAt: '2026-08-21T00:00:00.000Z',
      uploadedBy: 'Reviewer',
      draftDrivers: [driver],
    }
    const importAction = {
      type: 'IMPORT_DOCUMENT_DRAFTS' as const,
      payload: { document, drivers: [driver] },
    }
    expect(() => validateProjectAction(state, importAction)).not.toThrow()
    const imported = applyProjectAction(state, importAction)
    expect(() =>
      validateProjectAction(imported, {
        type: 'UPDATE_FORECAST_DRIVER',
        payload: { ...driver, status: 'approved' },
      }),
    ).toThrow(/approval action/)
    const reviewedDriver = { ...driver, status: 'in_review' as const }
    const reviewed = applyProjectAction(imported, {
      type: 'UPDATE_FORECAST_DRIVER',
      payload: reviewedDriver,
    })
    expect(() =>
      validateProjectAction(reviewed, {
        type: 'DECIDE_FORECAST_DRIVER',
        payload: { driverId: driver.id, decision: 'approved', actor: 'Approver' },
      }),
    ).not.toThrow()
  })

  it('validates active mapping profiles and sequential versions', () => {
    const state = createSeedState()
    const headers = ['field', 'category', 'rawValue', 'wbs', 'cbs']
    const profile = {
      id: 'MAP-test',
      name: 'Test mapping',
      organization: 'Test EPC',
      sourceType: 'csv' as const,
      targetDomain: 'contractor_report' as const,
      dataset: 'Weekly report',
      version: 1,
      status: 'active' as const,
      schemaFingerprint: schemaFingerprint(headers),
      sourceHeaders: headers,
      rules: suggestMappingRules(headers, 'contractor_report'),
      createdAt: '2026-08-21T00:00:00.000Z',
      createdBy: 'Steward',
      updatedAt: '2026-08-21T00:00:00.000Z',
      updatedBy: 'Steward',
    }
    expect(() =>
      validateProjectAction(state, { type: 'UPSERT_MAPPING_PROFILE', payload: profile }),
    ).not.toThrow()
    const saved = applyProjectAction(state, { type: 'UPSERT_MAPPING_PROFILE', payload: profile })
    expect(() =>
      validateProjectAction(saved, {
        type: 'UPSERT_MAPPING_PROFILE',
        payload: { ...profile, version: 1 },
      }),
    ).toThrow(/version 2/)
  })
})
