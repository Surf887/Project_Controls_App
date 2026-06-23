import type { EacScenarioField } from '../engine/costSheetSync'
import type { ChangeStatus } from '../data/registers'

export type WorkflowStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export interface ApprovalStep {
  id: string
  actor: string
  role: string
  action: 'created' | 'submitted' | 'approved' | 'rejected' | 'returned' | 'commented' | 'forecast_submitted' | 'forecast_approved'
  at: string
  comment?: string
}

export interface ForecastApprovalPackage {
  id: string
  label: string
  period: string
  scenario: EacScenarioField
  status: WorkflowStatus
  submittedBy: string
  submittedAt?: string
  approver: string
  approvedAt?: string
  bacTotalUsd: number
  eacTotalUsd: number
  vacUsd: number
  notes: string
  approvalHistory: ApprovalStep[]
}

export interface AuditLogEntry {
  id: string
  at: string
  actor: string
  team: string
  entityType: 'forecast' | 'change' | 'cost_sheet' | 'settings' | 'accrual' | 'report'
  entityId: string
  action: string
  summary: string
}

export interface TeamReportTemplate {
  id: string
  name: string
  audience: string
  description: string
  template:
    | 'cost_summary'
    | 'change_pipeline'
    | 'forecast_movement'
    | 'evm_snapshot'
    | 'audit_activity'
    | 'commitment_report'
    | 'invoice_status'
    | 'accrual_report'
    | 'contingency_report'
    | 'sccs_rollup'
}

export interface GeneratedTeamReport {
  id: string
  templateId: string
  name: string
  audience: string
  generatedAt: string
  generatedBy: string
  rowCount: number
  preview: string
  content: string
}

export interface PortfolioProjectSnapshot {
  id: string
  name: string
  client: string
  phase: string
  bacUsd: number
  eacUsd: number
  actualsUsd: number
  vacUsd: number
  cpi: number
  spi: number
  openChangesUsd: number
  openRisksUsd: number
  forecastApprovalStatus: WorkflowStatus
  isActive: boolean
}

export const teamReportTemplates: TeamReportTemplate[] = [
  {
    id: 'rpt-cost',
    name: 'Monthly cost summary',
    audience: 'Project leadership',
    description: 'BAC, actuals, EAC, VAC by control account',
    template: 'cost_summary',
  },
  {
    id: 'rpt-changes',
    name: 'Change pipeline status',
    audience: 'Change control board',
    description: 'All changes by status with approver and cost impact',
    template: 'change_pipeline',
  },
  {
    id: 'rpt-forecast',
    name: 'Forecast movement log',
    audience: 'Cost engineering',
    description: 'Forecast approval history and EAC movement',
    template: 'forecast_movement',
  },
  {
    id: 'rpt-evm',
    name: 'EVM performance snapshot',
    audience: 'Performance team',
    description: 'CPI, SPI, EAC by WBS for current period',
    template: 'evm_snapshot',
  },
  {
    id: 'rpt-audit',
    name: 'Audit activity extract',
    audience: 'Governance / PMO',
    description: 'Who changed forecast, changes, and settings',
    template: 'audit_activity',
  },
  {
    id: 'rpt-commitment',
    name: 'Commitment exposure report',
    audience: 'Contract engineering',
    description: 'PO, contract, and subcontract commitment by WBS',
    template: 'commitment_report',
  },
  {
    id: 'rpt-invoice',
    name: 'Invoice status report',
    audience: 'Finance / contract admin',
    description: 'Submitted, approved, paid, and held invoices',
    template: 'invoice_status',
  },
  {
    id: 'rpt-accrual',
    name: 'Accrual completeness report',
    audience: 'Cost control / finance',
    description: 'Month-end accruals by WBS and source type',
    template: 'accrual_report',
  },
  {
    id: 'rpt-contingency',
    name: 'Contingency drawdown report',
    audience: 'Project leadership',
    description: 'Reserve balance, draws, and pending approvals',
    template: 'contingency_report',
  },
  {
    id: 'rpt-sccs',
    name: 'ISO 19008 SCCS rollup',
    audience: 'Benchmarking / portfolio',
    description: 'Cost sheet rolled up by PBS·SAB·COR composite for cross-project exchange',
    template: 'sccs_rollup',
  },
]

export const seedPortfolioProjects: PortfolioProjectSnapshot[] = [
  {
    id: 'proj-demo-001',
    name: 'Process Area A Expansion',
    client: 'Owner Refining Co',
    phase: 'Construction',
    bacUsd: 312_000_000,
    eacUsd: 328_500_000,
    actualsUsd: 198_400_000,
    vacUsd: -16_500_000,
    cpi: 0.94,
    spi: 0.91,
    openChangesUsd: 2_520_000,
    openRisksUsd: 4_800_000,
    forecastApprovalStatus: 'under_review',
    isActive: true,
  },
  {
    id: 'proj-benchmark-002',
    name: 'Utilities Upgrade Phase 2',
    client: 'Owner Refining Co',
    phase: 'Commissioning',
    bacUsd: 148_000_000,
    eacUsd: 151_200_000,
    actualsUsd: 142_800_000,
    vacUsd: -3_200_000,
    cpi: 0.98,
    spi: 0.96,
    openChangesUsd: 420_000,
    openRisksUsd: 1_100_000,
    forecastApprovalStatus: 'approved',
    isActive: false,
  },
  {
    id: 'proj-benchmark-003',
    name: 'Tank Farm De-bottleneck',
    client: 'Joint Venture Terminal',
    phase: 'Engineering',
    bacUsd: 86_000_000,
    eacUsd: 84_500_000,
    actualsUsd: 12_600_000,
    vacUsd: 1_500_000,
    cpi: 1.02,
    spi: 1.04,
    openChangesUsd: 680_000,
    openRisksUsd: 2_400_000,
    forecastApprovalStatus: 'draft',
    isActive: false,
  },
]

export const seedForecastApprovals: ForecastApprovalPackage[] = [
  {
    id: 'FCST-2026-05',
    label: 'Rev 2 — May-26 monthly forecast',
    period: 'May-26',
    scenario: 'eacMostLikely',
    status: 'approved',
    submittedBy: 'Cost Engineer',
    submittedAt: '2026-05-28 14:00',
    approver: 'Project Director',
    approvedAt: '2026-05-30 09:15',
    bacTotalUsd: 312_000_000,
    eacTotalUsd: 326_800_000,
    vacUsd: -14_800_000,
    notes: 'Approved with note to monitor piping labour productivity.',
    approvalHistory: [
      { id: 'AS-1', actor: 'Cost Engineer', role: 'Cost control', action: 'forecast_submitted', at: '2026-05-28 14:00', comment: 'Submitted for monthly sign-off.' },
      { id: 'AS-2', actor: 'Project Director', role: 'Approver', action: 'forecast_approved', at: '2026-05-30 09:15', comment: 'Approved — monitor Area A piping.' },
    ],
  },
  {
    id: 'FCST-2026-06',
    label: 'Rev 3 — Jun-26 monthly forecast (current)',
    period: 'Jun-26',
    scenario: 'eacMostLikely',
    status: 'under_review',
    submittedBy: 'Cost Engineer',
    submittedAt: '2026-06-12 16:30',
    approver: 'Project Director',
    bacTotalUsd: 312_000_000,
    eacTotalUsd: 328_500_000,
    vacUsd: -16_500_000,
    notes: 'Pending approval — includes CO-001 draw and FX stress load.',
    approvalHistory: [
      { id: 'AS-3', actor: 'Cost Engineer', role: 'Cost control', action: 'forecast_submitted', at: '2026-06-12 16:30', comment: 'Jun-26 forecast ready for approval.' },
    ],
  },
]

export const seedAuditLog: AuditLogEntry[] = [
  {
    id: 'AUD-001',
    at: '2026-06-12 16:30',
    actor: 'Cost Engineer',
    team: 'Cost control',
    entityType: 'forecast',
    entityId: 'FCST-2026-06',
    action: 'submitted',
    summary: 'Submitted Jun-26 forecast Rev 3 for approval (EAC $328.5M).',
  },
  {
    id: 'AUD-002',
    at: '2026-06-11 09:45',
    actor: 'Cost Engineer',
    team: 'Cost control',
    entityType: 'cost_sheet',
    entityId: 'A.02.02',
    action: 'updated',
    summary: 'Updated EAC on A.02.02 piping labour to $33.2M after productivity review.',
  },
  {
    id: 'AUD-003',
    at: '2026-06-10 11:20',
    actor: 'Change Manager',
    team: 'Project controls',
    entityType: 'change',
    entityId: 'CO-001',
    action: 'approved',
    summary: 'Approved CO-001 pipe spec uplift ($1.24M) — routed to management reserve.',
  },
  {
    id: 'AUD-004',
    at: '2026-06-09 08:00',
    actor: 'Cost Engineer',
    team: 'Cost control',
    entityType: 'settings',
    entityId: 'loadingMethod',
    action: 'updated',
    summary: 'Changed FTC loading method to back-end loaded for cost sheet sync.',
  },
]

export function seedChangeApprovalHistory(): Record<string, ApprovalStep[]> {
  return {
    'CO-001': [
      { id: 'CO1-1', actor: 'Owner Engineering', role: 'Originator', action: 'created', at: '2026-05-12 10:00' },
      { id: 'CO1-2', actor: 'Change Manager', role: 'Change control', action: 'submitted', at: '2026-05-20 14:00', comment: 'Submitted to change board.' },
      { id: 'CO1-3', actor: 'Project Director', role: 'Approver', action: 'approved', at: '2026-05-30 11:00', comment: 'Approved — draw from MR.' },
    ],
    'CO-002': [
      { id: 'CO2-1', actor: 'HSE Lead', role: 'Originator', action: 'created', at: '2026-05-28 09:00' },
      { id: 'CO2-2', actor: 'Change Manager', role: 'Change control', action: 'submitted', at: '2026-06-05 10:00' },
    ],
  }
}

export const changeWorkflowTransitions: Record<ChangeStatus, ChangeStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'withdrawn'],
  under_review: ['pending', 'approved', 'rejected', 'withdrawn'],
  pending: ['approved', 'rejected', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
}
