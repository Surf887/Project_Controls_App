export type ReportStatus = 'received' | 'classified' | 'extracted' | 'reviewing' | 'approved'
export type ReviewStatus = 'pending_review' | 'needs_correction' | 'approved'
export type ApprovalStatus = 'unapproved' | 'approved' | 'rejected'
export type ValidationResult = 'pass' | 'warning' | 'fail'
export type SourceType = 'excel' | 'pdf' | 'powerpoint' | 'email'

export interface ReportDocument {
  id: string
  name: string
  contractor: string
  packageName: string
  period: string
  sourceType: SourceType
  receivedAt: string
  status: ReportStatus
  confidence: number
  extractedCount: number
  issueCount: number
  sourceSystem: string
}

export interface ValidationIssue {
  severity: 'info' | 'warning' | 'critical'
  message: string
}

export interface CorrectionEntry {
  at: string
  by: string
  from: string
  to: string
  reason: string
}

export interface SourceReference {
  document: string
  page?: number
  sheet?: string
  table: string
  row: string
  column: string
  anchor: string
}

export interface ExtractedValue {
  id: string
  reportId: string
  field: string
  category: 'cost' | 'progress' | 'change' | 'procurement' | 'forecast'
  rawValue: string
  normalizedValue: number
  unit: string
  period: string
  wbs: string
  cbs: string
  standardMapping: string
  /** ISO 19008 SCCS composite — mapped from WBS/CBS/category or imported from CSV. */
  sccs?: import('./sccs').SccsAssignment
  confidence: number
  reviewStatus: ReviewStatus
  approvalStatus: ApprovalStatus
  reviewer: string
  owner: string
  source: SourceReference
  validationIssues: ValidationIssue[]
  correctionHistory: CorrectionEntry[]
  /** Set once the approved value has been posted into the cost model. */
  applied?: boolean
  appliedAt?: string
}

export interface ValidationRule {
  id: string
  name: string
  description: string
  result: ValidationResult
  affectedFields: string[]
}

export interface RoadmapItem {
  phase: 'MVP' | 'V1' | 'V2' | 'Enterprise' | 'Long-term'
  item: string
  trigger: string
}

export interface DecisionRecord {
  id: string
  decision: string
  choice: string
  rejectedAlternative: string
  evidenceTag: '[known]' | '[inference]' | '[assumption]'
  confidence: 'High' | 'Medium' | 'Low'
}

export const reportDocuments: ReportDocument[] = [
  {
    id: 'rpt-001',
    name: 'Weekly Cost & Progress Report - Area A.xlsx',
    contractor: 'Gulf Modular Contractors',
    packageName: 'Process Area A',
    period: '2026-W23',
    sourceType: 'excel',
    receivedAt: '2026-06-08 08:42',
    status: 'reviewing',
    confidence: 0.86,
    extractedCount: 42,
    issueCount: 4,
    sourceSystem: 'Email attachment',
  },
  {
    id: 'rpt-002',
    name: 'Procurement Status Pack - Rotating Equipment.pdf',
    contractor: 'Delta Equipment JV',
    packageName: 'Rotating Equipment',
    period: '2026-W23',
    sourceType: 'pdf',
    receivedAt: '2026-06-08 10:14',
    status: 'extracted',
    confidence: 0.78,
    extractedCount: 27,
    issueCount: 7,
    sourceSystem: 'Aconex export',
  },
  {
    id: 'rpt-003',
    name: 'Management Progress Deck - Utilities.pptx',
    contractor: 'Northfield Construction',
    packageName: 'Utilities and Offsites',
    period: '2026-W23',
    sourceType: 'powerpoint',
    receivedAt: '2026-06-09 12:21',
    status: 'classified',
    confidence: 0.71,
    extractedCount: 18,
    issueCount: 6,
    sourceSystem: 'SharePoint folder',
  },
]

export const extractedValues: ExtractedValue[] = [
  {
    id: 'val-001',
    reportId: 'rpt-001',
    field: 'Current Forecast EAC',
    category: 'forecast',
    rawValue: 'USD 247.8M',
    normalizedValue: 247800000,
    unit: 'USD',
    period: '2026-W23',
    wbs: 'A.01.03',
    cbs: 'C-3100',
    standardMapping: 'AACE TCM cost account mapping',
    confidence: 0.94,
    reviewStatus: 'approved',
    approvalStatus: 'approved',
    reviewer: 'Maya Chen',
    owner: 'Cost Control',
    source: {
      document: 'Weekly Cost & Progress Report - Area A.xlsx',
      sheet: 'Cost Summary',
      table: 'Forecast by WBS',
      row: '18',
      column: 'Current EAC',
      anchor: 'Process Area A / Mechanical / EAC',
    },
    validationIssues: [],
    correctionHistory: [
      {
        at: '2026-06-09 09:11',
        by: 'Maya Chen',
        from: 'USD 247.9M',
        to: 'USD 247.8M',
        reason: 'Rounded extraction corrected against spreadsheet cell value.',
      },
    ],
    applied: true,
    appliedAt: '2026-06-09 09:15',
  },
  {
    id: 'val-002',
    reportId: 'rpt-001',
    field: 'Physical Progress',
    category: 'progress',
    rawValue: '68.5%',
    normalizedValue: 68.5,
    unit: '%',
    period: '2026-W23',
    wbs: 'A.01.03',
    cbs: 'N/A',
    standardMapping: 'Owner WBS progress account',
    confidence: 0.89,
    reviewStatus: 'pending_review',
    approvalStatus: 'unapproved',
    reviewer: 'Unassigned',
    owner: 'Progress Measurement',
    source: {
      document: 'Weekly Cost & Progress Report - Area A.xlsx',
      sheet: 'Progress',
      table: 'Earned progress by discipline',
      row: '34',
      column: 'Cumulative %',
      anchor: 'Mechanical / Installed quantities',
    },
    validationIssues: [
      {
        severity: 'warning',
        message: 'Progress increased 7.8 points while installed quantity increased 3.1 points.',
      },
    ],
    correctionHistory: [],
  },
  {
    id: 'val-003',
    reportId: 'rpt-002',
    field: 'Committed Cost',
    category: 'cost',
    rawValue: '$92,150,000',
    normalizedValue: 92150000,
    unit: 'USD',
    period: '2026-W23',
    wbs: 'P.04.01',
    cbs: 'C-5200',
    standardMapping: 'Procurement equipment package',
    confidence: 0.83,
    reviewStatus: 'pending_review',
    approvalStatus: 'unapproved',
    reviewer: 'Unassigned',
    owner: 'Procurement Controls',
    source: {
      document: 'Procurement Status Pack - Rotating Equipment.pdf',
      page: 7,
      table: 'Commitment summary',
      row: 'Rotating Equipment',
      column: 'Committed to Date',
      anchor: 'PO register extract, vendor commitment total',
    },
    validationIssues: [
      {
        severity: 'info',
        message: 'Currency normalized to USD using report header currency declaration.',
      },
    ],
    correctionHistory: [],
  },
  {
    id: 'val-004',
    reportId: 'rpt-002',
    field: 'Late Purchase Orders',
    category: 'procurement',
    rawValue: '14',
    normalizedValue: 14,
    unit: 'count',
    period: '2026-W23',
    wbs: 'P.04.01',
    cbs: 'N/A',
    standardMapping: 'Procurement expediting KPI',
    confidence: 0.73,
    reviewStatus: 'needs_correction',
    approvalStatus: 'rejected',
    reviewer: 'Omar Haddad',
    owner: 'Procurement Controls',
    source: {
      document: 'Procurement Status Pack - Rotating Equipment.pdf',
      page: 12,
      table: 'Expediting dashboard',
      row: 'PO late delivery',
      column: 'Current',
      anchor: 'Vendor status cards',
    },
    validationIssues: [
      {
        severity: 'critical',
        message: 'Extracted count conflicts with appendix PO register total of 11.',
      },
    ],
    correctionHistory: [
      {
        at: '2026-06-09 14:22',
        by: 'Omar Haddad',
        from: '14',
        to: 'Needs source check',
        reason: 'Dashboard figure may include closed POs; appendix count appears active-only.',
      },
    ],
  },
  {
    id: 'val-005',
    reportId: 'rpt-003',
    field: 'Approved Change Orders',
    category: 'change',
    rawValue: 'USD 18.4M',
    normalizedValue: 18400000,
    unit: 'USD',
    period: '2026-W23',
    wbs: 'U.02.00',
    cbs: 'C-9000',
    standardMapping: 'Change control log',
    confidence: 0.69,
    reviewStatus: 'pending_review',
    approvalStatus: 'unapproved',
    reviewer: 'Unassigned',
    owner: 'Change Management',
    source: {
      document: 'Management Progress Deck - Utilities.pptx',
      page: 16,
      table: 'Change summary slide',
      row: 'Approved',
      column: 'Value',
      anchor: 'Slide text box below change waterfall',
    },
    validationIssues: [
      {
        severity: 'warning',
        message: 'Slide total differs from change log export by USD 0.6M.',
      },
    ],
    correctionHistory: [],
  },
]

export const validationRules: ValidationRule[] = [
  {
    id: 'rule-001',
    name: 'Value lineage required',
    description: 'Every extracted number must point back to a document, table, row, column, and anchor.',
    result: 'pass',
    affectedFields: ['Current Forecast EAC', 'Committed Cost', 'Physical Progress'],
  },
  {
    id: 'rule-002',
    name: 'Progress movement reasonableness',
    description: 'Weekly progress changes above five percentage points require quantity or milestone evidence.',
    result: 'warning',
    affectedFields: ['Physical Progress'],
  },
  {
    id: 'rule-003',
    name: 'Procurement count reconciliation',
    description: 'Dashboard PO counts must reconcile with the appendix register before approval.',
    result: 'fail',
    affectedFields: ['Late Purchase Orders'],
  },
  {
    id: 'rule-004',
    name: 'Currency normalization',
    description: 'Cost values must store original currency, normalized currency, and date of conversion.',
    result: 'warning',
    affectedFields: ['Committed Cost', 'Approved Change Orders'],
  },
]

export const roadmapItems: RoadmapItem[] = [
  {
    phase: 'MVP',
    item: 'Contractor report ingestion, extraction review, mapping, validation, approval, and click-to-source traceability.',
    trigger: 'Build now to prove review minutes saved and dashboard trust.',
  },
  {
    phase: 'V1',
    item: 'Template memory, format-change detection, governance workflows, and customer-specific mapping libraries.',
    trigger: 'Add when two or more pilots repeat weekly reporting with changing contractor templates.',
  },
  {
    phase: 'V2',
    item: 'PDF OCR, schedule-cost alignment, P6/XER import, and document-control connector exports.',
    trigger: 'Add after users approve seeded/tabular extractions and request higher-volume automation.',
  },
  {
    phase: 'Enterprise',
    item: 'Private cloud deployment, role-based access, formal audit packs, model monitoring, and ISO/IEC 42001-aligned AI governance.',
    trigger: 'Add before NOC or government buyer security review.',
  },
  {
    phase: 'Long-term',
    item: 'P&IDs, 3D models, point clouds, reality capture, cross-customer benchmarking, and ML prediction.',
    trigger: 'Add only after structured historical data volume and commercial pull justify the complexity.',
  },
]

export const decisionRecords: DecisionRecord[] = [
  {
    id: 'D-01',
    decision: 'Beachhead market',
    choice: 'Contractor report ingestion and validation for owners.',
    rejectedAlternative: 'Model-based progress validation; too data-heavy for a first proof.',
    evidenceTag: '[inference]',
    confidence: 'Medium',
  },
  {
    id: 'D-02',
    decision: 'One painful workflow',
    choice: 'Turn weekly contractor reports into reviewed, traceable project controls data.',
    rejectedAlternative: 'Executive dashboard; dashboards without trusted data are not defensible.',
    evidenceTag: '[inference]',
    confidence: 'High',
  },
  {
    id: 'D-03',
    decision: 'First formats',
    choice: 'Excel/CSV style cost and progress exports, plus searchable PDF packs as a simulated source.',
    rejectedAlternative: 'ERP/P6/CAD ingestion; integrations slow pilots and require access.',
    evidenceTag: '[assumption]',
    confidence: 'Medium',
  },
  {
    id: 'D-04',
    decision: 'Standards posture',
    choice: 'Map customer WBS/CBS to reference standards; never force a standard structure.',
    rejectedAlternative: 'Mandate ISO/AACE coding; real projects use client-specific structures.',
    evidenceTag: '[known]',
    confidence: 'High',
  },
  {
    id: 'D-05',
    decision: 'Prediction scope',
    choice: 'Use deterministic validation and rules-based risk signals first.',
    rejectedAlternative: 'ML prediction in MVP; insufficient history and trust.',
    evidenceTag: '[inference]',
    confidence: 'High',
  },
]
