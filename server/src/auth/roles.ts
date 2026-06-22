export type Role = 'viewer' | 'cost_controller' | 'approver' | 'admin'

export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  cost_controller: 2,
  approver: 3,
  admin: 4,
}
