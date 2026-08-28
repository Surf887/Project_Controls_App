import { describe, expect, it } from 'vitest'
import { normalizePlanviewPayload } from './planviewService.js'

describe('Planview adapter normalization', () => {
  it('flattens product-specific nested values and preserves paging', () => {
    const result = normalizePlanviewPayload({
      entities: [
        {
          SYSID: 'A1',
          Name: 'Approve gate',
          Manager: { Name: 'Project Director' },
        },
      ],
      paging: { from: 0, limit: 100, hasMore: true },
    })
    expect(result.rows[0]).toMatchObject({
      sysid: 'A1',
      name: 'Approve gate',
      managername: 'Project Director',
    })
    expect(result.nextCursor).toBe('100')
  })
})
