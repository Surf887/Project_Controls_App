import { describe, expect, it } from 'vitest'
import { createSeedState } from '@pc/store/seedState.js'
import { extractDraftForecastDrivers } from './documentDriverService.js'

describe('document forecast-driver extraction', () => {
  it('creates review-only drivers with source evidence and WBS mapping', () => {
    const drivers = extractDraftForecastDrivers(
      {
        id: 'DOC-1',
        fileName: 'contractor-report.txt',
        uploadedAt: '2026-08-21T00:00:00.000Z',
        uploadedBy: 'Reviewer',
      },
      {
        provider: 'local',
        model: 'test',
        extractedAt: '2026-08-21T00:00:00.000Z',
        pages: [
          {
            page: 2,
            text: 'Forecast overrun for A.01 is USD 1.5 million with 70% probability.',
            confidence: 0.95,
          },
        ],
        fullText: 'Forecast overrun for A.01 is USD 1.5 million with 70% probability.',
        confidence: 0.95,
        warnings: [],
      },
      createSeedState(),
    )

    expect(drivers).toHaveLength(1)
    expect(drivers[0]).toMatchObject({
      status: 'draft',
      sourceType: 'document',
      mostLikelyUsd: 1_500_000,
      probability: 0.7,
      wbs: ['A.01'],
      evidence: { documentId: 'DOC-1', page: 2 },
    })
  })
})
