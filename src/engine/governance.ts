import type { ChangeItem, ChangeStatus } from '../data/registers'
import type { CostRow } from '../data/costSheet'
import { resolveApprover } from '../data/approvalMatrix'
import type {
  ApprovalStep,
  AuditLogEntry,
  ForecastApprovalPackage,
  GeneratedTeamReport,
  PortfolioProjectSnapshot,
  TeamReportTemplate,
  WorkflowStatus,
} from '../data/governance'
import type { ProjectState } from '../store/types'
import { computeForecast, totalForecastSnapshot } from './forecast'
import { sumBac, sumCostSheetMetric } from './costAggregation'
import { costSheetToEvmAccounts, computeEvmWithMethod } from './evmFromCostSheet'
import { incurredByControlAccount } from './incurredCost'
import { syncCommitmentsToCostSheet } from './commitmentSync'
import { computeReserveSnapshots, totalContingencyExposure } from './contingency'
import { accrualTotals } from './accruals'
import { invoicePipeline, subcontractMetrics } from './procurementReconcile'

export function createAuditEntry(
  partial: Omit<AuditLogEntry, 'id' | 'at'> & { at?: string },
): AuditLogEntry {
  return {
    id: `AUD-${Date.now()}`,
    at: partial.at ?? new Date().toLocaleString(),
    ...partial,
  }
}

export function appendAudit(state: ProjectState, entry: Omit<AuditLogEntry, 'id' | 'at'>): AuditLogEntry[] {
  return [createAuditEntry(entry), ...state.auditLog].slice(0, 100)
}

export function submitChangeForApproval(
  change: ChangeItem,
  actor: string,
  role: string,
  comment?: string,
): ChangeItem {
  const step: ApprovalStep = {
    id: `AS-${Date.now()}`,
    actor,
    role,
    action: 'submitted',
    at: new Date().toLocaleString(),
    comment,
  }

  const nextStatus: ChangeStatus =
    change.status === 'draft' ? 'submitted' : change.status === 'submitted' ? 'under_review' : change.status

  return {
    ...change,
    status: nextStatus === change.status ? 'submitted' : nextStatus,
    approvalHistory: [...(change.approvalHistory ?? []), step],
  }
}

export function decideChange(
  change: ChangeItem,
  decision: 'approved' | 'rejected',
  actor: string,
  role: string,
  comment?: string,
): ChangeItem {
  const step: ApprovalStep = {
    id: `AS-${Date.now()}`,
    actor,
    role,
    action: decision,
    at: new Date().toLocaleString(),
    comment,
  }

  return {
    ...change,
    status: decision,
    decisionDate: new Date().toISOString().slice(0, 10),
    approvalHistory: [...(change.approvalHistory ?? []), step],
  }
}

export function createChangeRequest(
  partial: Omit<ChangeItem, 'id' | 'approvalHistory' | 'raisedAt' | 'status'> & { id?: string },
  actor: string,
): ChangeItem {
  const id = partial.id ?? `CO-${String(Date.now()).slice(-4)}`
  return {
    ...partial,
    id,
    raisedAt: new Date().toISOString().slice(0, 10),
    status: 'draft',
    approver: partial.approver ?? resolveApprover('change', partial.costImpactUsd).approverName,
    approvalHistory: [
      {
        id: `AS-${Date.now()}`,
        actor,
        role: 'Originator',
        action: 'created',
        at: new Date().toLocaleString(),
      },
    ],
  }
}

export function buildDraftForecastPackage(state: ProjectState): ForecastApprovalPackage {
  const snapshots = computeForecast(
    state.costSheetRows,
    state.changes,
    state.risks,
    state.opportunities,
  )
  const totals = totalForecastSnapshot(snapshots, state.costSheetRows)
  const bac = sumBac(state.costSheetRows)
  const forecastApprover = resolveApprover('forecast', totals.eacMostLikely)

  return {
    id: `FCST-DRAFT-${state.meta.baselineLabel.replace(/\s+/g, '-')}`,
    label: `${state.meta.baselineLabel} — draft`,
    period: state.settings.reportingPeriod.period,
    scenario: state.settings.eacScenario,
    status: 'draft',
    submittedBy: 'Cost Engineer',
    approver: forecastApprover.approverName,
    bacTotalUsd: bac,
    eacTotalUsd: totals.eacMostLikely,
    vacUsd: bac - totals.eacMostLikely,
    notes: '',
    approvalHistory: [],
  }
}

export function submitForecastPackage(
  pkg: ForecastApprovalPackage,
  actor: string,
  comment?: string,
): ForecastApprovalPackage {
  const step: ApprovalStep = {
    id: `AS-${Date.now()}`,
    actor,
    role: 'Cost control',
    action: 'forecast_submitted',
    at: new Date().toLocaleString(),
    comment,
  }

  return {
    ...pkg,
    status: 'under_review',
    submittedBy: actor,
    submittedAt: step.at,
    approvalHistory: [...pkg.approvalHistory, step],
  }
}

export function approveForecastPackage(
  pkg: ForecastApprovalPackage,
  actor: string,
  comment?: string,
): ForecastApprovalPackage {
  const step: ApprovalStep = {
    id: `AS-${Date.now()}`,
    actor,
    role: 'Approver',
    action: 'forecast_approved',
    at: new Date().toLocaleString(),
    comment,
  }

  return {
    ...pkg,
    status: 'approved',
    approver: actor,
    approvedAt: step.at,
    approvalHistory: [...pkg.approvalHistory, step],
  }
}

export function rejectForecastPackage(
  pkg: ForecastApprovalPackage,
  actor: string,
  comment?: string,
): ForecastApprovalPackage {
  return {
    ...pkg,
    status: 'rejected',
    approvalHistory: [
      ...pkg.approvalHistory,
      {
        id: `AS-${Date.now()}`,
        actor,
        role: 'Approver',
        action: 'rejected',
        at: new Date().toLocaleString(),
        comment,
      },
    ],
  }
}

export function syncActivePortfolioProject(state: ProjectState): PortfolioProjectSnapshot[] {
  const snapshots = computeForecast(state.costSheetRows, state.changes, state.risks, state.opportunities)
  const totals = totalForecastSnapshot(snapshots, state.costSheetRows)
  const bac = sumBac(state.costSheetRows)
  const actuals = sumCostSheetMetric(state.costSheetRows, 'actualsToDate')
  // Mirror server computeService.computeProjectEvm: pass each account's own
  // per-WBS forecast EAC into computeEvmWithMethod, NOT the project total EAC.
  // Repeating the project total per account inflates every account's EAC and
  // breaks the portfolio roll-up.
  const forecastByWbs = new Map(snapshots.map((row) => [row.wbs, row.eacMostLikely]))
  const evm = costSheetToEvmAccounts(state.costSheetRows, {
    templates: state.ruleOfCreditTemplates,
    progressCredits: state.progressCredits,
  }).map((account) =>
    computeEvmWithMethod(account, state.settings.evmEacMethod, forecastByWbs.get(account.wbs)),
  )
  const cpi = evm.reduce((s, r) => s + r.cpi, 0) / (evm.length || 1)
  const spi = evm.reduce((s, r) => s + r.spi, 0) / (evm.length || 1)
  const openChanges = state.changes
    .filter((c) => c.status !== 'approved' && c.status !== 'rejected' && c.status !== 'withdrawn')
    .reduce((s, c) => s + c.costImpactUsd * c.probability, 0)
  const openRisks = state.risks
    .filter((r) => r.status !== 'closed' && r.status !== 'rejected')
    .reduce((s, r) => s + (r.postMitigationLikelihood / 5) * r.costExposureUsd, 0)

  const currentForecast = state.forecastApprovals.find((p) => p.status === 'under_review' || p.status === 'draft')
  const forecastStatus: WorkflowStatus = currentForecast?.status ?? 'approved'

  return state.portfolioProjects.map((project) =>
    project.isActive
      ? {
          ...project,
          name: state.meta.name,
          bacUsd: bac,
          eacUsd: totals.eacMostLikely,
          actualsUsd: actuals,
          vacUsd: bac - totals.eacMostLikely,
          cpi,
          spi,
          openChangesUsd: openChanges,
          openRisksUsd: openRisks,
          forecastApprovalStatus: forecastStatus,
        }
      : project,
  )
}

export function generateTeamReportCsv(
  template: TeamReportTemplate,
  state: ProjectState,
  generatedBy: string,
): GeneratedTeamReport {
  let rows: string[][] = []

  switch (template.template) {
    case 'cost_summary': {
      const incurredRows = incurredByControlAccount(state.costSheetRows, state.costAccruals)
      rows = [
        ['WBS', 'Description', 'BAC', 'Actuals', 'Accruals', 'Incurred', 'EAC', 'VAC'],
        ...state.costSheetRows
          .filter((row) => row.parentId === null)
          .map((row: CostRow) => {
            const incurred = incurredRows.find((entry) => entry.wbs === row.wbs)
            return [
              row.wbs,
              row.description,
              String(row.originalBudget + row.approvedChanges),
              String(row.actualsToDate),
              String(incurred?.accruals ?? 0),
              String(incurred?.incurred ?? row.actualsToDate),
              String(row.eac),
              String(row.vac),
            ]
          }),
      ]
      break
    }
    case 'change_pipeline':
      rows = [
        ['ID', 'Title', 'Status', 'Cost USD', 'Approver', 'Raised by', 'Raised at'],
        ...state.changes.map((c: ChangeItem) => [
          c.id,
          c.title,
          c.status,
          String(c.costImpactUsd),
          c.approver,
          c.raisedBy,
          c.raisedAt,
        ]),
      ]
      break
    case 'forecast_movement':
      rows = [
        ['Package', 'Period', 'Status', 'BAC', 'EAC', 'VAC', 'Submitted by', 'Approver'],
        ...state.forecastApprovals.map((p) => [
          p.label,
          p.period,
          p.status,
          String(p.bacTotalUsd),
          String(p.eacTotalUsd),
          String(p.vacUsd),
          p.submittedBy,
          p.approver,
        ]),
      ]
      break
    case 'evm_snapshot':
      rows = [['WBS', 'BAC', 'EV', 'AC', 'CPI', 'SPI', 'EAC']]
      costSheetToEvmAccounts(state.costSheetRows).forEach((account) => {
        const result = computeEvmWithMethod(account, state.settings.evmEacMethod)
        rows.push([
          account.wbs,
          String(account.bac),
          String(account.ev),
          String(account.ac),
          result.cpi.toFixed(2),
          result.spi.toFixed(2),
          String(result.eac),
        ])
      })
      break
    case 'audit_activity':
      rows = [['When', 'Actor', 'Team', 'Type', 'Entity', 'Action', 'Summary']]
      state.auditLog.forEach((entry) => {
        rows.push([
          entry.at,
          entry.actor,
          entry.team,
          entry.entityType,
          entry.entityId,
          entry.action,
          entry.summary,
        ])
      })
      break
    case 'commitment_report': {
      const synced = syncCommitmentsToCostSheet(
        state.costSheetRows,
        state.purchaseOrders,
        state.contracts,
        state.subcontracts,
      )
      rows = [
        ['WBS', 'Description', 'Commitments', 'Current budget', 'Commitment variance'],
        ...synced
          .filter((row) => row.parentId === null)
          .map((row) => [
            row.wbs,
            row.description,
            String(row.commitments),
            String(row.currentBudget),
            String(row.currentBudget - row.commitments),
          ]),
      ]
      rows.push(
        ['', 'PO total', String(state.purchaseOrders.reduce((sum, po) => sum + po.committedUsd, 0)), '', ''],
        [
          '',
          'Subcontract total',
          String(subcontractMetrics(state.subcontracts).totalValue),
          '',
          '',
        ],
      )
      break
    }
    case 'invoice_status':
      rows = [
        ['Invoice', 'Vendor', 'PO', 'Period', 'Amount USD', 'Status', 'WBS'],
        ...state.invoices.map((invoice) => [
          invoice.number,
          invoice.vendor,
          invoice.poId,
          invoice.period,
          String(invoice.amountUsd),
          invoice.status,
          invoice.wbs,
        ]),
      ]
      break
    case 'accrual_report': {
      const totals = accrualTotals(state.costAccruals)
      rows = [
        ['ID', 'Period', 'WBS', 'Source', 'Accrual USD', 'Status', 'Owner'],
        ...state.costAccruals.map((entry) => [
          entry.id,
          entry.period,
          entry.wbs,
          entry.sourceType,
          String(entry.accrualUsd),
          entry.status,
          entry.owner,
        ]),
      ]
      rows.push(['', '', '', 'TOTAL', String(totals.totalOpen), '', ''])
      break
    }
    case 'contingency_report': {
      const snapshots = computeReserveSnapshots(state.costSheetRows, state.contingencyDraws)
      const exposure = totalContingencyExposure(state.contingencyDraws)
      rows = [
        ['Reserve', 'WBS', 'Original', 'Drawn', 'Pending', 'Remaining', 'Util %'],
        ...snapshots.map((snapshot) => [
          snapshot.reserveType,
          snapshot.wbs,
          String(snapshot.originalBudget),
          String(snapshot.drawnToDate),
          String(snapshot.pendingDraw),
          String(snapshot.remaining),
          snapshot.utilizationPct.toFixed(1),
        ]),
      ]
      rows.push(['', '', '', 'Posted total', String(exposure.posted), 'Pending', String(exposure.pending)])
      break
    }
  }

  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')

  return {
    id: `GEN-${Date.now()}`,
    templateId: template.id,
    name: template.name,
    audience: template.audience,
    generatedAt: new Date().toLocaleString(),
    generatedBy,
    rowCount: rows.length - 1,
    preview: csv.split('\n').slice(0, 6).join('\n'),
    content: csv,
  }
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
