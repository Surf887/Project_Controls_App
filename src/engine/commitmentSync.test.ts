import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import { syncCommitmentsToCostSheet } from './commitmentSync'

describe('syncCommitmentsToCostSheet', () => {
  it('rolls PO and subcontract values onto matching control accounts', () => {
    const state = createSeedState()
    const synced = syncCommitmentsToCostSheet(
      state.costSheetRows,
      state.purchaseOrders,
      state.contracts,
      state.subcontracts,
    )
    const procurement = synced.find((row) => row.wbs === 'P.04' && row.parentId === null)
    expect(procurement?.commitments).toBeGreaterThan(0)
  })
})
