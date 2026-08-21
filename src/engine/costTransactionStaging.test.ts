import { describe, expect, it } from 'vitest'
import type { MappingProfile } from '../data/mappingProfiles'
import { createSeedState } from '../store/seedState'
import { schemaFingerprint } from './dynamicMapping'
import { buildCostTransactionBatch, postCostTransactionBatch } from './costTransactionStaging'

function profile(): MappingProfile {
  const headers = ['LINE_KEY', 'PROJ', 'WBS_NODE', 'TYPE_CD', 'POST_DT', 'VALUE_USD', 'CURR', 'PO_REF']
  const fields = [
    ['externalId', 'LINE_KEY'],
    ['projectCode', 'PROJ'],
    ['wbs', 'WBS_NODE'],
    ['recordType', 'TYPE_CD'],
    ['postingDate', 'POST_DT'],
    ['amount', 'VALUE_USD'],
    ['currency', 'CURR'],
    ['poNumber', 'PO_REF'],
  ] as const
  return {
    id: 'MAP-SF',
    name: 'Snowflake cost view',
    organization: 'Example Owner',
    sourceType: 'snowflake',
    targetDomain: 'cost_transaction',
    dataset: 'PC.CURATED.COST_VIEW',
    version: 1,
    status: 'active',
    schemaFingerprint: schemaFingerprint(headers),
    sourceHeaders: headers,
    rules: fields.map(([target, source], index) => ({
      id: `R-${index}`,
      targetField: target,
      sourceColumns: [source],
      operation: 'direct',
      transforms: ['trim'],
      valueMap: target === 'recordType' ? { ACT: 'actual', COM: 'commitment', ACR: 'accrual' } : {},
      required: !['poNumber'].includes(target),
    })),
    createdAt: '2026-08-21T00:00:00.000Z',
    createdBy: 'Steward',
    updatedAt: '2026-08-21T00:00:00.000Z',
    updatedBy: 'Steward',
  }
}

describe('Snowflake cost transaction staging', () => {
  it('maps arbitrary rows, deduplicates IDs, and identifies unmapped WBS', () => {
    const state = createSeedState()
    const result = buildCostTransactionBatch(
      {
        profile: profile(),
        headers: profile().sourceHeaders,
        rows: [
          { linekey: 'L1', proj: 'P1', wbsnode: 'A.01', typecd: 'ACT', postdt: '2026-06-15', valueusd: '1000', curr: 'USD', poref: '' },
          { linekey: 'L2', proj: 'P1', wbsnode: 'UNKNOWN', typecd: 'COM', postdt: '2026-06-15', valueusd: '500', curr: 'USD', poref: 'PO-1' },
        ],
        existingTransactions: [],
        importedBy: 'Steward',
        now: '2026-08-21T00:00:00.000Z',
      },
      state.costSheetRows,
    )
    expect(result.batch.status).toBe('staged')
    expect(result.batch.mappedCount).toBe(1)
    expect(result.transactions[1]?.mappingStatus).toBe('unmapped')
  })

  it('posts an approved batch idempotently into actuals, commitments, and accruals', () => {
    const state = createSeedState()
    const imported = buildCostTransactionBatch(
      {
        profile: profile(),
        headers: profile().sourceHeaders,
        rows: [
          { linekey: 'A1', proj: 'P1', wbsnode: 'A.01', typecd: 'ACT', postdt: '2026-06-15', valueusd: '1000', curr: 'USD', poref: '' },
          { linekey: 'C1', proj: 'P1', wbsnode: 'A.01', typecd: 'COM', postdt: '2026-06-15', valueusd: '500', curr: 'USD', poref: 'PO-1' },
          { linekey: 'R1', proj: 'P1', wbsnode: 'A.01', typecd: 'ACR', postdt: '2026-06-15', valueusd: '250', curr: 'USD', poref: '' },
        ],
        existingTransactions: [],
        importedBy: 'Steward',
        now: '2026-08-21T00:00:00.000Z',
      },
      state.costSheetRows,
    )
    const approved = {
      ...state,
      costTransactions: imported.transactions.map((transaction) => ({ ...transaction, status: 'approved' as const })),
      costTransactionBatches: [{ ...imported.batch, status: 'approved' as const }],
    }
    const before = state.costSheetRows.find((row) => row.id === 'A.01')!
    const posted = postCostTransactionBatch(approved, imported.batch.id, 'Controller')
    const after = posted.costSheetRows.find((row) => row.id === 'A.01')!
    expect(after.actualsToDate - before.actualsToDate).toBe(1000)
    expect(after.commitments - before.commitments).toBe(500)
    expect(posted.costAccruals.some((entry) => entry.id === 'ACR-SF-R1')).toBe(true)
    expect(postCostTransactionBatch(posted, imported.batch.id, 'Controller')).toBe(posted)
  })
})
