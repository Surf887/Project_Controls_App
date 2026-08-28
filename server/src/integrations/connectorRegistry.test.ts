import { afterEach, describe, expect, it } from 'vitest'
import { runSyncJob, validatePartialLoad } from './connectorRegistry.js'

const originalNodeEnv = process.env.NODE_ENV
const originalSimulationFlag = process.env.ENABLE_SIMULATED_INTEGRATIONS

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  if (originalSimulationFlag == null) delete process.env.ENABLE_SIMULATED_INTEGRATIONS
  else process.env.ENABLE_SIMULATED_INTEGRATIONS = originalSimulationFlag
})

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

  it('never returns simulated SAP success in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ENABLE_SIMULATED_INTEGRATIONS = 'true'
    const result = await runSyncJob({
      connectorId: 'sap-s4',
      domain: 'erp',
      direction: 'inbound',
    })
    expect(result.status).toBe('failed')
    expect(result.recordsProcessed).toBe(0)
    expect(result.errors.join(' ')).toMatch(/simulated sync is disabled/i)
  })
})
