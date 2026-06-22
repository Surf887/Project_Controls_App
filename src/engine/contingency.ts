import { buildRow, type CostRow } from '../data/costSheet'
import { resolveApprover } from '../data/approvalMatrix'
import type { ChangeItem } from '../data/registers'
import type { ContingencyDrawEntry, ContingencyDrawRule, ContingencyReserveSnapshot, ReserveType } from '../store/types'

export function isReserveCostType(costType: CostRow['costType']): boolean {
  return costType === 'Contingency' || costType === 'Management Reserve'
}

export function reserveTypeFromCostType(costType: CostRow['costType']): ReserveType | null {
  if (costType === 'Contingency') return 'contingency'
  if (costType === 'Management Reserve') return 'management_reserve'
  return null
}

export function reserveRows(rows: CostRow[]): CostRow[] {
  return rows.filter((row) => isReserveCostType(row.costType))
}

export function computeReserveSnapshots(
  rows: CostRow[],
  draws: ContingencyDrawEntry[],
): ContingencyReserveSnapshot[] {
  return reserveRows(rows).map((row) => {
    const reserveType = reserveTypeFromCostType(row.costType)!
    const posted = draws
      .filter((draw) => draw.reserveType === reserveType && draw.status === 'posted')
      .reduce((sum, draw) => sum + draw.amountUsd, 0)
    const pendingDraw = draws
      .filter(
        (draw) =>
          draw.reserveType === reserveType &&
          (draw.status === 'pending' || draw.status === 'submitted'),
      )
      .reduce((sum, draw) => sum + draw.amountUsd, 0)
    const originalBudget = row.originalBudget
    const remaining = Math.max(row.originalBudget + row.approvedChanges - pendingDraw, 0)

    return {
      reserveType,
      wbs: row.wbs,
      description: row.description,
      originalBudget,
      drawnToDate: posted,
      pendingDraw,
      remaining,
      utilizationPct: originalBudget === 0 ? 0 : (posted / originalBudget) * 100,
    }
  })
}

function pickReserveForChange(
  change: ChangeItem,
  snapshots: ContingencyReserveSnapshot[],
  rules: ContingencyDrawRule,
): ReserveType | null {
  if (change.costImpactUsd <= 0) {
    return null
  }

  if (change.costImpactUsd >= rules.requireManagementReserveForChangesOver) {
    const mr = snapshots.find((snapshot) => snapshot.reserveType === 'management_reserve')
    if (mr && mr.remaining > 0) {
      return 'management_reserve'
    }
  }

  const contingency = snapshots.find((snapshot) => snapshot.reserveType === 'contingency')
  if (contingency && contingency.remaining > 0) {
    return 'contingency'
  }

  const management = snapshots.find((snapshot) => snapshot.reserveType === 'management_reserve')
  if (management && management.remaining > 0) {
    return 'management_reserve'
  }

  return null
}

export function reconcileContingencyDraws(
  changes: ChangeItem[],
  existingDraws: ContingencyDrawEntry[],
  rules: ContingencyDrawRule,
  rows: CostRow[],
): ContingencyDrawEntry[] {
  if (!rules.autoDrawOnApprovedChange) {
    return existingDraws
  }

  const snapshots = computeReserveSnapshots(rows, existingDraws)
  const nextDraws = existingDraws.filter((draw) => draw.status !== 'pending')

  changes.forEach((change) => {
    if (change.status !== 'approved') {
      return
    }

    if (rules.drawPositiveChangesOnly && change.costImpactUsd <= 0) {
      return
    }

    const alreadyDrawn = nextDraws.some(
      (draw) => draw.changeId === change.id && draw.status === 'posted',
    )
    if (alreadyDrawn) {
      return
    }

    const reserveType = pickReserveForChange(change, snapshots, rules)
    if (!reserveType) {
      return
    }

    const snapshot = snapshots.find((item) => item.reserveType === reserveType)
    if (!snapshot) {
      return
    }

    const maxDraw = (snapshot.originalBudget * rules.maxDrawPctOfReserve) / 100 - snapshot.drawnToDate
    const drawAmount = Math.min(Math.max(change.costImpactUsd, 0), Math.max(maxDraw, 0), snapshot.remaining)
    if (drawAmount <= 0) {
      return
    }

    nextDraws.push({
      id: `CD-${change.id}`,
      changeId: change.id,
      changeTitle: change.title,
      reserveType,
      amountUsd: drawAmount,
      drawnAt: change.decisionDate ?? new Date().toISOString().slice(0, 10),
      status: 'pending',
      wbsTarget: change.affectedWbs[0],
      approver: resolveApprover('contingency_draw', drawAmount).approverName,
    })

    const reserveSnapshot = snapshots.find((item) => item.reserveType === reserveType)
    if (reserveSnapshot) {
      reserveSnapshot.drawnToDate += drawAmount
      reserveSnapshot.remaining = Math.max(reserveSnapshot.remaining - drawAmount, 0)
    }
  })

  return nextDraws
}

export function applyContingencyDrawsToCostSheet(
  rows: CostRow[],
  draws: ContingencyDrawEntry[],
): CostRow[] {
  const snapshots = computeReserveSnapshots(rows, draws)

  return rows.map((row) => {
    const reserveType = reserveTypeFromCostType(row.costType)
    if (!reserveType) {
      return row
    }

    const snapshot = snapshots.find((item) => item.reserveType === reserveType)
    if (!snapshot) {
      return row
    }

    const drawn = snapshot.drawnToDate
    const remaining = snapshot.remaining
    const eac = row.actualsToDate + remaining

    return buildRow({
      ...row,
      approvedChanges: -drawn,
      eac,
      notes: row.notes || `Reserve utilization ${snapshot.utilizationPct.toFixed(0)}%`,
    })
  })
}

export function totalContingencyExposure(draws: ContingencyDrawEntry[]) {
  const posted = draws.filter((draw) => draw.status === 'posted').reduce((sum, draw) => sum + draw.amountUsd, 0)
  const pending = draws
    .filter((draw) => draw.status === 'pending' || draw.status === 'submitted')
    .reduce((sum, draw) => sum + draw.amountUsd, 0)
  return { posted, pending, total: posted + pending }
}

export function submitContingencyDraw(draw: ContingencyDrawEntry, actor: string): ContingencyDrawEntry {
  if (draw.status !== 'pending') {
    return draw
  }
  return {
    ...draw,
    status: 'submitted',
    approver: draw.approver ?? resolveApprover('contingency_draw', draw.amountUsd).approverName,
  }
}

export function approveContingencyDraw(draw: ContingencyDrawEntry, actor: string): ContingencyDrawEntry {
  if (draw.status !== 'pending' && draw.status !== 'submitted') {
    return draw
  }
  return {
    ...draw,
    status: 'posted',
    approver: actor,
  }
}
