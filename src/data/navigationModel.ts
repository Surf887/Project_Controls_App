/**
 * Navigation follows AACE Total Cost Management (project control process cycle)
 * for oil & gas capital projects — not a copy of EcoSys/Unifier module trees.
 *
 * Known flaws we deliberately avoid:
 * - EcoSys/Unifier: progress (VOWD) siloed from cost close → we group VOWD + EVM together
 * - EcoSys: budget change vs forecast variance conflated → change mechanism types in register
 * - Unifier: commitments, LLI, FX in separate menus → single commitments & delivery group
 * - Legacy PMIS: risk register disconnected from change board → combined governance group
 * - Unifier: contractor variations captured late → contractor submissions group upfront in cycle
 */

export type NavView =
  | 'dashboard'
  | 'wbs'
  | 'basis'
  | 'engineering-phase'
  | 'procurement'
  | 'construction'
  | 'commissioning'
  | 'costsheet'
  | 'changes'
  | 'forecast-engine'
  | 'forecast-whatif'
  | 'risks'
  | 'opportunities'
  | 'issues'
  | 'claims'
  | 'actions'
  | 'decisions-log'
  | 'lessons'
  | 'contingency'
  | 'forex'
  | 'integrations'
  | 'portfolio'
  | 'forecast-approval'
  | 'team-reports'
  | 'audit-trail'
  | 'accruals'
  | 'cost-structure'
  | 'sccs'
  | 'schedule'
  | 'rules-of-credit'
  | 'long-lead'
  | 'ingestion'
  | 'review'
  | 'validation'
  | 'lineage'
  | 'controls'
  | 'predictive'
  | 'engineering'
  | 'model'
  | 'reality'
  | 'governance'
  | 'decisions'

export interface NavItem {
  id: NavView
  label: string
  eyebrow: string
}

export interface NavGroup {
  group: string
  /** Why this group exists — O&G / AACE practitioner rationale */
  rationale: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    group: 'Programme overview',
    rationale: 'Owner / PMO view — portfolio and project health',
    items: [
      { id: 'dashboard', label: 'Command Center', eyebrow: 'CCE · EAC · CPI/SPI snapshot' },
      { id: 'portfolio', label: 'Portfolio Compare', eyebrow: 'Benchmark across assets' },
    ],
  },
  {
    group: 'Estimate & baseline',
    rationale: 'Sanction baseline (MCE → CCE) — locked before execution',
    items: [
      { id: 'basis', label: 'Basis of Estimate', eyebrow: 'AACE 34R-05 · scope & class' },
      { id: 'wbs', label: 'WBS Manager', eyebrow: 'Control accounts · CapEx tags' },
      { id: 'cost-structure', label: 'Cost Structure', eyebrow: 'CBS · TECOP/NTR · burden' },
      { id: 'sccs', label: 'ISO 19008 SCCS', eyebrow: 'PBS · SAB · COR · mapping' },
    ],
  },
  {
    group: 'Schedule control',
    rationale: 'P6 baseline, current programme, critical path, and control-account integration',
    items: [
      { id: 'schedule', label: 'Integrated Schedule', eyebrow: 'P6 · critical path · cost linkage' },
    ],
  },
  {
    group: 'Monthly control cycle',
    rationale: 'Period close: accruals → economic actuals → reserves → forecast sign-off',
    items: [
      { id: 'accruals', label: 'Accruals', eyebrow: 'VOWD vs invoice gap' },
      { id: 'costsheet', label: 'Cost Sheet', eyebrow: 'Original · current · actuals · EAC' },
      { id: 'contingency', label: 'Contingency & MR', eyebrow: 'CN.00 draw · MR.00 gate' },
      { id: 'forecast-engine', label: 'Forecast Engine', eyebrow: 'CCE roll-forward' },
      { id: 'forecast-approval', label: 'Forecast Approval', eyebrow: 'Lock monthly EAC package' },
      { id: 'forecast-whatif', label: 'What-if & Monte Carlo', eyebrow: 'P10/P50/P90 · tornado' },
    ],
  },
  {
    group: 'VOWD & performance',
    rationale: 'Physical progress drives earned value — not after-the-fact finance only',
    items: [
      { id: 'rules-of-credit', label: 'Rules of Credit', eyebrow: 'Earned % by discipline' },
      { id: 'controls', label: 'EVM & S-curve', eyebrow: 'BAC · EV · AC · VAC' },
      { id: 'predictive', label: 'Predictive Signals', eyebrow: 'Trend & early warning' },
    ],
  },
  {
    group: 'Commitments & delivery',
    rationale: 'PO · LLI · FX as one commitment exposure picture',
    items: [
      { id: 'long-lead', label: 'Long-Lead Items', eyebrow: 'Critical path materials' },
      { id: 'procurement', label: 'Procurement', eyebrow: 'RFQ · contract · PO · invoice' },
      { id: 'forex', label: 'FX & Hedging', eyebrow: 'Commitment currency risk' },
    ],
  },
  {
    group: 'Change & risk board',
    rationale: 'Change board + ISO 31000 — linked, not separate silos',
    items: [
      { id: 'changes', label: 'Change Register', eyebrow: 'Budget vs forecast variance types' },
      { id: 'claims', label: 'Contract Claims', eyebrow: 'Disputes · entitlement · exposure' },
      { id: 'risks', label: 'Risk Register', eyebrow: 'TECOP · residual exposure' },
      { id: 'opportunities', label: 'Opportunities', eyebrow: 'Upside to CCE' },
      { id: 'decisions-log', label: 'Decision Log', eyebrow: 'Change board minutes' },
    ],
  },
  {
    group: 'Project logs',
    rationale: 'Issues and actions supporting the control cycle',
    items: [
      { id: 'issues', label: 'Issues Log', eyebrow: 'Realised events' },
      { id: 'actions', label: 'Action Items', eyebrow: 'RACI from reviews' },
      { id: 'lessons', label: 'Lessons Learned', eyebrow: 'Closeout capture' },
    ],
  },
  {
    group: 'EPC execution',
    rationale: 'Discipline workspaces — engineering through commissioning',
    items: [
      { id: 'engineering-phase', label: 'Engineering', eyebrow: 'Deliverables · IFC progress' },
      { id: 'construction', label: 'Construction', eyebrow: 'Subcontracts · field · RoC' },
      { id: 'commissioning', label: 'Commissioning', eyebrow: 'MC · punch · turnover' },
    ],
  },
  {
    group: 'Contractor submissions',
    rationale: 'Early variation capture — contractor data before month-end close',
    items: [
      { id: 'ingestion', label: 'Ingestion', eyebrow: 'Progress & cost CSVs' },
      { id: 'review', label: 'Review Desk', eyebrow: 'Human-in-the-loop QA' },
      { id: 'validation', label: 'Validation', eyebrow: 'Mapping rules' },
      { id: 'lineage', label: 'Lineage', eyebrow: 'Source traceability' },
    ],
  },
  {
    group: 'Reporting & traceability',
    rationale: 'Audience-specific packs and immutable workflow history',
    items: [
      { id: 'team-reports', label: 'Team Reports', eyebrow: 'CSV by stakeholder' },
      { id: 'audit-trail', label: 'Audit Trail', eyebrow: 'Forecast · change · settings' },
    ],
  },
  {
    group: 'Platform admin',
    rationale: 'Integrations and extended intelligence modules',
    items: [
      { id: 'integrations', label: 'Connectors', eyebrow: 'SAP · P6 · SharePoint' },
      { id: 'governance', label: 'Governance', eyebrow: 'Workflow thresholds' },
      { id: 'engineering', label: 'Engineering Intel', eyebrow: 'Tags & lines' },
      { id: 'model', label: 'Model Intel', eyebrow: 'IFC linkage' },
      { id: 'reality', label: 'Reality Capture', eyebrow: '4D vs plan' },
      { id: 'decisions', label: 'Product Strategy', eyebrow: 'Roadmap' },
    ],
  },
]

export const defaultCollapsedGroups: Record<string, boolean> = {
  'Contractor submissions': true,
  'Platform admin': true,
}
