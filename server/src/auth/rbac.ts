import { canPerformActionType, isBlockedClientAction, minimumRoleForAction } from './actionPolicy.js'
import type { Role } from './roles.js'
import { ROLE_RANK } from './roles.js'

export type { Role } from './roles.js'

export interface AuthUser {
  id: string
  name: string
  role: Role
  email?: string
}

export const DEMO_USERS: AuthUser[] = [
  { id: 'u-viewer', name: 'Viewer', role: 'viewer' },
  { id: 'u-controller', name: 'Cost Controller', role: 'cost_controller' },
  { id: 'u-approver', name: 'Approver', role: 'approver' },
  { id: 'u-admin', name: 'Admin', role: 'admin' },
]

export function isDemoAuthEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.DEMO_AUTH === 'true'
}

/**
 * Resolve a demo user from an `x-pc-role` header value. ONLY works when
 * DEMO_AUTH is explicitly enabled (and never in production). This is the local
 * convenience path; production identity comes from real session/OIDC tokens.
 */
export function demoUserFromRole(role: string | undefined): AuthUser | null {
  if (!isDemoAuthEnabled()) return null
  if (!role) {
    return DEMO_USERS.find((u) => u.role === 'cost_controller') ?? null
  }
  return DEMO_USERS.find((u) => u.id === role || u.role === role) ?? null
}

export function hasRole(user: AuthUser | null, minimum: Role): boolean {
  if (!user) {
    return false
  }
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum]
}

export function canPerformAction(user: AuthUser | null, actionType: string): boolean {
  if (isBlockedClientAction(actionType)) {
    return false
  }
  return canPerformActionType(user?.role, actionType)
}

export { minimumRoleForAction, isBlockedClientAction, ACTION_MIN_ROLE, isKnownAction } from './actionPolicy.js'
