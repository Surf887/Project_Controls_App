import { describe, expect, it } from 'vitest'
import { initialCostSheet } from '../data/costSheet'
import { buildSccsAssignment, resolvePbsFromWbs, resolveCorFromCbs } from '../data/sccsMappings'
import {
  enrichCostSheetRows,
  exportSccsCsv,
  resolveSccsForCostRow,
  rollupCostSheetBySccs,
} from './sccs'
import { formatCompositeCode } from '../data/sccs'

describe('ISO 19008 SCCS mapping', () => {
  it('maps process-area WBS to AAC (process and utilities PBS)', () => {
    expect(resolvePbsFromWbs('A.01')).toBe('AAC')
    expect(resolvePbsFromWbs('A.01.03')).toBe('AAC')
  })

  it('maps procurement WBS to AAC and rotating CBS to ER', () => {
    expect(resolvePbsFromWbs('P.04')).toBe('AAC')
    expect(resolveCorFromCbs('C-5000')).toBe('ER')
  })

  it('builds composite PBS.SAB.COR code', () => {
    const assignment = buildSccsAssignment({
      wbs: 'A.02',
      cbs: 'C-2200',
      phase: 'Construction',
    })
    expect(assignment.composite).toBe(formatCompositeCode('AAC', 'KD', 'HT'))
    expect(assignment.pbs).toBe('AAC')
    expect(assignment.sab).toBe('KD')
    expect(assignment.cor).toBe('HT')
  })

  it('enriches all control accounts on the cost sheet', () => {
    const enriched = enrichCostSheetRows(initialCostSheet)
    const controlAccounts = enriched.filter((row) => row.parentId === null)
    expect(controlAccounts.every((row) => row.sccs?.composite.includes('.'))).toBe(true)
    expect(controlAccounts.find((row) => row.wbs === 'P.04')?.sccs?.cor).toBe('ER')
  })

  it('rolls up EAC by SCCS composite at control-account grain', () => {
    const enriched = enrichCostSheetRows(initialCostSheet)
    const rollup = rollupCostSheetBySccs(enriched)
    expect(rollup.length).toBeGreaterThan(0)
    expect(rollup.every((line) => line.composite.split('.').length === 3)).toBe(true)
  })

  it('exports CSV with SCCS columns for benchmarking exchange', () => {
    const csv = exportSccsCsv(enrichCostSheetRows(initialCostSheet))
    expect(csv.split('\n')[0]).toContain('pbs,sab,cor,composite')
    expect(csv).toContain('AAC')
  })

  it('preserves manual SCCS assignments', () => {
    const row = initialCostSheet[0]
    const manual = resolveSccsForCostRow({
      ...row,
      sccs: { pbs: 'BA', sab: 'KE', cor: 'K', composite: 'BA.KE.K', source: 'manual' },
    })
    expect(manual.pbs).toBe('BA')
    expect(manual.source).toBe('manual')
  })
})
