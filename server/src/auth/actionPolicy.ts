import type { Role } from './roles.js'



/** Actions that must never be dispatched from the client API. */

export const BLOCKED_CLIENT_ACTIONS = new Set([

  'ADD_AUDIT',

  'HYDRATE',

  'RESET',

])



/** Minimum role per ProjectAction type — single source of truth for RBAC. */

export const ACTION_MIN_ROLE = {

  SET_META: 'admin',

  SET_SETTINGS: 'admin',

  SET_BASIS_OF_ESTIMATE: 'cost_controller',

  SET_WBS_NODES: 'cost_controller',

  SET_COST_SHEET: 'cost_controller',

  SET_DELIVERABLES: 'cost_controller',

  SET_CHANGES: 'cost_controller',

  SET_RISKS: 'cost_controller',

  SET_OPPORTUNITIES: 'cost_controller',

  SET_ISSUES: 'cost_controller',

  SET_ACTIONS: 'cost_controller',

  SET_DECISIONS: 'cost_controller',

  SET_LESSONS: 'cost_controller',

  SET_CLAIMS: 'cost_controller',

  SET_VENDORS: 'admin',

  SET_PURCHASE_ORDERS: 'cost_controller',

  SET_CONTRACTS: 'cost_controller',

  SET_RFQ_BIDS: 'cost_controller',

  SET_INVOICES: 'cost_controller',

  SET_SUBCONTRACTS: 'cost_controller',

  SET_FIELD_DAILY_REPORTS: 'cost_controller',

  SET_FIELD_OBSERVATIONS: 'cost_controller',

  SET_TURNOVER_CHECKLISTS: 'cost_controller',

  SET_WORK_FRONTS: 'cost_controller',

  SET_PUNCH_LIST: 'cost_controller',

  SET_CONTINGENCY_DRAWS: 'cost_controller',

  SET_CONTINGENCY_RULES: 'cost_controller',

  SET_FX_RATES: 'cost_controller',

  SET_FX_SETTINGS: 'cost_controller',

  SET_CONNECTORS: 'admin',

  UPDATE_CONNECTOR: 'admin',

  ADD_SYNC_JOB: 'admin',

  SET_RULE_OF_CREDIT_TEMPLATES: 'cost_controller',

  SET_PROGRESS_CREDITS: 'cost_controller',

  UPDATE_PROGRESS_CREDIT: 'cost_controller',

  SET_LONG_LEAD_ITEMS: 'cost_controller',

  SET_CBS_NODES: 'cost_controller',

  SET_BURDEN_RULES: 'cost_controller',

  SET_COST_ACCRUALS: 'cost_controller',

  UPDATE_COST_ACCRUAL: 'cost_controller',

  RECONCILE_ACCRUALS: 'cost_controller',

  SET_FORECAST_APPROVALS: 'admin',

  UPDATE_FORECAST_APPROVAL: 'cost_controller',

  SUBMIT_FORECAST: 'cost_controller',

  APPROVE_FORECAST: 'approver',

  REJECT_FORECAST: 'approver',

  CREATE_CHANGE: 'cost_controller',

  SUBMIT_CHANGE: 'cost_controller',

  DECIDE_CHANGE: 'approver',

  ADD_GENERATED_REPORT: 'cost_controller',

  SYNC_PORTFOLIO: 'cost_controller',

  RECONCILE_CONTINGENCY: 'cost_controller',

  SYNC_COMMITMENTS: 'cost_controller',

  LOCK_REPORTING_PERIOD: 'approver',

  UNLOCK_REPORTING_PERIOD: 'admin',

  SUBMIT_CONTINGENCY_DRAW: 'cost_controller',

  APPROVE_CONTINGENCY_DRAW: 'approver',

  SET_REPORTS: 'cost_controller',

  SET_VALUES: 'cost_controller',

  SET_SELECTED_VALUE: 'viewer',

  IMPORT_SCHEDULE: 'cost_controller',

  UPDATE_SCHEDULE_ACTIVITY_MAPPING: 'cost_controller',

  IMPORT_DOCUMENT_DRAFTS: 'cost_controller',

  UPDATE_FORECAST_DRIVER: 'cost_controller',

  DECIDE_FORECAST_DRIVER: 'approver',

  APPLY_APPROVED_EXTRACTIONS: 'cost_controller',

} as const satisfies Record<string, Role>



export type KnownActionType = keyof typeof ACTION_MIN_ROLE



export function isKnownAction(actionType: string): actionType is KnownActionType {

  return actionType in ACTION_MIN_ROLE

}



export function minimumRoleForAction(actionType: string): Role | null {

  if (!isKnownAction(actionType)) {

    return null

  }

  return ACTION_MIN_ROLE[actionType]

}



export function isBlockedClientAction(actionType: string): boolean {

  return BLOCKED_CLIENT_ACTIONS.has(actionType)

}



export function canPerformActionType(userRole: Role | undefined, actionType: string): boolean {

  if (isBlockedClientAction(actionType)) {

    return false

  }

  const minimum = minimumRoleForAction(actionType)

  if (minimum === null || !userRole) {

    return false

  }

  const rank: Record<Role, number> = { viewer: 1, cost_controller: 2, approver: 3, admin: 4 }

  return rank[userRole] >= rank[minimum]

}


