export type ProjectRole = 'viewer' | 'cost_controller' | 'approver' | 'admin'

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  cost_controller: 2,
  approver: 3,
  admin: 4,
}

export function readProjectRole(): ProjectRole {
  if (typeof localStorage === 'undefined') {
    return 'cost_controller'
  }
  const stored = localStorage.getItem('pc-role')
  if (stored === 'viewer' || stored === 'cost_controller' || stored === 'approver' || stored === 'admin') {
    return stored
  }
  return 'cost_controller'
}

export function useProjectRole() {
  const role = readProjectRole()
  return {
    role,
    canEdit: role !== 'viewer',
    canApprove: ROLE_RANK[role] >= ROLE_RANK.approver,
    isAdmin: role === 'admin',
  }
}

export function canPerformAction(actionType: string, role: ProjectRole): boolean {
  const minRoleByAction: Record<string, ProjectRole> = {
    SET_COST_SHEET: 'cost_controller',
    SUBMIT_FORECAST: 'cost_controller',
    APPROVE_FORECAST: 'approver',
    DECIDE_CHANGE: 'approver',
    LOCK_REPORTING_PERIOD: 'approver',
    UNLOCK_REPORTING_PERIOD: 'admin',
    APPROVE_CONTINGENCY_DRAW: 'approver',
    SYNC_COMMITMENTS: 'cost_controller',
  }
  const minRole = minRoleByAction[actionType] ?? 'cost_controller'
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}
