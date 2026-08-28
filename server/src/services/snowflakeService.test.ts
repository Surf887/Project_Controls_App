import { describe, expect, it } from 'vitest'
import { normalizeSnowflakeRows, querySnowflakeDataset } from './snowflakeService.js'

describe('Snowflake adapter safety', () => {
  it('normalizes arbitrary Snowflake column names for dynamic mappings', () => {
    const result = normalizeSnowflakeRows([
      {
        'WBS Element': 'A.01',
        'Amount USD': 1250,
        POSTING_DATE: new Date('2026-08-01T00:00:00Z'),
      },
    ])
    expect(result.headers).toEqual(['WBS Element', 'Amount USD', 'POSTING_DATE'])
    expect(result.rows[0]).toMatchObject({
      wbselement: 'A.01',
      amountusd: '1250',
      postingdate: '2026-08-01T00:00:00.000Z',
    })
  })

  it('rejects untrusted dataset identifiers before connecting', async () => {
    await expect(
      querySnowflakeDataset({ dataset: 'DB.SCHEMA.VIEW;DROP TABLE X' }),
    ).rejects.toThrow(/Invalid Snowflake identifier/)
  })
})
