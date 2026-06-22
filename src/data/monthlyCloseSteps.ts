import type { NavView } from './navigationModel'
import { monthlyClosePath, pathForView } from '../routes/viewPaths'

export type MonthlyCloseStepStatus = 'pending' | 'in_progress' | 'complete' | 'blocked'

export interface MonthlyCloseStep {
  id: string
  order: number
  title: string
  description: string
  view: NavView
  /** Optional checklist item ids for progress tracking in localStorage */
  checklistKeys: string[]
}

export const monthlyCloseSteps: MonthlyCloseStep[] = [
  {
    id: 'baseline',
    order: 1,
    title: 'Setup baseline',
    description: 'Confirm sanction baseline, BOE class, and locked control accounts.',
    view: 'basis',
    checklistKeys: ['baseline_reviewed', 'control_accounts_locked'],
  },
  {
    id: 'wbs',
    order: 2,
    title: 'Import / update WBS',
    description: 'Refresh control account tree, CapEx tags, and CBS mapping.',
    view: 'wbs',
    checklistKeys: ['wbs_imported', 'cbs_mapped'],
  },
  {
    id: 'reconcile',
    order: 3,
    title: 'Reconcile actuals & accruals',
    description: 'Close invoice gaps, post accruals, align economic actuals to cost sheet.',
    view: 'accruals',
    checklistKeys: ['accruals_posted', 'actuals_reconciled'],
  },
  {
    id: 'vowd',
    order: 4,
    title: 'Review VOWD',
    description: 'Update rules of credit, earned %, and EVM performance signals.',
    view: 'rules-of-credit',
    checklistKeys: ['roc_updated', 'evm_reviewed'],
  },
  {
    id: 'changes',
    order: 5,
    title: 'Approve changes',
    description: 'Change board: budget moves vs forecast variance — no conflation.',
    view: 'changes',
    checklistKeys: ['changes_board_complete'],
  },
  {
    id: 'forecast',
    order: 6,
    title: 'Run forecast',
    description: 'Roll CCE forward with pending exposure, risk, FX, and contingency draws.',
    view: 'forecast-engine',
    checklistKeys: ['forecast_run'],
  },
  {
    id: 'submit',
    order: 7,
    title: 'Submit package',
    description: 'Lock monthly EAC package and route for forecast approval.',
    view: 'forecast-approval',
    checklistKeys: ['package_submitted'],
  },
  {
    id: 'reports',
    order: 8,
    title: 'Generate reports',
    description: 'Export stakeholder packs (Excel/PDF) and audit trail.',
    view: 'team-reports',
    checklistKeys: ['reports_exported'],
  },
]

export function stepPath(step: MonthlyCloseStep): string {
  return pathForView(step.view)
}

export function monthlyCloseHubPath(): string {
  return monthlyClosePath
}

export function isCloseFlowRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === monthlyClosePath || normalized === '/exports') {
    return true
  }
  return monthlyCloseSteps.some((step) => pathForView(step.view) === normalized)
}
