/**
 * Practical cost-control log types used on O&G capital projects.
 * Each maps to existing workspace routes and ProjectState data — no duplicate stores.
 */
import type { NavView } from './navigationModel'
import { pathForView } from '../routes/viewPaths'

export interface CostControlLogType {
  id: string
  order: number
  name: string
  tracks: string
  /** Primary workspace route */
  view: NavView
  /** Optional secondary routes (e.g. audit trail for forecast revisions) */
  relatedViews?: NavView[]
}

export const costControlLogPath = '/logs'

export const costControlLogs: CostControlLogType[] = [
  {
    id: 'budget',
    order: 1,
    name: 'Budget log',
    tracks: 'Original budget, approved budget, current control budget',
    view: 'costsheet',
    relatedViews: ['cost-structure', 'basis'],
  },
  {
    id: 'commitment',
    order: 2,
    name: 'Commitment / PO log',
    tracks: 'Purchase orders, contracts, work orders, committed costs',
    view: 'procurement',
    relatedViews: ['long-lead'],
  },
  {
    id: 'change',
    order: 3,
    name: 'Change order / variation log',
    tracks: 'Scope changes, contract variations, approved/rejected changes',
    view: 'changes',
    relatedViews: ['decisions-log'],
  },
  {
    id: 'trend',
    order: 4,
    name: 'Trend log',
    tracks: 'Early warning cost movements before they become formal changes',
    view: 'predictive',
    relatedViews: ['issues', 'changes'],
  },
  {
    id: 'forecast',
    order: 5,
    name: 'Forecast / EAC log',
    tracks: 'Estimate at Completion, cost-to-complete, forecast revisions',
    view: 'forecast-engine',
    relatedViews: ['forecast-approval', 'audit-trail'],
  },
  {
    id: 'actual',
    order: 6,
    name: 'Actual cost log',
    tracks: 'Booked costs, incurred costs, cost reports from finance/accounting',
    view: 'costsheet',
    relatedViews: ['team-reports'],
  },
  {
    id: 'invoice',
    order: 7,
    name: 'Invoice / payment log',
    tracks: 'Supplier invoices, payment status, accruals',
    view: 'procurement',
    relatedViews: ['accruals'],
  },
  {
    id: 'accrual',
    order: 8,
    name: 'Accrual log',
    tracks: 'Work performed but not yet invoiced',
    view: 'accruals',
  },
  {
    id: 'risk',
    order: 9,
    name: 'Risk & opportunity log',
    tracks: 'Cost risks, contingencies, mitigation actions, potential savings',
    view: 'risks',
    relatedViews: ['opportunities'],
  },
  {
    id: 'contingency',
    order: 10,
    name: 'Contingency drawdown log',
    tracks: 'Use of contingency, remaining contingency balance',
    view: 'contingency',
  },
  {
    id: 'manpower',
    order: 11,
    name: 'Manpower / timesheet log',
    tracks: 'Labour hours, rates, productivity, reimbursable manpower costs',
    view: 'construction',
    relatedViews: ['accruals'],
  },
  {
    id: 'procurement-expediting',
    order: 12,
    name: 'Procurement / expediting cost log',
    tracks: 'Material costs, freight, customs, delivery impacts, vendor cost exposure',
    view: 'long-lead',
    relatedViews: ['procurement', 'forex'],
  },
  {
    id: 'contract-claims',
    order: 13,
    name: 'Contract claims log',
    tracks: 'Contractor claims, disputes, entitlement, commercial exposure',
    view: 'claims',
    relatedViews: ['changes', 'decisions-log'],
  },
  {
    id: 'equipment-rental',
    order: 14,
    name: 'Equipment rental log',
    tracks: 'Cranes, vessels, generators, temporary facilities',
    view: 'construction',
    relatedViews: ['procurement', 'costsheet'],
  },
  {
    id: 'subcontractor',
    order: 15,
    name: 'Subcontractor cost log',
    tracks: 'Subcontractor packages and cost performance',
    view: 'construction',
    relatedViews: ['accruals', 'procurement'],
  },
  {
    id: 'management-of-change',
    order: 16,
    name: 'Management of Change log',
    tracks: 'Technical or project changes requiring approval',
    view: 'changes',
    relatedViews: ['decisions-log', 'forecast-approval'],
  },
  {
    id: 'cost-code-wbs',
    order: 17,
    name: 'Cost code / WBS log',
    tracks: 'Mapping all costs to correct CBS/WBS codes',
    view: 'wbs',
    relatedViews: ['cost-structure', 'costsheet'],
  },
  {
    id: 'currency-fx',
    order: 18,
    name: 'Currency / exchange-rate log',
    tracks: 'FX exposure on international procurement',
    view: 'forex',
    relatedViews: ['procurement', 'long-lead'],
  },
  {
    id: 'lessons-learned',
    order: 19,
    name: 'Lessons learned log',
    tracks: 'Cost-control issues to avoid in future projects',
    view: 'lessons',
    relatedViews: ['audit-trail'],
  },
]

export const costControlLogCount = costControlLogs.length

export function logRoute(log: CostControlLogType): string {
  return pathForView(log.view)
}

export function logById(id: string): CostControlLogType | undefined {
  return costControlLogs.find((log) => log.id === id)
}
