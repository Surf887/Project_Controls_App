// Project log registers (risk, issue, opportunity, change, action, decision, lessons learned).
// Modelled on ISO 31000 risk practices, AACE recommended practices, and Oracle Primavera Unifier
// / EcoSys log conventions. All values are illustrative seeded data.

export type RegisterStatus =
  | 'open'
  | 'in_progress'
  | 'mitigating'
  | 'closed'
  | 'rejected'
  | 'approved'
  | 'pending'
  | 'realised'
  | 'on_hold'

export type RiskCategory =
  | 'Schedule'
  | 'Cost'
  | 'Scope'
  | 'Procurement'
  | 'Construction'
  | 'Commissioning'
  | 'HSE'
  | 'Quality'
  | 'External'

export type Phase =
  | 'Engineering'
  | 'Procurement'
  | 'Construction'
  | 'Commissioning'
  | 'Cross-phase'

export type Likelihood = 1 | 2 | 3 | 4 | 5
export type Impact = 1 | 2 | 3 | 4 | 5

export interface RiskItem {
  id: string
  title: string
  category: RiskCategory
  phase: Phase
  description: string
  cause: string
  consequence: string
  preMitigationLikelihood: Likelihood
  preMitigationImpact: Impact
  postMitigationLikelihood: Likelihood
  postMitigationImpact: Impact
  costExposureUsd: number
  scheduleExposureDays: number
  mitigation: string
  contingency: string
  responseStrategy: string
  kri: string
  owner: string
  status: RegisterStatus
  reviewDate: string
}

export interface OpportunityItem {
  id: string
  title: string
  phase: Phase
  description: string
  enabler: string
  benefit: string
  likelihood: Likelihood
  impact: Impact
  costSavingUsd: number
  scheduleSavingDays: number
  enhancement: string
  owner: string
  status: RegisterStatus
  reviewDate: string
}

export interface IssueItem {
  id: string
  title: string
  phase: Phase
  description: string
  raisedAt: string
  raisedBy: string
  owner: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: RegisterStatus
  costImpactUsd: number
  scheduleImpactDays: number
  resolution: string
  dueDate: string
  linkedRiskId?: string
}

export type ChangeStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export type ChangeMechanism =
  | 'budget_change'
  | 'scope_change'
  | 'forecast_change'
  | 'forecast_variance'

/** EcoSys-aligned change mechanisms — separates budget moves from forecast-only variance. */
export const changeMechanismMeta: Record<
  ChangeMechanism,
  { label: string; affectsBudget: boolean; affectsForecast: boolean; guidance: string }
> = {
  budget_change: {
    label: 'Budget change',
    affectsBudget: true,
    affectsForecast: true,
    guidance: 'Formal budget transfer or addition — updates current budget and forecast when approved.',
  },
  scope_change: {
    label: 'Scope change',
    affectsBudget: true,
    affectsForecast: true,
    guidance: 'Scope variation (owner / regulatory / design) — never alters original budget baseline.',
  },
  forecast_change: {
    label: 'Forecast change',
    affectsBudget: false,
    affectsForecast: true,
    guidance: 'Re-plan for productivity, reroute, or re-estimate — forecast only until scope is formalised.',
  },
  forecast_variance: {
    label: 'Forecast variance',
    affectsBudget: false,
    affectsForecast: true,
    guidance: 'Monthly forecast submission delta — performance trend only; does not move approved budget.',
  },
}

export type ChangeType =
  | 'Scope'
  | 'Schedule'
  | 'Cost'
  | 'Quality'
  | 'Regulatory'
  | 'Owner-directed'

export type CostClass = 'CapEx' | 'OpEx' | 'Contingency' | 'Owner Cost' | 'Other'

export interface ChangeItem {
  id: string
  title: string
  phase: Phase
  type: ChangeType
  mechanism: ChangeMechanism
  costClass: CostClass
  description: string
  raisedAt: string
  raisedBy: string
  status: ChangeStatus
  costImpactUsd: number
  scheduleImpactDays: number
  probability: number
  affectedWbs: string[]
  rationale: string
  approver: string
  decisionDate?: string
  linkedRiskId?: string
  contractor: string
  approvalHistory?: import('../data/governance').ApprovalStep[]
}

export interface ActionItem {
  id: string
  title: string
  phase: Phase
  description: string
  owner: string
  raisedAt: string
  dueDate: string
  status: RegisterStatus
  priority: 'low' | 'medium' | 'high'
  source: 'Meeting' | 'Audit' | 'Risk review' | 'Change board' | 'Daily standup'
  linkedItemId?: string
}

export interface DecisionLogEntry {
  id: string
  title: string
  phase: Phase
  description: string
  decision: string
  alternativesConsidered: string
  decidedBy: string
  decidedAt: string
  status: 'approved' | 'pending' | 'rejected'
  cost: number
  rationale: string
}

export interface LessonLearned {
  id: string
  title: string
  phase: Phase
  category: 'What went well' | 'What went wrong' | 'Recommendation'
  description: string
  recommendation: string
  applicability: 'This project' | 'Programme' | 'Enterprise'
  capturedBy: string
  capturedAt: string
  status: 'draft' | 'published'
}

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'negotiating'
  | 'approved'
  | 'rejected'
  | 'settled'

export interface ContractClaim {
  id: string
  title: string
  contractor: string
  contractRef: string
  wbs: string
  phase: Phase
  description: string
  entitlementBasis: string
  costExposureUsd: number
  submittedAt: string
  status: ClaimStatus
  owner: string
  linkedChangeId?: string
}

export function riskScore(likelihood: Likelihood, impact: Impact): number {
  return likelihood * impact
}

export function riskBand(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 20) return 'critical'
  if (score >= 12) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

// ----- Seeded registers -----

export const riskRegister: RiskItem[] = [
  {
    id: 'R-001',
    title: 'Vendor data late for separator V-1310',
    category: 'Procurement',
    phase: 'Procurement',
    description: 'Vendor mechanical drawings trending 4 weeks behind contractual milestone.',
    cause: 'Vendor sub-supplier change after PO award',
    consequence: 'Fabrication start delay on Process Area A pipe rack',
    preMitigationLikelihood: 4,
    preMitigationImpact: 4,
    postMitigationLikelihood: 3,
    postMitigationImpact: 3,
    costExposureUsd: 1_800_000,
    scheduleExposureDays: 18,
    mitigation: 'Daily vendor expediting; embed inspector at vendor works.',
    contingency: 'Parallel-fabricate spool tie-ins to recover float.',
    responseStrategy: 'Mitigate — expedite and embed inspector',
    kri: 'Vendor data milestone slip (days)',
    owner: 'Procurement Lead',
    status: 'mitigating',
    reviewDate: '2026-06-18',
  },
  {
    id: 'R-002',
    title: 'Welder availability shortfall',
    category: 'Construction',
    phase: 'Construction',
    description: 'Coded TIG welders below ramp-up curve forecast.',
    cause: 'Regional labour market tightness',
    consequence: 'Mechanical install productivity drop > 15% in Aug.',
    preMitigationLikelihood: 4,
    preMitigationImpact: 5,
    postMitigationLikelihood: 3,
    postMitigationImpact: 4,
    costExposureUsd: 4_200_000,
    scheduleExposureDays: 24,
    mitigation: 'Mobilise overseas subcontractor; uplift welder rates.',
    contingency: 'Shift non-critical work to back shift; pre-fab off-site.',
    responseStrategy: 'Mitigate — mobilise additional welders',
    kri: 'Weekly welder headcount vs plan',
    owner: 'Construction Manager',
    status: 'open',
    reviewDate: '2026-06-15',
  },
  {
    id: 'R-003',
    title: 'Loop test inefficiency from late I&C punch list closure',
    category: 'Commissioning',
    phase: 'Commissioning',
    description: 'Instrumentation punch list closure trending slower than plan.',
    cause: 'Late loop drawing as-builts',
    consequence: 'Delayed start-up readiness milestone',
    preMitigationLikelihood: 3,
    preMitigationImpact: 4,
    postMitigationLikelihood: 2,
    postMitigationImpact: 3,
    costExposureUsd: 1_100_000,
    scheduleExposureDays: 9,
    mitigation: 'Embed commissioning engineers in I&C punch-list reviews.',
    contingency: 'Pre-energise non-critical loops in parallel.',
    responseStrategy: 'Mitigate — embed commissioning in punch reviews',
    kri: 'Open I&C punch A count trend',
    owner: 'Commissioning Lead',
    status: 'open',
    reviewDate: '2026-06-22',
  },
  {
    id: 'R-004',
    title: 'FX exposure on EUR-denominated rotating equipment',
    category: 'External',
    phase: 'Procurement',
    description: 'Open EUR/USD exposure on un-hedged portion of rotating PO.',
    cause: 'Hedging policy lag',
    consequence: 'Up to 6% adverse FX impact on remaining PO milestones',
    preMitigationLikelihood: 3,
    preMitigationImpact: 3,
    postMitigationLikelihood: 2,
    postMitigationImpact: 2,
    costExposureUsd: 920_000,
    scheduleExposureDays: 0,
    mitigation: 'Roll forward FX hedge through treasury.',
    contingency: 'Pass-through claim under FX clause if hedging delayed.',
    responseStrategy: 'Transfer — treasury hedge roll-forward',
    kri: 'Unhedged EUR exposure (USD)',
    owner: 'Project Controls',
    status: 'mitigating',
    reviewDate: '2026-06-12',
  },
]

export const opportunityRegister: OpportunityItem[] = [
  {
    id: 'O-001',
    title: 'Modularise pipe rack Area A',
    phase: 'Construction',
    description: 'Switch from stick-build to off-site modular fabrication on northern rack.',
    enabler: 'Yard slot confirmed by fabrication subcontractor',
    benefit: 'Reduce site man-hours; parallelise schedule path.',
    likelihood: 4,
    impact: 4,
    costSavingUsd: 2_600_000,
    scheduleSavingDays: 14,
    enhancement: 'Lock fabrication slot before next change board.',
    owner: 'Construction Manager',
    status: 'approved',
    reviewDate: '2026-06-20',
  },
  {
    id: 'O-002',
    title: 'Reuse approved IFC piping spec for offsites',
    phase: 'Engineering',
    description: 'Adopt approved Area A spec on offsites scope to avoid re-review.',
    enabler: 'Owner specification harmonisation board',
    benefit: 'Reduce engineering rework hours by ~3,500.',
    likelihood: 3,
    impact: 3,
    costSavingUsd: 480_000,
    scheduleSavingDays: 6,
    enhancement: 'Issue waiver request to owner standards committee.',
    owner: 'Engineering Manager',
    status: 'pending',
    reviewDate: '2026-06-25',
  },
  {
    id: 'O-003',
    title: 'Energise utilities ahead of plan',
    phase: 'Commissioning',
    description: 'Bring utilities live three weeks early to support pre-commissioning loop tests.',
    enabler: 'Utility tie-in complete ahead of plan',
    benefit: 'De-risk commissioning critical path.',
    likelihood: 4,
    impact: 5,
    costSavingUsd: 0,
    scheduleSavingDays: 21,
    enhancement: 'Owner permit-to-energise fast track.',
    owner: 'Commissioning Lead',
    status: 'in_progress',
    reviewDate: '2026-06-18',
  },
]

export const issueRegister: IssueItem[] = [
  {
    id: 'I-001',
    title: 'Tank farm dyke wall rework',
    phase: 'Construction',
    description: 'QC NCR on dyke wall pour - cover requirements failed.',
    raisedAt: '2026-06-04',
    raisedBy: 'QC Inspector A',
    owner: 'Construction Manager',
    severity: 'high',
    status: 'in_progress',
    costImpactUsd: 720_000,
    scheduleImpactDays: 5,
    resolution: 'Demolish and re-pour affected 18m section; revise inspection plan.',
    dueDate: '2026-06-21',
  },
  {
    id: 'I-002',
    title: 'Vendor data missing for E-1502',
    phase: 'Procurement',
    description: 'Datasheet revision 3 missing fouling factor approval.',
    raisedAt: '2026-06-06',
    raisedBy: 'Process Engineer',
    owner: 'Procurement Lead',
    severity: 'medium',
    status: 'open',
    costImpactUsd: 80_000,
    scheduleImpactDays: 3,
    resolution: 'Awaiting vendor confirmation by 2026-06-20.',
    dueDate: '2026-06-20',
    linkedRiskId: 'R-001',
  },
  {
    id: 'I-003',
    title: 'Incorrect tag on F.O. transmitter',
    phase: 'Commissioning',
    description: 'FT-1450 nameplate does not match loop drawing.',
    raisedAt: '2026-06-08',
    raisedBy: 'Commissioning Engineer',
    owner: 'I&C Lead',
    severity: 'low',
    status: 'closed',
    costImpactUsd: 15_000,
    scheduleImpactDays: 1,
    resolution: 'Replaced nameplate; updated as-built register.',
    dueDate: '2026-06-10',
  },
]

export const changeRegister: ChangeItem[] = [
  {
    id: 'CO-001',
    title: 'Owner-directed pipe spec uplift Area A',
    phase: 'Engineering',
    type: 'Scope',
    mechanism: 'scope_change',
    costClass: 'CapEx',
    description: 'Upgrade 6" CS-150 piping in cooling water to CS-300 across Area A.',
    raisedAt: '2026-05-12',
    raisedBy: 'Owner Engineering',
    status: 'approved',
    costImpactUsd: 1_240_000,
    scheduleImpactDays: 6,
    probability: 1,
    affectedWbs: ['A.02', 'A.02.01'],
    rationale: 'Aligns with corrosion management policy.',
    approver: 'Project Director',
    decisionDate: '2026-05-30',
    contractor: 'Gulf Modular Contractors',
  },
  {
    id: 'CO-002',
    title: 'Additional fire suppression - Utilities',
    phase: 'Construction',
    type: 'Regulatory',
    mechanism: 'scope_change',
    costClass: 'CapEx',
    description: 'Regulatory uplift requires extra FW deluge on Utility Building.',
    raisedAt: '2026-05-28',
    raisedBy: 'HSE Lead',
    status: 'pending',
    costImpactUsd: 860_000,
    scheduleImpactDays: 4,
    probability: 0.65,
    affectedWbs: ['U.02'],
    rationale: 'Regulator clarification dated 2026-05-20.',
    approver: 'Project Director',
    contractor: 'Northfield Construction',
    linkedRiskId: 'R-002',
  },
  {
    id: 'CO-003',
    title: 'Compressor weight uplift change',
    phase: 'Procurement',
    type: 'Cost',
    mechanism: 'scope_change',
    costClass: 'CapEx',
    description: 'Heavier vendor selection adds crane and foundation cost.',
    raisedAt: '2026-06-02',
    raisedBy: 'Procurement Lead',
    status: 'under_review',
    costImpactUsd: 540_000,
    scheduleImpactDays: 2,
    probability: 0.5,
    affectedWbs: ['P.04', 'A.01.02'],
    rationale: 'Mitigates schedule risk from rotating PO.',
    approver: 'Change Board',
    contractor: 'Delta Equipment JV',
  },
  {
    id: 'CO-004',
    title: 'Add operator training simulator (OpEx)',
    phase: 'Commissioning',
    type: 'Scope',
    mechanism: 'scope_change',
    costClass: 'OpEx',
    description: 'Provide operator simulator for startup readiness.',
    raisedAt: '2026-06-05',
    raisedBy: 'Operations Readiness',
    status: 'submitted',
    costImpactUsd: 320_000,
    scheduleImpactDays: 0,
    probability: 0.4,
    affectedWbs: ['O.99.10'],
    rationale: 'Reduces startup learning curve.',
    approver: 'Operations',
    contractor: 'Owner Direct',
  },
  {
    id: 'CO-005',
    title: 'Delete redundant standby cooler',
    phase: 'Engineering',
    type: 'Scope',
    mechanism: 'scope_change',
    costClass: 'CapEx',
    description: 'Remove duplicate standby cooler E-1503 from offsites scope.',
    raisedAt: '2026-05-22',
    raisedBy: 'Engineering Manager',
    status: 'approved',
    costImpactUsd: -680_000,
    scheduleImpactDays: -3,
    probability: 1,
    affectedWbs: ['U.02'],
    rationale: 'Process review removed standby duty requirement.',
    approver: 'Project Director',
    decisionDate: '2026-06-01',
    contractor: 'Owner Direct',
  },
  {
    id: 'CO-006',
    title: 'Defer non-critical instrument upgrade',
    phase: 'Commissioning',
    type: 'Cost',
    mechanism: 'scope_change',
    costClass: 'CapEx',
    description: 'Defer secondary safety system upgrade beyond first oil.',
    raisedAt: '2026-06-09',
    raisedBy: 'Engineering Manager',
    status: 'rejected',
    costImpactUsd: -240_000,
    scheduleImpactDays: 0,
    probability: 0,
    affectedWbs: [],
    rationale: 'Rejected by HSE on safety basis.',
    approver: 'Project Director',
    decisionDate: '2026-06-12',
    contractor: 'Owner Direct',
  },
  {
    id: 'CO-007',
    title: 'Jun-26 productivity uplift — piping crews',
    phase: 'Construction',
    type: 'Cost',
    mechanism: 'forecast_variance',
    costClass: 'CapEx',
    description: 'Monthly forecast variance from improved piping productivity; no scope change.',
    raisedAt: '2026-06-10',
    raisedBy: 'Cost Engineer',
    status: 'approved',
    costImpactUsd: -420_000,
    scheduleImpactDays: 0,
    probability: 1,
    affectedWbs: ['A.02'],
    rationale: 'VOWD trending ahead of plan; FTC reduced on Area A piping.',
    approver: 'Project Director',
    decisionDate: '2026-06-12',
    contractor: 'Gulf Modular Contractors',
  },
]

export const actionRegister: ActionItem[] = [
  {
    id: 'A-001',
    title: 'Confirm vendor data recovery plan',
    phase: 'Procurement',
    description: 'Procurement lead to align with vendor on revised dates.',
    owner: 'Procurement Lead',
    raisedAt: '2026-06-08',
    dueDate: '2026-06-15',
    status: 'in_progress',
    priority: 'high',
    source: 'Risk review',
    linkedItemId: 'R-001',
  },
  {
    id: 'A-002',
    title: 'Issue waiver for piping spec reuse',
    phase: 'Engineering',
    description: 'Engineering lead to request standards waiver.',
    owner: 'Engineering Manager',
    raisedAt: '2026-06-09',
    dueDate: '2026-06-20',
    status: 'open',
    priority: 'medium',
    source: 'Change board',
    linkedItemId: 'O-002',
  },
  {
    id: 'A-003',
    title: 'Re-pour Tank Farm dyke section',
    phase: 'Construction',
    description: 'Construction to demolish and re-pour affected section.',
    owner: 'Construction Manager',
    raisedAt: '2026-06-04',
    dueDate: '2026-06-21',
    status: 'in_progress',
    priority: 'high',
    source: 'Audit',
    linkedItemId: 'I-001',
  },
  {
    id: 'A-004',
    title: 'Update commissioning loop register',
    phase: 'Commissioning',
    description: 'Add new loops following spec uplift.',
    owner: 'Commissioning Lead',
    raisedAt: '2026-06-10',
    dueDate: '2026-06-25',
    status: 'open',
    priority: 'medium',
    source: 'Meeting',
  },
]

export const decisionLog: DecisionLogEntry[] = [
  {
    id: 'D-001',
    title: 'Adopt EcoSys-style cost sheet for owner team',
    phase: 'Cross-phase',
    description: 'Project controls to standardise on EcoSys-style WBS-rolled cost sheet.',
    decision: 'Approved',
    alternativesConsidered: 'Excel master, custom internal sheet, retained Primavera Unifier rollup.',
    decidedBy: 'Project Director',
    decidedAt: '2026-04-20',
    status: 'approved',
    cost: 0,
    rationale: 'Consistent rollup, auditability, integration with forecast engine.',
  },
  {
    id: 'D-002',
    title: 'Approve Area A modularisation',
    phase: 'Construction',
    description: 'Switch to off-site modularisation on Area A pipe rack.',
    decision: 'Approved',
    alternativesConsidered: 'Continue stick-build with overtime; subcontractor uplift.',
    decidedBy: 'Project Director',
    decidedAt: '2026-05-30',
    status: 'approved',
    cost: -2_600_000,
    rationale: 'Schedule recovery + cost saving.',
  },
  {
    id: 'D-003',
    title: 'Hold on Compressor weight uplift change',
    phase: 'Procurement',
    description: 'Pending vendor confirmation on revised foundation cost.',
    decision: 'Pending',
    alternativesConsidered: 'Approve provisional uplift; reject and rebid.',
    decidedBy: 'Change Board',
    decidedAt: '2026-06-04',
    status: 'pending',
    cost: 540_000,
    rationale: 'Awaiting confirmed quotation.',
  },
]

export const lessonsLearned: LessonLearned[] = [
  {
    id: 'L-001',
    title: 'Early vendor expediting reduced data lag',
    phase: 'Procurement',
    category: 'What went well',
    description: 'Embedded inspector at vendor cut data-lag by 60%.',
    recommendation: 'Mandate embedded expediters for long-lead packages > $5M.',
    applicability: 'Programme',
    capturedBy: 'Procurement Lead',
    capturedAt: '2026-05-30',
    status: 'published',
  },
  {
    id: 'L-002',
    title: 'Late owner spec change cost rework',
    phase: 'Engineering',
    category: 'What went wrong',
    description: 'Owner-directed spec uplift introduced after IFC drove rework.',
    recommendation: 'Lock spec waivers before IFC issue; block changes via spec review board.',
    applicability: 'Enterprise',
    capturedBy: 'Engineering Manager',
    capturedAt: '2026-05-30',
    status: 'published',
  },
  {
    id: 'L-003',
    title: 'Daily reality-capture vs progress claim',
    phase: 'Construction',
    category: 'Recommendation',
    description: 'Daily drone capture helped detect progress overstatement early.',
    recommendation: 'Adopt drone-cadenced reconciliation as default control on civil packages.',
    applicability: 'This project',
    capturedBy: 'Project Controls',
    capturedAt: '2026-06-05',
    status: 'draft',
  },
]

export const contractClaims: ContractClaim[] = [
  {
    id: 'CLM-001',
    title: 'Welder productivity disruption — Area A pipe rack',
    contractor: 'Gulf Modular Contractors',
    contractRef: 'SC-2201',
    wbs: 'A.02',
    phase: 'Construction',
    description: 'Contractor claims additional cost for re-sequencing due to vendor data delay on V-1310.',
    entitlementBasis: 'Clause 14.3 — owner-caused delay to predecessor work',
    costExposureUsd: 1_450_000,
    submittedAt: '2026-06-08',
    status: 'under_review',
    owner: 'Contract Engineer',
    linkedChangeId: 'CO-002',
  },
  {
    id: 'CLM-002',
    title: 'FX pass-through on rotating equipment PO',
    contractor: 'Delta Equipment JV',
    contractRef: 'PO-2010',
    wbs: 'P.04',
    phase: 'Procurement',
    description: 'Claim for adverse EUR/USD movement on unhedged PO milestones.',
    entitlementBasis: 'Contract FX adjustment clause — treasury hedge lag',
    costExposureUsd: 920_000,
    submittedAt: '2026-06-04',
    status: 'negotiating',
    owner: 'Project Controls',
  },
  {
    id: 'CLM-003',
    title: 'Additional crane standby — compressor set',
    contractor: 'Northfield Construction',
    contractRef: 'SC-2205',
    wbs: 'A.01.02',
    phase: 'Construction',
    description: 'Standby crane charges during foundation rework after weight uplift.',
    entitlementBasis: 'Variation pending — CO-003 under review',
    costExposureUsd: 380_000,
    submittedAt: '2026-06-11',
    status: 'submitted',
    owner: 'Contract Engineer',
    linkedChangeId: 'CO-003',
  },
]
