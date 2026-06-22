export type ApprovalItemType =
  | 'change'
  | 'forecast'
  | 'contingency_draw'
  | 'budget_revision'
  | 'invoice_certification'
  | 'period_close'

export interface ApprovalMatrixRule {
  id: string
  itemType: ApprovalItemType
  minAmountUsd: number
  maxAmountUsd: number | null
  approverRole: string
  approverName: string
}

export const approvalMatrix: ApprovalMatrixRule[] = [
  {
    id: 'AM-CH-1',
    itemType: 'change',
    minAmountUsd: 0,
    maxAmountUsd: 250_000,
    approverRole: 'Change Manager',
    approverName: 'Change Manager',
  },
  {
    id: 'AM-CH-2',
    itemType: 'change',
    minAmountUsd: 250_001,
    maxAmountUsd: 1_000_000,
    approverRole: 'Project Director',
    approverName: 'Project Director',
  },
  {
    id: 'AM-CH-3',
    itemType: 'change',
    minAmountUsd: 1_000_001,
    maxAmountUsd: null,
    approverRole: 'Steering Committee',
    approverName: 'Steering Committee',
  },
  {
    id: 'AM-FC-1',
    itemType: 'forecast',
    minAmountUsd: 0,
    maxAmountUsd: null,
    approverRole: 'Project Director',
    approverName: 'Project Director',
  },
  {
    id: 'AM-CN-1',
    itemType: 'contingency_draw',
    minAmountUsd: 0,
    maxAmountUsd: 500_000,
    approverRole: 'Project Controls Manager',
    approverName: 'Project Controls Manager',
  },
  {
    id: 'AM-CN-2',
    itemType: 'contingency_draw',
    minAmountUsd: 500_001,
    maxAmountUsd: null,
    approverRole: 'Project Director',
    approverName: 'Project Director',
  },
  {
    id: 'AM-IV-1',
    itemType: 'invoice_certification',
    minAmountUsd: 0,
    maxAmountUsd: null,
    approverRole: 'Contract Engineer',
    approverName: 'Contract Engineer',
  },
  {
    id: 'AM-PC-1',
    itemType: 'period_close',
    minAmountUsd: 0,
    maxAmountUsd: null,
    approverRole: 'Project Controls Manager',
    approverName: 'Project Controls Manager',
  },
]

export function resolveApprover(itemType: ApprovalItemType, amountUsd: number): ApprovalMatrixRule {
  const match =
    approvalMatrix
      .filter(
        (rule) =>
          rule.itemType === itemType &&
          amountUsd >= rule.minAmountUsd &&
          (rule.maxAmountUsd === null || amountUsd <= rule.maxAmountUsd),
      )
      .sort((left, right) => right.minAmountUsd - left.minAmountUsd)[0] ??
    approvalMatrix.find((rule) => rule.itemType === itemType)

  return (
    match ?? {
      id: 'AM-DEFAULT',
      itemType,
      minAmountUsd: 0,
      maxAmountUsd: null,
      approverRole: 'Project Director',
      approverName: 'Project Director',
    }
  )
}
