// Oracle Unifier-style procurement flow: RFB → Contract → PO → Invoice

export type ContractStatus = 'draft' | 'executed' | 'active' | 'closed' | 'suspended'
export type RfqStatus = 'draft' | 'issued' | 'evaluating' | 'awarded' | 'cancelled'
export type InvoiceStatus = 'submitted' | 'approved' | 'paid' | 'held' | 'rejected'
export type SubcontractStatus = 'draft' | 'executed' | 'active' | 'complete' | 'suspended'
export type FieldReportStatus = 'draft' | 'submitted' | 'approved'
export type TurnoverChecklistStatus = 'not_started' | 'in_progress' | 'complete'

export interface Contract {
  id: string
  number: string
  title: string
  vendor: string
  contractValueUsd: number
  committedUsd: number
  invoicedUsd: number
  status: ContractStatus
  awardDate: string
  expiryDate: string
  wbs: string
  poIds: string[]
}

export interface RfqBid {
  id: string
  rfqNumber: string
  title: string
  packageName: string
  status: RfqStatus
  issueDate: string
  bidDueDate: string
  vendorsInvited: number
  bidsReceived: number
  estimatedValueUsd: number
  awardedVendor?: string
  contractId?: string
  wbs: string
}

export interface Invoice {
  id: string
  number: string
  poId: string
  contractId: string
  vendor: string
  invoiceDate: string
  period: string
  amountUsd: number
  status: InvoiceStatus
  approvedDate?: string
  wbs: string
  description: string
}

export interface Subcontract {
  id: string
  number: string
  title: string
  subcontractor: string
  contractValueUsd: number
  earnedUsd: number
  invoicedUsd: number
  status: SubcontractStatus
  wbs: string
  workFrontId?: string
  startDate: string
  finishDate: string
  forecastFinish: string
  progressPct: number
}

export interface FieldDailyReport {
  id: string
  reportDate: string
  workFrontId: string
  area: string
  contractor: string
  manhours: number
  weather: string
  summary: string
  safetyNotes: string
  status: FieldReportStatus
}

export interface FieldObservation {
  id: string
  observedAt: string
  workFrontId: string
  category: 'quality' | 'safety' | 'schedule' | 'productivity'
  severity: 'low' | 'medium' | 'high'
  description: string
  actionRequired: string
  owner: string
  status: 'open' | 'closed'
}

export interface TurnoverChecklist {
  id: string
  systemId: string
  systemName: string
  item: string
  responsible: string
  dueDate: string
  status: TurnoverChecklistStatus
}

export const contracts: Contract[] = [
  {
    id: 'CTR-1001',
    number: 'CTR-ME-2025-01',
    title: 'Rotating equipment supply agreement',
    vendor: 'Delta Equipment JV',
    contractValueUsd: 18_400_000,
    committedUsd: 18_400_000,
    invoicedUsd: 9_200_000,
    status: 'active',
    awardDate: '2025-12-01',
    expiryDate: '2027-06-30',
    wbs: 'P.04',
    poIds: ['PO-2010'],
  },
  {
    id: 'CTR-1002',
    number: 'CTR-SE-2025-04',
    title: 'Static vessels fabrication',
    vendor: 'Hellenic Pressure Works',
    contractValueUsd: 9_350_000,
    committedUsd: 9_350_000,
    invoicedUsd: 3_740_000,
    status: 'active',
    awardDate: '2025-11-15',
    expiryDate: '2027-03-31',
    wbs: 'P.04',
    poIds: ['PO-2014'],
  },
  {
    id: 'CTR-1003',
    number: 'CTR-IC-2025-02',
    title: 'DCS supply and site services',
    vendor: 'Yokogawa Systems',
    contractValueUsd: 11_600_000,
    committedUsd: 11_600_000,
    invoicedUsd: 5_800_000,
    status: 'active',
    awardDate: '2025-10-25',
    expiryDate: '2027-12-31',
    wbs: 'A.01',
    poIds: ['PO-2042'],
  },
  {
    id: 'CTR-2001',
    number: 'CTR-CIV-2026-01',
    title: 'Area A civil & foundations lump sum',
    vendor: 'Gulf Modular Contractors',
    contractValueUsd: 42_000_000,
    committedUsd: 38_500_000,
    invoicedUsd: 22_400_000,
    status: 'active',
    awardDate: '2026-01-20',
    expiryDate: '2026-12-31',
    wbs: 'A.01',
    poIds: [],
  },
]

export const rfqBids: RfqBid[] = [
  {
    id: 'RFQ-301',
    rfqNumber: 'RFQ-ME-2025-08',
    title: 'Crude feed pump skid',
    packageName: 'Rotating Equipment',
    status: 'awarded',
    issueDate: '2025-09-10',
    bidDueDate: '2025-10-15',
    vendorsInvited: 4,
    bidsReceived: 3,
    estimatedValueUsd: 17_500_000,
    awardedVendor: 'Delta Equipment JV',
    contractId: 'CTR-1001',
    wbs: 'P.04',
  },
  {
    id: 'RFQ-318',
    rfqNumber: 'RFQ-EL-2026-02',
    title: '132kV transformer package',
    packageName: 'Electrical',
    status: 'awarded',
    issueDate: '2025-11-01',
    bidDueDate: '2025-12-01',
    vendorsInvited: 3,
    bidsReceived: 2,
    estimatedValueUsd: 7_500_000,
    awardedVendor: 'Hitachi Energy',
    contractId: undefined,
    wbs: 'U.02',
  },
  {
    id: 'RFQ-325',
    rfqNumber: 'RFQ-INS-2026-05',
    title: 'Insulation bulk materials Area A',
    packageName: 'Bulks - Insulation',
    status: 'evaluating',
    issueDate: '2026-05-20',
    bidDueDate: '2026-06-25',
    vendorsInvited: 5,
    bidsReceived: 2,
    estimatedValueUsd: 2_800_000,
    wbs: 'A.02',
  },
]

export const invoices: Invoice[] = [
  {
    id: 'INV-8801',
    number: 'DEJ-INV-2026-014',
    poId: 'PO-2010',
    contractId: 'CTR-1001',
    vendor: 'Delta Equipment JV',
    invoiceDate: '2026-04-15',
    period: '2026-Q2',
    amountUsd: 4_600_000,
    status: 'paid',
    approvedDate: '2026-04-22',
    wbs: 'P.04',
    description: 'Manufacturing milestone 1 — 50% progress payment',
  },
  {
    id: 'INV-8802',
    number: 'DEJ-INV-2026-021',
    poId: 'PO-2010',
    contractId: 'CTR-1001',
    vendor: 'Delta Equipment JV',
    invoiceDate: '2026-06-01',
    period: '2026-Q2',
    amountUsd: 4_600_000,
    status: 'approved',
    approvedDate: '2026-06-08',
    wbs: 'P.04',
    description: 'Manufacturing milestone 2 — materials complete',
  },
  {
    id: 'INV-8810',
    number: 'HPW-INV-2026-009',
    poId: 'PO-2014',
    contractId: 'CTR-1002',
    vendor: 'Hellenic Pressure Works',
    invoiceDate: '2026-05-28',
    period: '2026-Q2',
    amountUsd: 1_870_000,
    status: 'paid',
    approvedDate: '2026-06-03',
    wbs: 'P.04',
    description: 'Vessel shell plates — 40% fabrication',
  },
  {
    id: 'INV-8811',
    number: 'HPW-INV-2026-011',
    poId: 'PO-2014',
    contractId: 'CTR-1002',
    vendor: 'Hellenic Pressure Works',
    invoiceDate: '2026-06-10',
    period: '2026-Q2',
    amountUsd: 1_870_000,
    status: 'held',
    wbs: 'P.04',
    description: 'NDT hold — pending weld map reconciliation',
  },
  {
    id: 'INV-8820',
    number: 'YOK-INV-2026-006',
    poId: 'PO-2042',
    contractId: 'CTR-1003',
    vendor: 'Yokogawa Systems',
    invoiceDate: '2026-05-15',
    period: '2026-Q2',
    amountUsd: 5_800_000,
    status: 'paid',
    approvedDate: '2026-05-22',
    wbs: 'A.01',
    description: 'DCS hardware shipment — 50% milestone',
  },
]

export const subcontracts: Subcontract[] = [
  {
    id: 'SC-401',
    number: 'SC-PIP-2026-01',
    title: 'Area A piping installation',
    subcontractor: 'Northfield Construction',
    contractValueUsd: 33_200_000,
    earnedUsd: 14_800_000,
    invoicedUsd: 12_600_000,
    status: 'active',
    wbs: 'A.02',
    workFrontId: 'WF-A01',
    startDate: '2026-04-01',
    finishDate: '2026-09-30',
    forecastFinish: '2026-10-15',
    progressPct: 42,
  },
  {
    id: 'SC-402',
    number: 'SC-CIV-2026-02',
    title: 'Equipment foundations Area A',
    subcontractor: 'Gulf Modular Contractors',
    contractValueUsd: 12_400_000,
    earnedUsd: 11_200_000,
    invoicedUsd: 10_800_000,
    status: 'active',
    wbs: 'A.01.02',
    workFrontId: 'WF-A02',
    startDate: '2026-02-15',
    finishDate: '2026-06-30',
    forecastFinish: '2026-07-05',
    progressPct: 88,
  },
  {
    id: 'SC-403',
    number: 'SC-INS-2026-01',
    title: 'Insulation & tracing package',
    subcontractor: 'ThermalWrap Services',
    contractValueUsd: 6_800_000,
    earnedUsd: 1_700_000,
    invoicedUsd: 1_360_000,
    status: 'active',
    wbs: 'A.02.02',
    startDate: '2026-06-01',
    finishDate: '2026-11-30',
    forecastFinish: '2026-11-30',
    progressPct: 22,
  },
]

export const fieldDailyReports: FieldDailyReport[] = [
  {
    id: 'DR-2026-0610',
    reportDate: '2026-06-10',
    workFrontId: 'WF-A01',
    area: 'Process Area A - Pipe rack north',
    contractor: 'Northfield Construction',
    manhours: 186,
    weather: 'Clear, 42°C',
    summary: 'Spool erection batch 14; 42 joints completed.',
    safetyNotes: 'Heat stress protocol active; no incidents.',
    status: 'approved',
  },
  {
    id: 'DR-2026-0611',
    reportDate: '2026-06-11',
    workFrontId: 'WF-A01',
    area: 'Process Area A - Pipe rack north',
    contractor: 'Northfield Construction',
    manhours: 192,
    weather: 'Hazy, 44°C',
    summary: 'Welding crew reduced to 2 shifts; rework on line 2203.',
    safetyNotes: 'Stop-work on scaffold level 3 — corrected same day.',
    status: 'submitted',
  },
  {
    id: 'DR-2026-0611B',
    reportDate: '2026-06-11',
    workFrontId: 'WF-A02',
    area: 'Process Area A - Equipment foundations',
    contractor: 'Gulf Modular Contractors',
    manhours: 96,
    weather: 'Clear, 43°C',
    summary: 'Grouting V-1310 foundation; awaiting vendor data.',
    safetyNotes: 'Confined space permit closed.',
    status: 'approved',
  },
]

export const fieldObservations: FieldObservation[] = [
  {
    id: 'FO-120',
    observedAt: '2026-06-11 09:15',
    workFrontId: 'WF-A01',
    category: 'quality',
    severity: 'medium',
    description: 'Incorrect gasket spec installed on 6" flange pair 2203-A.',
    actionRequired: 'Replace gaskets; update QC hold point checklist.',
    owner: 'Piping QC Lead',
    status: 'open',
  },
  {
    id: 'FO-121',
    observedAt: '2026-06-10 14:30',
    workFrontId: 'WF-A01',
    category: 'productivity',
    severity: 'high',
    description: 'Welder availability 60% of plan due to heat restrictions.',
    actionRequired: 'Night shift trial approved for week 24.',
    owner: 'Construction Manager',
    status: 'open',
  },
  {
    id: 'FO-122',
    observedAt: '2026-06-09 11:00',
    workFrontId: 'WF-A02',
    category: 'schedule',
    severity: 'low',
    description: 'Vendor anchor bolt template received — matches foundation layout.',
    actionRequired: 'None — close observation.',
    owner: 'Civil Lead',
    status: 'closed',
  },
]

export const turnoverChecklists: TurnoverChecklist[] = [
  { id: 'TC-01', systemId: 'SYS-100', systemName: 'Crude unit feed system', item: 'Mechanical completion certificate', responsible: 'Mechanical Lead', dueDate: '2026-09-15', status: 'in_progress' },
  { id: 'TC-02', systemId: 'SYS-100', systemName: 'Crude unit feed system', item: 'Loop check complete', responsible: 'I&C Lead', dueDate: '2026-09-20', status: 'not_started' },
  { id: 'TC-03', systemId: 'SYS-100', systemName: 'Crude unit feed system', item: 'Punch A closed', responsible: 'Commissioning Manager', dueDate: '2026-09-25', status: 'not_started' },
  { id: 'TC-04', systemId: 'SYS-110', systemName: 'Cooling water system', item: 'Hydro test package approved', responsible: 'Piping Lead', dueDate: '2026-08-30', status: 'in_progress' },
  { id: 'TC-05', systemId: 'SYS-110', systemName: 'Cooling water system', item: 'Operations readiness review', responsible: 'Operations Readiness', dueDate: '2026-09-05', status: 'not_started' },
  { id: 'TC-06', systemId: 'SYS-120', systemName: 'Electrical distribution', item: 'Energisation permit', responsible: 'Electrical Lead', dueDate: '2026-10-01', status: 'not_started' },
]
