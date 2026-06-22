import { describe, expect, it } from 'vitest'
import { validatePartialLoad } from './connectorRegistry.js'

describe('validatePartialLoad', () => {
  it('skips unmatched WBS without silent overwrite (EC-INT-001)', () => {
    const known = new Set(['A.01', 'A.02'])
    const result = validatePartialLoad(
      [
        { wbs: 'A.01', amount: 100 },
        { wbs: 'GHOST', amount: 50 },
      ],
      known,
    )

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.warnings.some((w) => w.includes('GHOST'))).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('rejects negative amounts', () => {
    const result = validatePartialLoad([{ wbs: 'A.01', amount: -1 }], new Set(['A.01']))
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
