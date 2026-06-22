import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import { buildCostControlLogStats } from './costControlLogStats'
import { costControlLogs } from '../data/costControlLogs'

describe('buildCostControlLogStats', () => {
  it('returns all industry log types with headlines', () => {
    const stats = buildCostControlLogStats(createSeedState())
    expect(stats).toHaveLength(costControlLogs.length)
    expect(stats.every((entry) => entry.headline.length > 0)).toBe(true)
    expect(stats.map((entry) => entry.log.id)).toEqual(costControlLogs.map((log) => log.id))
  })
})
