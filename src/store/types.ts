import type { CostRow } from '../data/costSheet'
import type { ExtractedValue, ReportDocument } from '../data/projectData'
import type {
  ActionItem,
  ChangeItem,
  ContractClaim,
  DecisionLogEntry,
  IssueItem,
  LessonLearned,
  OpportunityItem,
  RiskItem,
} from '../data/registers'
import type {
  CommissioningSystem,
  ExpeditingMilestone,
  ProductivityPoint,
  PunchListItem,
  PurchaseOrder,
  WorkFront,
} from '../data/phases'
import type {
  Contract,
  FieldDailyReport,
  FieldObservation,
  Invoice,
  RfqBid,
  Subcontract,
  TurnoverChecklist,
} from '../data/procurementFlow'
import type { LoadingMethod } from '../engine/loading'
import type { EacScenarioField } from '../engine/costSheetSync'
import type { EvmEacMethod } from '../engine/evmFromCostSheet'
import type {
  AuditLogEntry,
  ForecastApprovalPackage,
  GeneratedTeamReport,
  PortfolioProjectSnapshot,
} from '../data/governance'
import type { ConnectorConfig, SyncJobResult } from '../integrations/connectors'
import type { Vendor } from '../data/vendors'
import type { ScheduleActivity, ScheduleImportBatch, ScheduleRelationship } from '../data/schedule'

export type { ApprovalStep, WorkflowStatus } from '../data/governance'
export type ReserveType = 'contingency' | 'management_reserve'
export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD'

export interface ContingencyDrawRule {
  autoDrawOnApprovedChange: boolean
  drawPositiveChangesOnly: boolean
  maxDrawPctOfReserve: number
  requireManagementReserveForChangesOver: number
}

export interface ContingencyDrawEntry {
  id: string
  changeId: string
  changeTitle: string
  reserveType: ReserveType
  amountUsd: number
  drawnAt: string
  status: 'pending' | 'submitted' | 'posted' | 'reversed'
  wbsTarget?: string
  approver?: string
}

export interface ContingencyReserveSnapshot {
  reserveType: ReserveType
  wbs: string
  description: string
  originalBudget: number
  drawnToDate: number
  pendingDraw: number
  remaining: number
  utilizationPct: number
}

export interface FxRate {
  id: string
  from: SupportedCurrency
  to: 'USD'
  rate: number
  effectiveDate: string
  source: 'manual' | 'treasury' | 'ecb'
}

export interface FxExposure {
  id: string
  referenceType: 'po' | 'commitment' | 'change'
  referenceId: string
  description: string
  currency: SupportedCurrency
  amountForeign: number
  amountUsd: number
  hedgedPct: number
  hedgeInstrument?: string
  unhedgedUsd: number
}

export interface FxSettings {
  reportingCurrency: 'USD'
  adverseMovePct: number
  includeFxInForecast: boolean
}

export interface ReportingPeriodLock {
  period: string
  locked: boolean
  lockedAt?: string
  lockedBy?: string
}

export type AccrualSourceType = 'subcontract' | 'purchase_order' | 'invoice_pending' | 'manual' | 'timesheet'
export type AccrualStatus = 'draft' | 'reviewed' | 'posted' | 'reversed'

export interface CostAccrualEntry {
  id: string
  period: string
  wbs: string
  description: string
  sourceType: AccrualSourceType
  sourceRef: string
  basisAmountUsd: number
  settledAmountUsd: number
  accrualUsd: number
  status: AccrualStatus
  calculationMethod: string
  owner: string
  notes: string
}

export type CostNature = 'direct' | 'indirect'
export type TecCategory = 'T' | 'E' | 'C' | 'O' | 'P' | 'NTR' | 'Owner' | 'Reserve'
export type RocAppliesTo = 'engineering' | 'construction' | 'procurement' | 'commissioning'
export type ProgressTargetType = 'wbs' | 'deliverable' | 'work_front'
export type LliCriticality = 'critical' | 'high' | 'medium'
export type LliStatus = 'engineering' | 'ordered' | 'manufacturing' | 'transit' | 'site_received' | 'installed'

export interface RuleOfCreditStep {
  id: string
  sequence: number
  name: string
  creditPercent: number
  evidenceRequired?: string
}

export interface RuleOfCreditTemplate {
  id: string
  name: string
  discipline: string
  appliesTo: RocAppliesTo
  steps: RuleOfCreditStep[]
}

export interface ProgressCreditEntry {
  id: string
  targetType: ProgressTargetType
  targetId: string
  templateId: string
  completedStepIds: string[]
  quantityInstalled?: number
  quantityTotal?: number
}

export interface LongLeadItem {
  id: string
  tag: string
  description: string
  category: 'Rotating' | 'Static' | 'Electrical' | 'Instrumentation' | 'Bulk Materials'
  criticality: LliCriticality
  leadTimeDays: number
  orderByDate: string
  requiredOnSiteDate: string
  forecastOnSiteDate: string
  poId?: string
  wbs: string
  status: LliStatus
  scheduleImpactDays: number
  notes: string
}

export interface CbsNode {
  id: string
  code: string
  parentCode: string | null
  description: string
  costNature: CostNature
  tecCategory: TecCategory
  defaultBurdenPct: number
}

export interface BurdenRule {
  id: string
  name: string
  appliesToTec: TecCategory[]
  burdenPct: number
  description: string
}

export type CostType = 'CAPEX' | 'OPEX' | 'Owner Cost' | 'Contingency' | 'Management Reserve'
export type ProjectPhase = 'Engineering' | 'Procurement' | 'Construction' | 'Commissioning'

export interface WbsNode {
  id: string
  wbs: string
  parentWbs: string | null
  description: string
  costType: CostType
  phase: ProjectPhase
  discipline: string
  originalBudget: number
  currency: 'USD'
}

export interface Deliverable {
  id: string
  number: string
  title: string
  discipline: string
  phase: ProjectPhase
  weightPercent: number
  plannedProgress: number
  earnedProgress: number
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved'
  dueDate: string
  owner: string
}

export interface BasisOfEstimate {
  scope: string
  methodology: string
  designBasis: string
  allowances: string
  exclusions: string
  risksOpportunities: string
  lastUpdated: string
  preparedBy: string
}

export interface ProjectSettings {
  eacScenario: EacScenarioField
  loadingMethod: LoadingMethod
  evmEacMethod: EvmEacMethod
  autoSyncFromRegisters: boolean
  contingencyRules: ContingencyDrawRule
  fx: FxSettings
  reportingPeriod: ReportingPeriodLock
}

export interface ProjectMeta {
  id: string
  name: string
  baselineLabel: string
}

export interface ProjectState {
  meta: ProjectMeta
  settings: ProjectSettings
  basisOfEstimate: BasisOfEstimate
  wbsNodes: WbsNode[]
  costSheetRows: CostRow[]
  deliverables: Deliverable[]
  changes: ChangeItem[]
  risks: RiskItem[]
  opportunities: OpportunityItem[]
  issues: IssueItem[]
  actions: ActionItem[]
  decisions: DecisionLogEntry[]
  lessons: LessonLearned[]
  claims: ContractClaim[]
  vendors: Vendor[]
  purchaseOrders: PurchaseOrder[]
  contracts: Contract[]
  rfqBids: RfqBid[]
  invoices: Invoice[]
  subcontracts: Subcontract[]
  fieldDailyReports: FieldDailyReport[]
  fieldObservations: FieldObservation[]
  turnoverChecklists: TurnoverChecklist[]
  expeditingMilestones: ExpeditingMilestone[]
  workFronts: WorkFront[]
  productivityTrend: ProductivityPoint[]
  commissioningSystems: CommissioningSystem[]
  punchList: PunchListItem[]
  contingencyDraws: ContingencyDrawEntry[]
  fxRates: FxRate[]
  connectors: ConnectorConfig[]
  syncJobs: SyncJobResult[]
  ruleOfCreditTemplates: RuleOfCreditTemplate[]
  progressCredits: ProgressCreditEntry[]
  longLeadItems: LongLeadItem[]
  cbsNodes: CbsNode[]
  burdenRules: BurdenRule[]
  costAccruals: CostAccrualEntry[]
  forecastApprovals: ForecastApprovalPackage[]
  portfolioProjects: PortfolioProjectSnapshot[]
  auditLog: AuditLogEntry[]
  generatedTeamReports: GeneratedTeamReport[]
  reports: ReportDocument[]
  values: ExtractedValue[]
  selectedValueId: string
  scheduleActivities: ScheduleActivity[]
  scheduleRelationships: ScheduleRelationship[]
  scheduleImports: ScheduleImportBatch[]
  ingestionApplications?: IngestionApplySummary[]
  /** Append-only ledger of extraction postings (active + reversed). */
  ingestionPostings?: import('../engine/ingestionPosting').IngestionPosting[]
}

export type ProjectAction =
  | { type: 'HYDRATE'; payload: ProjectState }
  | { type: 'RESET'; payload: ProjectState }
  | { type: 'SET_META'; payload: Partial<ProjectMeta> }
  | { type: 'SET_SETTINGS'; payload: Partial<ProjectSettings> }
  | { type: 'SET_BASIS_OF_ESTIMATE'; payload: Partial<BasisOfEstimate> }
  | { type: 'SET_WBS_NODES'; payload: WbsNode[] }
  | { type: 'SET_COST_SHEET'; payload: CostRow[] }
  | { type: 'SET_DELIVERABLES'; payload: Deliverable[] }
  | { type: 'SET_CHANGES'; payload: ChangeItem[] }
  | { type: 'SET_RISKS'; payload: RiskItem[] }
  | { type: 'SET_OPPORTUNITIES'; payload: OpportunityItem[] }
  | { type: 'SET_ISSUES'; payload: IssueItem[] }
  | { type: 'SET_ACTIONS'; payload: ActionItem[] }
  | { type: 'SET_DECISIONS'; payload: DecisionLogEntry[] }
  | { type: 'SET_LESSONS'; payload: LessonLearned[] }
  | { type: 'SET_CLAIMS'; payload: ContractClaim[] }
  | { type: 'SET_VENDORS'; payload: Vendor[] }
  | { type: 'SET_PURCHASE_ORDERS'; payload: PurchaseOrder[] }
  | { type: 'SET_CONTRACTS'; payload: Contract[] }
  | { type: 'SET_RFQ_BIDS'; payload: RfqBid[] }
  | { type: 'SET_INVOICES'; payload: Invoice[] }
  | { type: 'SET_SUBCONTRACTS'; payload: Subcontract[] }
  | { type: 'SET_FIELD_DAILY_REPORTS'; payload: FieldDailyReport[] }
  | { type: 'SET_FIELD_OBSERVATIONS'; payload: FieldObservation[] }
  | { type: 'SET_TURNOVER_CHECKLISTS'; payload: TurnoverChecklist[] }
  | { type: 'SET_WORK_FRONTS'; payload: WorkFront[] }
  | { type: 'SET_PUNCH_LIST'; payload: PunchListItem[] }
  | { type: 'SET_CONTINGENCY_DRAWS'; payload: ContingencyDrawEntry[] }
  | { type: 'SET_CONTINGENCY_RULES'; payload: Partial<ContingencyDrawRule> }
  | { type: 'SET_FX_RATES'; payload: FxRate[] }
  | { type: 'SET_FX_SETTINGS'; payload: Partial<FxSettings> }
  | { type: 'SET_CONNECTORS'; payload: ConnectorConfig[] }
  | { type: 'UPDATE_CONNECTOR'; payload: ConnectorConfig }
  | { type: 'ADD_SYNC_JOB'; payload: SyncJobResult }
  | { type: 'SET_RULE_OF_CREDIT_TEMPLATES'; payload: RuleOfCreditTemplate[] }
  | { type: 'SET_PROGRESS_CREDITS'; payload: ProgressCreditEntry[] }
  | { type: 'UPDATE_PROGRESS_CREDIT'; payload: ProgressCreditEntry }
  | { type: 'SET_LONG_LEAD_ITEMS'; payload: LongLeadItem[] }
  | { type: 'SET_CBS_NODES'; payload: CbsNode[] }
  | { type: 'SET_BURDEN_RULES'; payload: BurdenRule[] }
  | { type: 'SET_COST_ACCRUALS'; payload: CostAccrualEntry[] }
  | { type: 'UPDATE_COST_ACCRUAL'; payload: CostAccrualEntry }
  | { type: 'RECONCILE_ACCRUALS' }
  | { type: 'SET_FORECAST_APPROVALS'; payload: ForecastApprovalPackage[] }
  | { type: 'UPDATE_FORECAST_APPROVAL'; payload: ForecastApprovalPackage }
  | { type: 'SUBMIT_FORECAST'; payload: { packageId: string; actor: string; comment?: string } }
  | { type: 'APPROVE_FORECAST'; payload: { packageId: string; actor: string; comment?: string } }
  | { type: 'REJECT_FORECAST'; payload: { packageId: string; actor: string; comment?: string } }
  | { type: 'CREATE_CHANGE'; payload: ChangeItem }
  | { type: 'SUBMIT_CHANGE'; payload: { changeId: string; actor: string; role: string; comment?: string } }
  | { type: 'DECIDE_CHANGE'; payload: { changeId: string; decision: 'approved' | 'rejected'; actor: string; role: string; comment?: string } }
  | { type: 'ADD_AUDIT'; payload: AuditLogEntry }
  | { type: 'ADD_GENERATED_REPORT'; payload: GeneratedTeamReport }
  | { type: 'SYNC_PORTFOLIO' }
  | { type: 'RECONCILE_CONTINGENCY' }
  | { type: 'SYNC_COMMITMENTS' }
  | { type: 'LOCK_REPORTING_PERIOD'; payload: { actor: string; period: string } }
  | { type: 'UNLOCK_REPORTING_PERIOD'; payload: { actor: string } }
  | { type: 'SUBMIT_CONTINGENCY_DRAW'; payload: { drawId: string; actor: string } }
  | { type: 'APPROVE_CONTINGENCY_DRAW'; payload: { drawId: string; actor: string } }
  | { type: 'SET_REPORTS'; payload: ReportDocument[] }
  | { type: 'SET_VALUES'; payload: ExtractedValue[] }
  | { type: 'SET_SELECTED_VALUE'; payload: string }
  | {
      type: 'IMPORT_SCHEDULE'
      payload: {
        batch: ScheduleImportBatch
        activities: ScheduleActivity[]
        relationships: ScheduleRelationship[]
      }
    }
  | { type: 'UPDATE_SCHEDULE_ACTIVITY_MAPPING'; payload: { activityId: string; wbs: string; actor: string } }
  | { type: 'APPLY_APPROVED_EXTRACTIONS'; payload: { actor: string } }

/** One approved extraction posted into the cost model during a bulk apply. */
export interface AppliedExtractionLine {
  valueId: string
  reportId: string
  field: string
  category: 'cost' | 'progress' | 'change' | 'procurement' | 'forecast'
  sourceWbs: string
  targetControlAccountWbs: string
  sccsComposite: string
  amountUsd: number
  effect: 'commitments' | 'eac' | 'eac_via_change'
}

/** Result of applying approved extractions — drives the close-home insight. */
export interface IngestionApplySummary {
  id: string
  at: string
  actor: string
  appliedCount: number
  skippedUnmappedCount: number
  eacBeforeUsd: number
  eacAfterUsd: number
  eacDeltaUsd: number
  commitmentsDeltaUsd: number
  changesCreated: number
  byReport: Array<{ reportId: string; reportName: string; count: number }>
  lines: AppliedExtractionLine[]
}

export interface ForecastRowSnapshot {
  wbs: string
  eacBase: number
  approvedChangesDelta: number
  pendingChangesExpectedDelta: number
  riskExposure: number
  contingencyDraw: number
  fxExposure: number
  eacBestCase: number
  eacMostLikely: number
  eacWorstCase: number
}

export interface ScenarioInputs {
  productivityFactor: number
  escalationRatePct: number
  scopeGrowthPct: number
  scheduleExtensionMonths: number
  changeApprovalProbability: number
  contingencyDrawPct: number
}

export const defaultScenarioInputs: ScenarioInputs = {
  productivityFactor: 1,
  escalationRatePct: 0,
  scopeGrowthPct: 0,
  scheduleExtensionMonths: 0,
  changeApprovalProbability: 0.65,
  contingencyDrawPct: 0,
}

export interface MonteCarloResult {
  p10: number
  p50: number
  p90: number
  samples: number[]
  drivers: Array<{ label: string; impact: number }>
}

export const defaultContingencyRules: ContingencyDrawRule = {
  autoDrawOnApprovedChange: true,
  drawPositiveChangesOnly: true,
  maxDrawPctOfReserve: 100,
  requireManagementReserveForChangesOver: 1_000_000,
}

export const defaultFxSettings: FxSettings = {
  reportingCurrency: 'USD',
  adverseMovePct: 5,
  includeFxInForecast: true,
}

export const seedFxRates: FxRate[] = [
  { id: 'FX-EUR', from: 'EUR', to: 'USD', rate: 1.08, effectiveDate: '2026-06-01', source: 'treasury' },
  { id: 'FX-GBP', from: 'GBP', to: 'USD', rate: 1.27, effectiveDate: '2026-06-01', source: 'treasury' },
  { id: 'FX-AED', from: 'AED', to: 'USD', rate: 0.27, effectiveDate: '2026-06-01', source: 'ecb' },
  { id: 'FX-SGD', from: 'SGD', to: 'USD', rate: 0.74, effectiveDate: '2026-06-01', source: 'ecb' },
]

export const defaultReportingPeriod: ReportingPeriodLock = {
  period: 'Jun-26',
  locked: false,
}

export const defaultProjectSettings: ProjectSettings = {
  eacScenario: 'eacMostLikely',
  loadingMethod: 'back_end',
  evmEacMethod: 'engine_most_likely',
  autoSyncFromRegisters: false,
  contingencyRules: defaultContingencyRules,
  fx: defaultFxSettings,
  reportingPeriod: defaultReportingPeriod,
}

export const defaultBasisOfEstimate: BasisOfEstimate = {
  scope: 'Process Area A expansion including mechanical, piping, procurement of rotating equipment, utilities, and commissioning readiness.',
  methodology: 'Bottom-up WBS estimate with vendor quotes for major equipment, benchmarked labour norms for installation, and AACE Class 3 accuracy target (±15%).',
  designBasis: 'IFC P&IDs Rev C, equipment datasheets Rev 2, owner corrosion management policy CM-2024-08.',
  allowances: '5% design growth allowance on engineering deliverables; 3% freight and logistics on imported rotating packages.',
  exclusions: 'Owner land acquisition, off-site infrastructure outside battery limit, and post-startup optimisation scope.',
  risksOpportunities: 'Key risks: vendor data lag, welder availability. Opportunities: modular pipe rack, utilities early energisation.',
  lastUpdated: '2026-06-10',
  preparedBy: 'Cost Engineering Lead',
}

export const seedDeliverables: Deliverable[] = [
  { id: 'DEL-001', number: 'ME-IFC-1201', title: 'P&ID Process Area A Rev C', discipline: 'Mechanical', phase: 'Engineering', weightPercent: 12, plannedProgress: 100, earnedProgress: 100, status: 'approved', dueDate: '2026-04-30', owner: 'Engineering Manager' },
  { id: 'DEL-002', number: 'PI-ISO-2200', title: 'Piping isometrics Area A batch 2', discipline: 'Piping', phase: 'Engineering', weightPercent: 18, plannedProgress: 92, earnedProgress: 84, status: 'in_progress', dueDate: '2026-06-25', owner: 'Piping Lead' },
  { id: 'DEL-003', number: 'EL-SLD-3300', title: 'Electrical single-line 33kV', discipline: 'Electrical', phase: 'Engineering', weightPercent: 10, plannedProgress: 88, earnedProgress: 88, status: 'submitted', dueDate: '2026-06-18', owner: 'Electrical Lead' },
  { id: 'DEL-004', number: 'IC-LOOP-1450', title: 'Instrument loop diagrams Unit 100', discipline: 'Instrumentation', phase: 'Engineering', weightPercent: 14, plannedProgress: 76, earnedProgress: 62, status: 'in_progress', dueDate: '2026-07-05', owner: 'I&C Lead' },
  { id: 'DEL-005', number: 'CV-FOUND-010', title: 'Equipment foundation design package', discipline: 'Civil', phase: 'Engineering', weightPercent: 8, plannedProgress: 100, earnedProgress: 96, status: 'in_progress', dueDate: '2026-05-30', owner: 'Civil Lead' },
]
