import { describe, expect, it } from 'vitest'
import { initialCostSheet } from '../data/costSheet'
import { changeRegister } from '../data/registers'
import { defaultContingencyRules } from '../store/types'
import type { ContingencyDrawEntry } from '../store/types'
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

  it('is idempotent — re-running reconcile does not duplicate or resize draws', () => {
    const first = reconcileContingencyDraws(changeRegister, [], defaultContingencyRules, initialCostSheet)
    const second = reconcileContingencyDraws(changeRegister, first, defaultContingencyRules, initialCostSheet)
    const third = reconcileContingencyDraws(changeRegister, second, defaultContingencyRules, initialCostSheet)

    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  it('preserves pending draws (including manual edits) across reconcile passes', () => {
    const first = reconcileContingencyDraws(changeRegister, [], defaultContingencyRules, initialCostSheet)
    const edited = first.map((draw) =>
      draw.changeId === 'CO-001' ? { ...draw, amountUsd: 1_000_000, approver: 'PD Override' } : draw,
    )

    const next = reconcileContingencyDraws(changeRegister, edited, defaultContingencyRules, initialCostSheet)
    const kept = next.find((draw) => draw.changeId === 'CO-001')

    expect(kept?.amountUsd).toBe(1_000_000)
    expect(kept?.approver).toBe('PD Override')
    expect(next.filter((draw) => draw.changeId === 'CO-001')).toHaveLength(1)
  })

  it('removes stale pending auto-draws when the source change is no longer approved', () => {
    const first = reconcileContingencyDraws(changeRegister, [], defaultContingencyRules, initialCostSheet)
    expect(first.some((draw) => draw.changeId === 'CO-001')).toBe(true)

    const withdrawn = changeRegister.map((change) =>
      change.id === 'CO-001' ? { ...change, status: 'withdrawn' as const } : change,
    )
    const next = reconcileContingencyDraws(withdrawn, first, defaultContingencyRules, initialCostSheet)

    expect(next.some((draw) => draw.changeId === 'CO-001')).toBe(false)
  })

  it('never recreates a draw for a change that already has one in any status', () => {
    const pending = reconcileContingencyDraws(changeRegister, [], defaultContingencyRules, initialCostSheet)
    const posted = pending.map((draw) => approveContingencyDraw(draw, 'Project Director'))

    const next = reconcileContingencyDraws(changeRegister, posted, defaultContingencyRules, initialCostSheet)
    expect(next.filter((draw) => draw.changeId === 'CO-001')).toHaveLength(1)
    expect(next.find((draw) => draw.changeId === 'CO-001')?.status).toBe('posted')
  })

  it('leaves manually created pending draws untouched', () => {
    const manual: ContingencyDrawEntry = {
      id: 'MANUAL-1',
      changeId: '',
      changeTitle: 'Manual reserve transfer',
      reserveType: 'contingency',
      amountUsd: 250_000,
      drawnAt: '2026-06-15',
      status: 'pending',
    }

    const next = reconcileContingencyDraws(changeRegister, [manual], defaultContingencyRules, initialCostSheet)
    expect(next.find((draw) => draw.id === 'MANUAL-1')).toEqual(manual)
  })
})
