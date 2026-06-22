import type { Role } from '../auth/rbac.js'
import { workflowById } from '@pc/data/workflowConfig.js'

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowValidationError'
  }
}

export function assertForecastWorkflowTransition(
  currentStatus: string,
  targetStatus: string,
  role: Role,
): void {
  const workflow = workflowById('forecast-approval')
  if (!workflow) {
    return
  }
  const allowed = workflow.transitions.some(
    (transition) =>
      transition.from === currentStatus &&
      transition.to === targetStatus &&
      roleRank(role) >= roleRank(transition.minRole),
  )
  if (!allowed) {
    throw new WorkflowValidationError(
      `Forecast transition ${currentStatus} → ${targetStatus} not permitted for role ${role}`,
    )
  }
}

export function assertChangeWorkflowTransition(
  currentStatus: string,
  targetStatus: string,
  role: Role,
): void {
  const workflow = workflowById('change-board')
  if (!workflow) {
    return
  }
  const allowed = workflow.transitions.some(
    (transition) =>
      transition.from === currentStatus &&
      transition.to === targetStatus &&
      roleRank(role) >= roleRank(transition.minRole),
  )
  if (!allowed) {
    throw new WorkflowValidationError(
      `Change transition ${currentStatus} → ${targetStatus} not permitted for role ${role}`,
    )
  }
}

function roleRank(role: Role): number {
  return { viewer: 1, cost_controller: 2, approver: 3, admin: 4 }[role]
}
