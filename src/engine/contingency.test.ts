import { describe, expect, it } from 'vitest'
import { initialCostSheet } from '../data/costSheet'
import { changeRegister } from '../data/registers'
import { defaultContingencyRules } from '../store/types'
import {
  applyContingencyDrawsToCostSheet,
  approveContingencyDraw,
  computeReserveSnapshots,
  reconcileContingencyDraws,
} from './contingency'

describe('contingency engine', () => {
  it('auto-draws approved changes above MR threshold from management reserve', () => {
    const draws = reconcileContingencyDraws(
      changeRegister,
      [],
      defaultContingencyRules,
      initialCostSheet,
    )

    const mrDraw = draws.find((draw) => draw.changeId === 'CO-001')
    expect(mrDraw).toBeDefined()
    expect(mrDraw?.reserveType).toBe('management_reserve')
    expect(mrDraw?.amountUsd).toBe(1_240_000)
    expect(mrDraw?.status).toBe('pending')
  })

  it('reduces reserve remaining after draws are approved and applied to the cost sheet', () => {
    const pendingDraws = reconcileContingencyDraws(
      changeRegister,
      [],
      defaultContingencyRules,
      initialCostSheet,
    )
    const postedDraws = pendingDraws.map((draw) => approveContingencyDraw(draw, 'Project Director'))
    const updatedRows = applyContingencyDrawsToCostSheet(initialCostSheet, postedDraws)
    const snapshots = computeReserveSnapshots(updatedRows, postedDraws)
    const mr = snapshots.find((item) => item.reserveType === 'management_reserve')

    expect(mr?.drawnToDate).toBe(1_240_000)
    expect(mr?.remaining).toBe(12_000_000 - 1_240_000)
  })
})
