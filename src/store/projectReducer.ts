import { buildAccrualRegister } from '../engine/accruals'
import {
  approveForecastPackage,
  appendAudit,
  decideChange,
  rejectForecastPackage,
  submitChangeForApproval,
  submitForecastPackage,
  syncActivePortfolioProject,
} from '../engine/governance'
import { reconcileContingencyInState } from '../engine/projectReconcile'
import { syncCommitmentsToCostSheet } from '../engine/commitmentSync'
import { applyApprovedExtractions } from '../engine/ingestionPosting'
import { approveContingencyDraw, submitContingencyDraw } from '../engine/contingency'
import { applyValuesUpdate } from '../engine/extractionIntegrity'
import { validateProjectAction } from '../engine/actionValidation'
import { enrichCostSheetRows } from '../engine/sccs'
import type { ProjectAction, ProjectState } from './types'
import { defaultFxSettings, defaultReportingPeriod } from './types'

function isPeriodLocked(state: ProjectState) {
  return state.settings.reportingPeriod?.locked ?? false
}

/**
 * Backfill fields added after a state may have been persisted, so loading an
 * older saved project (server JSON store or browser localStorage) never crashes
 * on a missing setting. Cheap and idempotent.
 */
function normalizeState(state: ProjectState): ProjectState {
  const needsSettings = !state.settings.reportingPeriod || !state.settings.fx
  const needsSccs = state.costSheetRows.some((row) => row.parentId === null && !row.sccs?.composite)
  const needsPostings = state.ingestionPostings == null

  if (!needsSettings && !needsSccs && !needsPostings) {
    return state
  }

  return {
    ...state,
    ...(needsPostings ? { ingestionPostings: [] } : {}),
    ...(needsSettings
      ? {
          settings: {
            ...state.settings,
            reportingPeriod: state.settings.reportingPeriod ?? defaultReportingPeriod,
            fx: state.settings.fx ?? defaultFxSettings,
          },
        }
      : {}),
    ...(needsSccs ? { costSheetRows: enrichCostSheetRows(state.costSheetRows) } : {}),
  }
}

function rebuildAccruals(state: ProjectState): ProjectState {
  const manual = state.costAccruals.filter(
    (entry) => entry.sourceType === 'manual' || entry.sourceType === 'timesheet',
  )
  return {
    ...state,
    costAccruals: buildAccrualRegister(
      state.subcontracts,
      state.purchaseOrders,
      state.invoices,
      manual,
    ),
  }
}

function applyContingencyIfNeeded(state: ProjectState): ProjectState {
  return reconcileContingencyInState(state)
}

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'HYDRATE':
      return normalizeState(action.payload)
    case 'RESET':
      return applyContingencyIfNeeded(normalizeState(action.payload))
    case 'SET_META':
      return { ...state, meta: { ...state.meta, ...action.payload } }
    case 'SET_SETTINGS': {
      const next = applyContingencyIfNeeded({
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
          contingencyRules: action.payload.contingencyRules
            ? { ...state.settings.contingencyRules, ...action.payload.contingencyRules }
            : state.settings.contingencyRules,
          fx: action.payload.fx ? { ...state.settings.fx, ...action.payload.fx } : state.settings.fx,
        },
      })
      return {
        ...next,
        auditLog: appendAudit(state, {
          actor: 'You',
          team: 'Administration',
          entityType: 'settings',
          entityId: state.meta.id,
          action: 'updated',
          summary: `Project settings updated (${Object.keys(action.payload).join(', ')})`,
        }),
      }
    }
    case 'SET_BASIS_OF_ESTIMATE':
      return { ...state, basisOfEstimate: { ...state.basisOfEstimate, ...action.payload } }
    case 'SET_WBS_NODES':
      return { ...state, wbsNodes: action.payload }
    case 'SET_COST_SHEET': {
      if (isPeriodLocked(state)) {
        return state
      }
      if (JSON.stringify(state.costSheetRows) === JSON.stringify(action.payload)) {
        return state
      }

      const next = applyContingencyIfNeeded({
        ...state,
        costSheetRows: enrichCostSheetRows(action.payload),
      })
      if (
        JSON.stringify(state.costSheetRows) === JSON.stringify(next.costSheetRows) &&
        JSON.stringify(state.contingencyDraws) === JSON.stringify(next.contingencyDraws)
      ) {
        return state
      }
      return {
        ...next,
        auditLog: appendAudit(state, {
          actor: 'You',
          team: 'Cost control',
          entityType: 'forecast',
          entityId: state.meta.id,
          action: 'updated',
          summary: `Cost sheet updated (${action.payload.length} control accounts)`,
        }),
      }
    }
    case 'SET_DELIVERABLES':
      return { ...state, deliverables: action.payload }
    case 'SET_CHANGES':
      return applyContingencyIfNeeded({ ...state, changes: action.payload })
    case 'SET_RISKS':
      return { ...state, risks: action.payload }
    case 'SET_OPPORTUNITIES':
      return { ...state, opportunities: action.payload }
    case 'SET_ISSUES':
      return { ...state, issues: action.payload }
    case 'SET_ACTIONS':
      return { ...state, actions: action.payload }
    case 'SET_DECISIONS':
      return { ...state, decisions: action.payload }
    case 'SET_LESSONS':
      return { ...state, lessons: action.payload }
    case 'SET_CLAIMS':
      return { ...state, claims: action.payload }
    case 'SET_VENDORS':
      return { ...state, vendors: action.payload }
    case 'SET_PURCHASE_ORDERS':
      return rebuildAccruals({ ...state, purchaseOrders: action.payload })
    case 'SET_CONTRACTS':
      return { ...state, contracts: action.payload }
    case 'SET_RFQ_BIDS':
      return { ...state, rfqBids: action.payload }
    case 'SET_INVOICES':
      return rebuildAccruals({ ...state, invoices: action.payload })
    case 'SET_SUBCONTRACTS':
      return rebuildAccruals({ ...state, subcontracts: action.payload })
    case 'SET_FIELD_DAILY_REPORTS':
      return { ...state, fieldDailyReports: action.payload }
    case 'SET_FIELD_OBSERVATIONS':
      return { ...state, fieldObservations: action.payload }
    case 'SET_TURNOVER_CHECKLISTS':
      return { ...state, turnoverChecklists: action.payload }
    case 'SET_WORK_FRONTS':
      return { ...state, workFronts: action.payload }
    case 'SET_PUNCH_LIST':
      return { ...state, punchList: action.payload }
    case 'SET_CONTINGENCY_DRAWS':
      return applyContingencyIfNeeded({ ...state, contingencyDraws: action.payload })
    case 'SET_CONTINGENCY_RULES':
      return applyContingencyIfNeeded({
        ...state,
        settings: {
          ...state.settings,
          contingencyRules: { ...state.settings.contingencyRules, ...action.payload },
        },
      })
    case 'SET_FX_RATES':
      return { ...state, fxRates: action.payload }
    case 'SET_FX_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          fx: { ...state.settings.fx, ...action.payload },
        },
      }
    case 'SET_CONNECTORS':
      return { ...state, connectors: action.payload }
    case 'UPDATE_CONNECTOR': {
      const connectors = state.connectors.map((connector) =>
        connector.id === action.payload.id ? action.payload : connector,
      )
      return { ...state, connectors }
    }
    case 'ADD_SYNC_JOB':
      return { ...state, syncJobs: [action.payload, ...state.syncJobs].slice(0, 20) }
    case 'SET_RULE_OF_CREDIT_TEMPLATES':
      return { ...state, ruleOfCreditTemplates: action.payload }
    case 'SET_PROGRESS_CREDITS':
      return { ...state, progressCredits: action.payload }
    case 'UPDATE_PROGRESS_CREDIT':
      return {
        ...state,
        progressCredits: state.progressCredits.map((entry) =>
          entry.id === action.payload.id ? action.payload : entry,
        ),
      }
    case 'SET_LONG_LEAD_ITEMS':
      return { ...state, longLeadItems: action.payload }
    case 'SET_CBS_NODES':
      return { ...state, cbsNodes: action.payload }
    case 'SET_BURDEN_RULES':
      return { ...state, burdenRules: action.payload }
    case 'SET_COST_ACCRUALS':
      return { ...state, costAccruals: action.payload }
    case 'UPDATE_COST_ACCRUAL':
      return {
        ...state,
        costAccruals: state.costAccruals.map((entry) =>
          entry.id === action.payload.id ? action.payload : entry,
        ),
      }
    case 'RECONCILE_ACCRUALS':
      return rebuildAccruals(state)
    case 'SET_FORECAST_APPROVALS':
      return { ...state, forecastApprovals: action.payload }
    case 'UPDATE_FORECAST_APPROVAL':
      return {
        ...state,
        forecastApprovals: state.forecastApprovals.map((pkg) =>
          pkg.id === action.payload.id ? action.payload : pkg,
        ),
      }
    case 'SUBMIT_FORECAST': {
      const pkg = state.forecastApprovals.find((item) => item.id === action.payload.packageId)
      if (!pkg) return state
      const updated = submitForecastPackage(pkg, action.payload.actor, action.payload.comment)
      return {
        ...state,
        forecastApprovals: state.forecastApprovals.map((item) => (item.id === updated.id ? updated : item)),
        auditLog: appendAudit(state, {
          actor: action.payload.actor,
          team: 'Cost control',
          entityType: 'forecast',
          entityId: updated.id,
          action: 'submitted',
          summary: `Submitted ${updated.label} for approval (EAC ${updated.eacTotalUsd.toLocaleString()}).`,
        }),
        portfolioProjects: syncActivePortfolioProject({
          ...state,
          forecastApprovals: state.forecastApprovals.map((i) => (i.id === updated.id ? updated : i)),
        }),
      }
    }
    case 'APPROVE_FORECAST': {
      const pkg = state.forecastApprovals.find((item) => item.id === action.payload.packageId)
      if (!pkg) return state
      const updated = approveForecastPackage(pkg, action.payload.actor, action.payload.comment)
      const nextApprovals = state.forecastApprovals.map((item) => (item.id === updated.id ? updated : item))
      return {
        ...state,
        forecastApprovals: nextApprovals,
        auditLog: appendAudit(state, {
          actor: action.payload.actor,
          team: 'Project leadership',
          entityType: 'forecast',
          entityId: updated.id,
          action: 'approved',
          summary: `Approved ${updated.label}.`,
        }),
        portfolioProjects: syncActivePortfolioProject({ ...state, forecastApprovals: nextApprovals }),
      }
    }
    case 'REJECT_FORECAST': {
      const pkg = state.forecastApprovals.find((item) => item.id === action.payload.packageId)
      if (!pkg) return state
      const updated = rejectForecastPackage(pkg, action.payload.actor, action.payload.comment)
      const nextApprovals = state.forecastApprovals.map((item) => (item.id === updated.id ? updated : item))
      return {
        ...state,
        forecastApprovals: nextApprovals,
        auditLog: appendAudit(state, {
          actor: action.payload.actor,
          team: 'Project leadership',
          entityType: 'forecast',
          entityId: updated.id,
          action: 'rejected',
          summary: `Rejected ${updated.label}.`,
        }),
        portfolioProjects: syncActivePortfolioProject({ ...state, forecastApprovals: nextApprovals }),
      }
    }
    case 'CREATE_CHANGE': {
      const changes = [action.payload, ...state.changes]
      return {
        ...state,
        changes,
        auditLog: appendAudit(state, {
          actor: action.payload.raisedBy,
          team: 'Change control',
          entityType: 'change',
          entityId: action.payload.id,
          action: 'created',
          summary: `Created change request ${action.payload.id}: ${action.payload.title}.`,
        }),
      }
    }
    case 'SUBMIT_CHANGE': {
      const changes = state.changes.map((change) =>
        change.id === action.payload.changeId
          ? submitChangeForApproval(change, action.payload.actor, action.payload.role, action.payload.comment)
          : change,
      )
      const updated = changes.find((c) => c.id === action.payload.changeId)
      return {
        ...state,
        changes,
        auditLog: updated
          ? appendAudit(state, {
              actor: action.payload.actor,
              team: 'Change control',
              entityType: 'change',
              entityId: updated.id,
              action: 'submitted',
              summary: `Submitted ${updated.id} for approval.`,
            })
          : state.auditLog,
      }
    }
    case 'DECIDE_CHANGE': {
      const changes = state.changes.map((change) =>
        change.id === action.payload.changeId
          ? decideChange(change, action.payload.decision, action.payload.actor, action.payload.role, action.payload.comment)
          : change,
      )
      const updated = changes.find((c) => c.id === action.payload.changeId)
      return applyContingencyIfNeeded({
        ...state,
        changes,
        auditLog: updated
          ? appendAudit(state, {
              actor: action.payload.actor,
              team: 'Change control',
              entityType: 'change',
              entityId: updated.id,
              action: action.payload.decision,
              summary: `${action.payload.decision} ${updated.id} (${updated.title}).`,
            })
          : state.auditLog,
      })
    }
    case 'ADD_AUDIT':
      return { ...state, auditLog: [action.payload, ...state.auditLog].slice(0, 100) }
    case 'ADD_GENERATED_REPORT':
      return {
        ...state,
        generatedTeamReports: [action.payload, ...state.generatedTeamReports].slice(0, 20),
        auditLog: appendAudit(state, {
          actor: action.payload.generatedBy,
          team: 'Reporting',
          entityType: 'report',
          entityId: action.payload.id,
          action: 'generated',
          summary: `Generated team report "${action.payload.name}" for ${action.payload.audience}.`,
        }),
      }
    case 'SYNC_PORTFOLIO':
      return { ...state, portfolioProjects: syncActivePortfolioProject(state) }
    case 'RECONCILE_CONTINGENCY':
      return applyContingencyIfNeeded(state)
    case 'SYNC_COMMITMENTS': {
      if (isPeriodLocked(state)) {
        return state
      }
      const costSheetRows = syncCommitmentsToCostSheet(
        state.costSheetRows,
        state.purchaseOrders,
        state.contracts,
        state.subcontracts,
      )
      return {
        ...state,
        costSheetRows,
        auditLog: appendAudit(state, {
          actor: 'Cost control',
          team: 'Cost control',
          entityType: 'cost_sheet',
          entityId: state.meta.id,
          action: 'synced',
          summary: 'Synced commitment values from PO, contract, and subcontract registers.',
        }),
      }
    }
    case 'LOCK_REPORTING_PERIOD': {
      try {
        validateProjectAction(state, action)
      } catch {
        return state
      }
      return {
        ...state,
        settings: {
          ...state.settings,
          reportingPeriod: {
            period: action.payload.period,
            locked: true,
            lockedAt: new Date().toISOString(),
            lockedBy: action.payload.actor,
          },
        },
        auditLog: appendAudit(state, {
          actor: action.payload.actor,
          team: 'Cost control',
          entityType: 'settings',
          entityId: action.payload.period,
          action: 'locked',
          summary: `Locked reporting period ${action.payload.period} after month-end sign-off.`,
        }),
      }
    }
    case 'UNLOCK_REPORTING_PERIOD':
      return {
        ...state,
        settings: {
          ...state.settings,
          reportingPeriod: {
            ...state.settings.reportingPeriod,
            locked: false,
            lockedAt: undefined,
            lockedBy: undefined,
          },
        },
        auditLog: appendAudit(state, {
          actor: action.payload.actor,
          team: 'Administration',
          entityType: 'settings',
          entityId: state.settings.reportingPeriod.period,
          action: 'unlocked',
          summary: `Unlocked reporting period ${state.settings.reportingPeriod.period}.`,
        }),
      }
    case 'SUBMIT_CONTINGENCY_DRAW': {
      const contingencyDraws = state.contingencyDraws.map((draw) =>
        draw.id === action.payload.drawId
          ? submitContingencyDraw(draw, action.payload.actor)
          : draw,
      )
      return { ...state, contingencyDraws }
    }
    case 'APPROVE_CONTINGENCY_DRAW': {
      const contingencyDraws = state.contingencyDraws.map((draw) =>
        draw.id === action.payload.drawId
          ? approveContingencyDraw(draw, action.payload.actor)
          : draw,
      )
      return applyContingencyIfNeeded({ ...state, contingencyDraws })
    }
    case 'APPLY_APPROVED_EXTRACTIONS': {
      if (isPeriodLocked(state)) {
        return state
      }
      const { state: posted, summary } = applyApprovedExtractions(state, action.payload.actor)
      if (summary.appliedCount === 0) {
        return state
      }
      const reconciled = applyContingencyIfNeeded(posted)
      const sign = summary.eacDeltaUsd >= 0 ? '+' : '-'
      return {
        ...reconciled,
        ingestionApplications: [summary, ...(state.ingestionApplications ?? [])].slice(0, 20),
        auditLog: appendAudit(state, {
          actor: action.payload.actor,
          team: 'Cost control',
          entityType: 'forecast',
          entityId: state.meta.id,
          action: 'applied',
          summary: `Applied ${summary.appliedCount} approved extraction(s) from ${summary.byReport.length} report(s); EAC moved ${sign}${Math.abs(summary.eacDeltaUsd).toLocaleString()} USD.`,
        }),
      }
    }
    case 'SET_REPORTS':
      return { ...state, reports: action.payload }
    case 'SET_VALUES':
      if (isPeriodLocked(state)) {
        return state
      }
      return applyValuesUpdate(state, action.payload, 'Cost Controller')
    case 'SET_SELECTED_VALUE':
      return { ...state, selectedValueId: action.payload }
    default:
      return state
  }
}

export function applyProjectAction(state: ProjectState, action: ProjectAction): ProjectState {
  return projectReducer(state, action)
}
