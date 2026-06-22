export type WorkflowRole = 'viewer' | 'cost_controller' | 'approver' | 'admin'

export type WorkflowEntityType = 'forecast_package' | 'change' | 'monthly_close' | 'baseline'

export interface WorkflowTransition {
  from: string
  to: string
  /** Minimum role to execute this transition */
  minRole: WorkflowRole
  /** Action type dispatched when transition occurs */
  actionType?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  entityType: WorkflowEntityType
  description: string
  /** Valid status values for this workflow */
  statuses: string[]
  transitions: WorkflowTransition[]
}

/** Enterprise workflow definitions — configurable per deployment (future: load from DB). */
export const enterpriseWorkflows: WorkflowDefinition[] = [
  {
    id: 'forecast-approval',
    name: 'Monthly forecast approval',
    entityType: 'forecast_package',
    description: 'Cost controller prepares → approver signs off monthly EAC package.',
    statuses: ['draft', 'under_review', 'approved', 'rejected'],
    transitions: [
      { from: 'draft', to: 'under_review', minRole: 'cost_controller', actionType: 'SUBMIT_FORECAST' },
      { from: 'under_review', to: 'approved', minRole: 'approver', actionType: 'APPROVE_FORECAST' },
      { from: 'under_review', to: 'rejected', minRole: 'approver', actionType: 'REJECT_FORECAST' },
      { from: 'rejected', to: 'draft', minRole: 'cost_controller' },
    ],
  },
  {
    id: 'change-board',
    name: 'Change board decision',
    entityType: 'change',
    description: 'Separate budget moves from forecast variance; board approves/rejects.',
    statuses: ['draft', 'submitted', 'under_review', 'pending', 'approved', 'rejected', 'withdrawn'],
    transitions: [
      { from: 'draft', to: 'submitted', minRole: 'cost_controller', actionType: 'SUBMIT_CHANGE' },
      { from: 'submitted', to: 'under_review', minRole: 'cost_controller' },
      { from: 'submitted', to: 'approved', minRole: 'approver', actionType: 'DECIDE_CHANGE' },
      { from: 'submitted', to: 'rejected', minRole: 'approver', actionType: 'DECIDE_CHANGE' },
      { from: 'under_review', to: 'approved', minRole: 'approver', actionType: 'DECIDE_CHANGE' },
      { from: 'under_review', to: 'rejected', minRole: 'approver', actionType: 'DECIDE_CHANGE' },
    ],
  },
  {
    id: 'monthly-close',
    name: 'Monthly control cycle',
    entityType: 'monthly_close',
    description: 'Guided close gates before forecast submission.',
    statuses: ['open', 'reconciled', 'vowd_reviewed', 'changes_cleared', 'ready_for_forecast'],
    transitions: [
      { from: 'open', to: 'reconciled', minRole: 'cost_controller' },
      { from: 'reconciled', to: 'vowd_reviewed', minRole: 'cost_controller' },
      { from: 'vowd_reviewed', to: 'changes_cleared', minRole: 'approver' },
      { from: 'changes_cleared', to: 'ready_for_forecast', minRole: 'cost_controller' },
    ],
  },
  {
    id: 'baseline-sanction',
    name: 'Baseline sanction & lock',
    entityType: 'baseline',
    description: 'Immutable baseline snapshot at sanction or major revision.',
    statuses: ['working', 'proposed', 'sanctioned', 'locked'],
    transitions: [
      { from: 'working', to: 'proposed', minRole: 'cost_controller' },
      { from: 'proposed', to: 'sanctioned', minRole: 'approver' },
      { from: 'sanctioned', to: 'locked', minRole: 'admin' },
    ],
  },
]

export function workflowById(id: string): WorkflowDefinition | undefined {
  return enterpriseWorkflows.find((workflow) => workflow.id === id)
}

export function canTransition(
  workflow: WorkflowDefinition,
  from: string,
  to: string,
  role: WorkflowRole,
): boolean {
  return workflow.transitions.some(
    (transition) => transition.from === from && transition.to === to && roleMeets(transition.minRole, role),
  )
}

function roleMeets(required: WorkflowRole, actual: WorkflowRole): boolean {
  const rank = { viewer: 1, cost_controller: 2, approver: 3, admin: 4 }
  return rank[actual] >= rank[required]
}
