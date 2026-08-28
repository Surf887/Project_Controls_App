import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSeedState } from '@pc/store/seedState.js'
import {
  createBaselineSnapshot,
  getBaselineSnapshot,
  listBaselineSnapshots,
  lockBaselineSnapshot,
} from './baselineService.js'

const originalBaselineDir = process.env.BASELINE_DIR

afterEach(() => {
  if (originalBaselineDir) {
    process.env.BASELINE_DIR = originalBaselineDir
  } else {
    delete process.env.BASELINE_DIR
  }
})

describe('baselineService file fallback', () => {
  it('creates, reads, lists, and locks a snapshot', async () => {
    process.env.BASELINE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-baseline-'))
    const state = createSeedState()
    const snapshot = await createBaselineSnapshot({
      projectId: state.meta.id,
      label: 'Test baseline',
      createdBy: 'Tester',
      createdById: 'u-test',
      costSheetRows: state.costSheetRows,
      wbsNodes: state.wbsNodes,
      basisOfEstimate: state.basisOfEstimate,
    })

    expect((await listBaselineSnapshots(state.meta.id)).map((entry) => entry.id)).toContain(snapshot.id)
    expect((await getBaselineSnapshot(state.meta.id, snapshot.id))?.status).toBe('sanctioned')
    expect((await lockBaselineSnapshot(state.meta.id, snapshot.id))?.status).toBe('locked')
  })
})
