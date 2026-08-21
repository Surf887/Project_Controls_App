import { describe, expect, it } from 'vitest'
import type { MappingProfile } from '../data/mappingProfiles'
import { applyMappingProfile, schemaFingerprint } from './dynamicMapping'
import { buildCsvImport, parseCsvTable } from '../utils/workflow'

function profile(headers: string[]): MappingProfile {
  return {
    id: 'MAP-1',
    name: 'Company custom cost export',
    organization: 'Example EPC',
    sourceType: 'csv',
    targetDomain: 'contractor_report',
    dataset: 'Weekly cost',
    version: 1,
    status: 'active',
    schemaFingerprint: schemaFingerprint(headers),
    sourceHeaders: headers,
    rules: [
      { id: '1', targetField: 'field', sourceColumns: ['KPI_LABEL'], operation: 'direct', transforms: ['trim'], valueMap: {}, required: true },
      { id: '2', targetField: 'category', sourceColumns: ['TYPE_CODE'], operation: 'direct', transforms: ['trim', 'lowercase'], valueMap: { fct: 'forecast' }, required: true },
      { id: '3', targetField: 'rawValue', sourceColumns: ['MONEY'], operation: 'direct', transforms: ['trim'], valueMap: {}, required: true },
      { id: '4', targetField: 'normalizedValue', sourceColumns: ['MONEY'], operation: 'direct', transforms: ['trim', 'number'], valueMap: {}, required: false },
      { id: '5', targetField: 'wbs', sourceColumns: ['PROJECT_NODE'], operation: 'direct', transforms: ['trim', 'uppercase'], valueMap: {}, required: true },
      { id: '6', targetField: 'cbs', sourceColumns: ['ACCOUNT_CODE'], operation: 'direct', transforms: ['trim', 'uppercase'], valueMap: {}, required: true },
      { id: '7', targetField: 'unit', sourceColumns: [], operation: 'constant', constant: 'USD', transforms: ['trim'], valueMap: {}, required: false },
    ],
    createdAt: '2026-08-21T00:00:00.000Z',
    createdBy: 'Data steward',
    updatedAt: '2026-08-21T00:00:00.000Z',
    updatedBy: 'Data steward',
  }
}

describe('dynamic mapping profiles', () => {
  const csv = 'KPI_LABEL,TYPE_CODE,MONEY,PROJECT_NODE,ACCOUNT_CODE\nCurrent EAC,FCT,"$1,250,000",a.01,c-1000'

  it('maps arbitrary company headers and code values to canonical fields', () => {
    const table = parseCsvTable(csv)
    const result = applyMappingProfile(profile(table.headers), table.headers, table.rows)
    expect(result.issues).toEqual([])
    expect(result.rows[0]).toMatchObject({
      field: 'Current EAC',
      category: 'forecast',
      normalizedValue: '1250000',
      wbs: 'A.01',
      cbs: 'C-1000',
      unit: 'USD',
    })
  })

  it('detects schema drift without executing arbitrary expressions', () => {
    const table = parseCsvTable(csv)
    const result = applyMappingProfile(profile(table.headers), [...table.headers, 'NEW_COLUMN'], table.rows)
    expect(result.schemaChanged).toBe(true)
    expect(result.issues[0]?.field).toBe('schema')
  })

  it('applies a saved profile to contractor ingestion', () => {
    const table = parseCsvTable(csv)
    const result = buildCsvImport('custom.csv', csv, 0, profile(table.headers))
    expect(result.error).toBeNull()
    expect(result.values[0]).toMatchObject({
      field: 'Current EAC',
      category: 'forecast',
      normalizedValue: 1_250_000,
      wbs: 'A.01',
      cbs: 'C-1000',
    })
  })
})
