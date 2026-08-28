import { describe, expect, it } from 'vitest'
import { buildWbsImport } from './wbsImport'

describe('WBS import integrity', () => {
  it('imports structure and baseline without fabricating financial actuals', () => {
    const result = buildWbsImport(
      [
        'wbs,parentWbs,description,costType,phase,discipline,originalBudget,currency',
        'A.01,,Area A,CAPEX,Engineering,Mechanical,1000,USD',
        'A.01.01,A.01,Equipment,CAPEX,Procurement,Mechanical,400,USD',
      ].join('\n'),
    )
    expect(result.error).toBeNull()
    expect(result.costRows.every((row) => row.commitments === 0)).toBe(true)
    expect(result.costRows.every((row) => row.eac === row.originalBudget)).toBe(true)
    expect(result.costRows.every((row) => row.periods.every((period) => period.actual === 0 && period.forecast === 0))).toBe(true)
  })

  it('rejects unsupported currencies instead of silently coercing them', () => {
    const result = buildWbsImport(
      'wbs,description,originalBudget,currency\nA.01,Area A,1000,EUR',
    )
    expect(result.error).toMatch(/USD only/)
    expect(result.nodes).toEqual([])
  })

  it('rejects missing parents and duplicate WBS codes', () => {
    expect(
      buildWbsImport('wbs,parentWbs,description\nA.01,MISSING,Area A').error,
    ).toMatch(/not present/)
    expect(
      buildWbsImport('wbs,description\nA.01,Area A\nA.01,Duplicate').error,
    ).toMatch(/duplicate/)
  })
})
