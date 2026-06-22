// Phase-specific datasets for Procurement, Construction, and Commissioning workspaces.
// Engineering already has its own intelligence layer; these complete the four-phase coverage.

import type { SupportedCurrency } from '../store/types'

export type POStatus =
  | 'requisitioned'
  | 'awarded'
  | 'manufacturing'
  | 'inspection'
  | 'shipped'
  | 'site_received'
  | 'closed'

export interface PurchaseOrder {
  id: string
  description: string
  vendor: string
  packageName: string
  category: 'Rotating' | 'Static' | 'Electrical' | 'Instrumentation' | 'Bulk Materials' | 'Services'
  currency: SupportedCurrency
  poValueForeign: number
  poValueUsd: number
  committedUsd: number
  invoicedUsd: number
  hedgedPct: number
  hedgeInstrument?: string
  status: POStatus
  awardDate: string
  scheduledFatDate: string
  forecastSiteDate: string
  plannedSiteDate: string
  expediting: 'green' | 'amber' | 'red'
}

export interface ExpeditingMilestone {
  id: string
  poId: string
  milestone: string
  planned: string
  forecast: string
  actual?: string
  status: 'on_track' | 'at_risk' | 'late' | 'complete'
}

export type WorkFrontStatus =
  | 'not_started'
  | 'in_progress'
  | 'on_hold'
  | 'complete'

export interface WorkFront {
  id: string
  area: string
  discipline: 'Civil' | 'Mechanical' | 'Piping' | 'Electrical' | 'Instrumentation' | 'Insulation'
  package: string
  plannedStart: string
  plannedFinish: string
  forecastFinish: string
  earnedPercent: number
  plannedPercent: number
  manhoursPlanned: number
  manhoursActual: number
  status: WorkFrontStatus
  owner: string
  blockers: string[]
}

export interface ProductivityPoint {
  week: string
  plannedRate: number  // earned manhours / actual manhours target (1.0 = on-plan)
  actualRate: number
}

export type SystemStatus = 'engineering' | 'mechanical_complete' | 'pre_commissioning' | 'commissioning' | 'handed_over'

export interface CommissioningSystem {
  id: string
  name: string
  unit: string
  package: string
  loopCount: number
  loopTested: number
  punchA: number
  punchB: number
  plannedMcDate: string
  forecastMcDate: string
  status: SystemStatus
  owner: string
}

export interface PunchListItem {
  id: string
  systemId: string
  description: string
  category: 'A' | 'B'
  raisedAt: string
  discipline: 'Mechanical' | 'Piping' | 'Electrical' | 'Instrumentation' | 'Civil'
  owner: string
  status: 'open' | 'in_progress' | 'closed'
  dueDate: string
}

// ----- Procurement seed -----

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'PO-2010',
    description: 'Crude feed pump skid (P-1201A/B)',
    vendor: 'Delta Equipment JV',
    packageName: 'Rotating Equipment',
    category: 'Rotating',
    currency: 'EUR',
    poValueForeign: 17_037_037,
    poValueUsd: 18_400_000,
    committedUsd: 18_400_000,
    invoicedUsd: 9_200_000,
    hedgedPct: 75,
    hedgeInstrument: 'EUR/USD forward Q3-26',
    status: 'manufacturing',
    awardDate: '2025-12-04',
    scheduledFatDate: '2026-07-15',
    forecastSiteDate: '2026-08-30',
    plannedSiteDate: '2026-08-10',
    expediting: 'amber',
  },
  {
    id: 'PO-2014',
    description: 'Separator vessel V-1310',
    vendor: 'Hellenic Pressure Works',
    packageName: 'Static Equipment',
    category: 'Static',
    currency: 'EUR',
    poValueForeign: 8_657_407,
    poValueUsd: 9_350_000,
    committedUsd: 9_350_000,
    invoicedUsd: 3_740_000,
    hedgedPct: 50,
    hedgeInstrument: 'EUR/USD option collar',
    status: 'inspection',
    awardDate: '2025-11-22',
    scheduledFatDate: '2026-06-25',
    forecastSiteDate: '2026-07-20',
    plannedSiteDate: '2026-07-05',
    expediting: 'red',
  },
  {
    id: 'PO-2030',
    description: 'Cooling water tubing bulk',
    vendor: 'Bulk Materials Co',
    packageName: 'Bulks - Piping',
    category: 'Bulk Materials',
    currency: 'USD',
    poValueForeign: 4_280_000,
    poValueUsd: 4_280_000,
    committedUsd: 4_280_000,
    invoicedUsd: 2_120_000,
    hedgedPct: 100,
    status: 'shipped',
    awardDate: '2026-01-15',
    scheduledFatDate: '2026-05-01',
    forecastSiteDate: '2026-06-12',
    plannedSiteDate: '2026-06-15',
    expediting: 'green',
  },
  {
    id: 'PO-2042',
    description: 'Control system DCS',
    vendor: 'Yokogawa Systems',
    packageName: 'I&C',
    category: 'Instrumentation',
    currency: 'SGD',
    poValueForeign: 15_675_676,
    poValueUsd: 11_600_000,
    committedUsd: 11_600_000,
    invoicedUsd: 5_800_000,
    hedgedPct: 60,
    hedgeInstrument: 'SGD/USD treasury spot',
    status: 'manufacturing',
    awardDate: '2025-10-30',
    scheduledFatDate: '2026-08-10',
    forecastSiteDate: '2026-09-15',
    plannedSiteDate: '2026-09-10',
    expediting: 'green',
  },
  {
    id: 'PO-2055',
    description: 'HV transformer 132/33kV',
    vendor: 'Hitachi Energy',
    packageName: 'Electrical',
    category: 'Electrical',
    currency: 'AED',
    poValueForeign: 29_259_259,
    poValueUsd: 7_900_000,
    committedUsd: 7_900_000,
    invoicedUsd: 2_370_000,
    hedgedPct: 40,
    hedgeInstrument: 'AED peg — partial natural hedge',
    status: 'manufacturing',
    awardDate: '2025-12-15',
    scheduledFatDate: '2026-09-01',
    forecastSiteDate: '2026-10-05',
    plannedSiteDate: '2026-09-30',
    expediting: 'amber',
  },
]

export const expeditingMilestones: ExpeditingMilestone[] = [
  { id: 'EX-1', poId: 'PO-2010', milestone: 'Casting receipt', planned: '2026-03-15', forecast: '2026-03-22', actual: '2026-03-25', status: 'complete' },
  { id: 'EX-2', poId: 'PO-2010', milestone: 'Hydrostatic test', planned: '2026-06-20', forecast: '2026-07-05', status: 'at_risk' },
  { id: 'EX-3', poId: 'PO-2010', milestone: 'FAT', planned: '2026-07-15', forecast: '2026-08-01', status: 'at_risk' },
  { id: 'EX-4', poId: 'PO-2014', milestone: 'Welding NDT release', planned: '2026-05-20', forecast: '2026-06-05', actual: '2026-06-08', status: 'late' },
  { id: 'EX-5', poId: 'PO-2014', milestone: 'PWHT release', planned: '2026-06-10', forecast: '2026-06-20', status: 'at_risk' },
  { id: 'EX-6', poId: 'PO-2030', milestone: 'Ex-works shipment', planned: '2026-05-25', forecast: '2026-05-25', actual: '2026-05-24', status: 'complete' },
  { id: 'EX-7', poId: 'PO-2055', milestone: 'Core assembly', planned: '2026-05-20', forecast: '2026-06-02', actual: '2026-06-04', status: 'late' },
]

// ----- Construction seed -----

export const workFronts: WorkFront[] = [
  {
    id: 'WF-A01',
    area: 'Process Area A - Pipe rack north',
    discipline: 'Piping',
    package: 'Mechanical erection',
    plannedStart: '2026-04-05',
    plannedFinish: '2026-08-30',
    forecastFinish: '2026-09-15',
    earnedPercent: 42,
    plannedPercent: 48,
    manhoursPlanned: 38_000,
    manhoursActual: 41_200,
    status: 'in_progress',
    owner: 'Gulf Modular Contractors',
    blockers: ['Vendor data for V-1310', 'Welder shortage'],
  },
  {
    id: 'WF-A02',
    area: 'Process Area A - Equipment foundations',
    discipline: 'Civil',
    package: 'Foundations',
    plannedStart: '2026-02-15',
    plannedFinish: '2026-05-30',
    forecastFinish: '2026-06-05',
    earnedPercent: 96,
    plannedPercent: 100,
    manhoursPlanned: 12_500,
    manhoursActual: 13_000,
    status: 'in_progress',
    owner: 'Gulf Modular Contractors',
    blockers: [],
  },
  {
    id: 'WF-U01',
    area: 'Utilities - Tank farm dykes',
    discipline: 'Civil',
    package: 'Containment',
    plannedStart: '2026-03-01',
    plannedFinish: '2026-06-10',
    forecastFinish: '2026-06-22',
    earnedPercent: 78,
    plannedPercent: 86,
    manhoursPlanned: 15_400,
    manhoursActual: 17_200,
    status: 'in_progress',
    owner: 'Northfield Construction',
    blockers: ['Rework on dyke wall pour'],
  },
  {
    id: 'WF-E01',
    area: 'Electrical building',
    discipline: 'Electrical',
    package: 'Cable pulling',
    plannedStart: '2026-05-15',
    plannedFinish: '2026-08-20',
    forecastFinish: '2026-08-25',
    earnedPercent: 25,
    plannedPercent: 28,
    manhoursPlanned: 18_000,
    manhoursActual: 17_800,
    status: 'in_progress',
    owner: 'Volt Electrical Services',
    blockers: [],
  },
  {
    id: 'WF-I01',
    area: 'I&C - Instrumentation racks',
    discipline: 'Instrumentation',
    package: 'Field instruments',
    plannedStart: '2026-06-01',
    plannedFinish: '2026-09-10',
    forecastFinish: '2026-09-25',
    earnedPercent: 4,
    plannedPercent: 6,
    manhoursPlanned: 9_500,
    manhoursActual: 980,
    status: 'in_progress',
    owner: 'Yokogawa Systems',
    blockers: ['DCS controller delivery'],
  },
]

export const productivityTrend: ProductivityPoint[] = [
  { week: 'W18', plannedRate: 1.0, actualRate: 0.92 },
  { week: 'W19', plannedRate: 1.0, actualRate: 0.94 },
  { week: 'W20', plannedRate: 1.0, actualRate: 0.91 },
  { week: 'W21', plannedRate: 1.0, actualRate: 0.88 },
  { week: 'W22', plannedRate: 1.0, actualRate: 0.86 },
  { week: 'W23', plannedRate: 1.0, actualRate: 0.84 },
]

// ----- Commissioning seed -----

export const commissioningSystems: CommissioningSystem[] = [
  {
    id: 'SYS-100',
    name: 'Crude charge & feed system',
    unit: 'Unit 100',
    package: 'Process Area A',
    loopCount: 84,
    loopTested: 21,
    punchA: 4,
    punchB: 18,
    plannedMcDate: '2026-09-30',
    forecastMcDate: '2026-10-15',
    status: 'pre_commissioning',
    owner: 'Commissioning Lead',
  },
  {
    id: 'SYS-200',
    name: 'Cooling water utilities',
    unit: 'Utility 200',
    package: 'Utilities',
    loopCount: 46,
    loopTested: 38,
    punchA: 1,
    punchB: 12,
    plannedMcDate: '2026-08-20',
    forecastMcDate: '2026-08-25',
    status: 'commissioning',
    owner: 'Commissioning Lead',
  },
  {
    id: 'SYS-300',
    name: 'Electrical distribution 33kV',
    unit: 'Electrical 300',
    package: 'Electrical',
    loopCount: 22,
    loopTested: 22,
    punchA: 0,
    punchB: 4,
    plannedMcDate: '2026-08-10',
    forecastMcDate: '2026-08-10',
    status: 'handed_over',
    owner: 'Electrical Lead',
  },
  {
    id: 'SYS-400',
    name: 'Fire and gas system',
    unit: 'Safety 400',
    package: 'Safety',
    loopCount: 58,
    loopTested: 0,
    punchA: 0,
    punchB: 0,
    plannedMcDate: '2026-10-05',
    forecastMcDate: '2026-10-12',
    status: 'mechanical_complete',
    owner: 'I&C Lead',
  },
]

export const punchList: PunchListItem[] = [
  { id: 'PL-001', systemId: 'SYS-100', description: 'Replace gasket flange P-1201A suction', category: 'A', raisedAt: '2026-06-04', discipline: 'Piping', owner: 'Gulf Modular', status: 'in_progress', dueDate: '2026-06-18' },
  { id: 'PL-002', systemId: 'SYS-100', description: 'Re-loop test FT-1450', category: 'B', raisedAt: '2026-06-06', discipline: 'Instrumentation', owner: 'Yokogawa', status: 'open', dueDate: '2026-06-25' },
  { id: 'PL-003', systemId: 'SYS-200', description: 'Paint touch-up cooling tower header', category: 'B', raisedAt: '2026-06-01', discipline: 'Piping', owner: 'Gulf Modular', status: 'closed', dueDate: '2026-06-10' },
  { id: 'PL-004', systemId: 'SYS-300', description: 'Label CB-101 nameplate', category: 'B', raisedAt: '2026-05-28', discipline: 'Electrical', owner: 'Volt Electrical', status: 'closed', dueDate: '2026-06-02' },
  { id: 'PL-005', systemId: 'SYS-100', description: 'Hydrotest line 6"-P-1201-CS missed', category: 'A', raisedAt: '2026-06-08', discipline: 'Piping', owner: 'Gulf Modular', status: 'open', dueDate: '2026-06-22' },
]
