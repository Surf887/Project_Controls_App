import { describe, expect, it } from 'vitest'
import { createSeedState } from '../store/seedState'
import { syncCommitmentsToCostSheet } from './commitmentSync'
import { buildRow } from '../data/costSheet'

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

  it('preserves contractor-reported commitments when higher than register roll-up', () => {
    const state = createSeedState()
    const rows = state.costSheetRows.map((row) =>
      row.wbs === 'P.04' && row.parentId === null
        ? buildRow({ ...row, commitments: 999_000_000 })
        : row,
    )
    const synced = syncCommitmentsToCostSheet(rows, state.purchaseOrders, state.contracts, state.subcontracts)
    const procurement = synced.find((row) => row.wbs === 'P.04' && row.parentId === null)
    expect(procurement?.commitments).toBe(999_000_000)
  })
})
