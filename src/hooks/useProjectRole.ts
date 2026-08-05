import { useProjectStore } from '../store/projectStore'

export type ProjectRole = 'viewer' | 'cost_controller' | 'approver' | 'admin'

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  cost_controller: 2,
  approver: 3,
  admin: 4,
}

/** Narrow an arbitrary role string from the session to a known ProjectRole. */
function normalizeRole(role: string | undefined | null): ProjectRole {
  if (role === 'viewer' || role === 'cost_controller' || role === 'approver' || role === 'admin') {
    return role
  }
  // Unknown/absent role -> least-privileged default.
  return 'viewer'
}

/**
 * Derive the active role from the *verified* auth session (currentUser) held in
 * the project store, NOT from a writable `localStorage['pc-role']` key. The
 * server role is set only by the real/demo auth flows in api/client.ts
 * (loginWithPassword / loginWithOidc / signIn -> persistSession), so a user can
 * no longer escalate by editing localStorage in devtools.
 *
 * Defense-in-depth only: the server remains the authoritative enforcement point.
 */
export function useProjectRole() {
  const { currentUser } = useProjectStore()
  const role = normalizeRole(currentUser?.role)
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
    IMPORT_SCHEDULE: 'cost_controller',
    UPDATE_SCHEDULE_ACTIVITY_MAPPING: 'cost_controller',
  }
  const minRole = minRoleByAction[actionType] ?? 'cost_controller'
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}
