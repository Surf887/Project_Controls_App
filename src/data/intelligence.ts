// Seeded data for the six intelligence layers described in the master prompt.
// All values are illustrative and rules-based: no ML, OCR, CAD, or live integrations.

export type ItemStatus = 'verified' | 'in_review' | 'flagged'

export interface TagRegisterItem {
  tag: string
  description: string
  discipline: 'Process' | 'Mechanical' | 'Electrical' | 'Instrumentation' | 'Piping'
  drawing: string
  revision: string
  status: ItemStatus
  confidence: number
}

export interface LineListItem {
  lineNumber: string
  service: string
  size: string
  spec: string
  from: string
  to: string
  status: ItemStatus
}

export interface EquipmentItem {
  tag: string
  name: string
  type: string
  weightTonnes: number
  status: ItemStatus
  datasheet: string
}

export interface ModelObject {
  id: string
  ifcClass: string
  name: string
  discipline: string
  quantity: string
  revision: string
  mappedWbs: string
  status: ItemStatus
}

export interface RealityCapture {
  area: string
  method: 'Drone orthomosaic' | 'Point cloud (E57)' | '360 site photo'
  capturedAt: string
  plannedProgress: number
  capturedProgress: number
  reportedProgress: number
}

export interface EvmAccount {
  wbs: string
  description: string
  discipline: string
  bac: number // Budget at completion
  pv: number // Planned value
  ev: number // Earned value
  ac: number // Actual cost
}

export interface EvmResult extends EvmAccount {
  cpi: number
  spi: number
  cv: number
  sv: number
  eac: number
  vac: number
  percentComplete: number
}

export interface PredictiveSignal {
  id: string
  title: string
  category: 'Overrun' | 'Schedule' | 'Cash flow' | 'Contractor' | 'Progress integrity'
  severity: 'low' | 'medium' | 'high'
  likelihood: number
  basis: string
  recommendation: string
  evidence: 'rules-based' | 'threshold' | 'reconciliation'
}

export interface GovernanceControl {
  id: string
  control: string
  standard: string
  status: 'in_place' | 'partial' | 'planned'
  detail: string
}

export const tagRegister: TagRegisterItem[] = [
  { tag: 'P-1201A', description: 'Crude feed pump', discipline: 'Mechanical', drawing: 'PID-A-1201', revision: 'C', status: 'verified', confidence: 0.93 },
  { tag: 'V-1310', description: 'Separator vessel', discipline: 'Process', drawing: 'PID-A-1310', revision: 'B', status: 'in_review', confidence: 0.81 },
  { tag: 'FT-1450', description: 'Feed flow transmitter', discipline: 'Instrumentation', drawing: 'PID-A-1450', revision: 'D', status: 'flagged', confidence: 0.64 },
  { tag: 'E-1502', description: 'Product cooler', discipline: 'Mechanical', drawing: 'PID-A-1502', revision: 'A', status: 'in_review', confidence: 0.77 },
  { tag: 'MOV-1607', description: 'Motor-operated isolation valve', discipline: 'Piping', drawing: 'PID-A-1607', revision: 'C', status: 'verified', confidence: 0.9 },
]

export const lineList: LineListItem[] = [
  { lineNumber: '6"-P-1201-CS', service: 'Crude feed', size: '6"', spec: 'CS-150', from: 'V-1310', to: 'P-1201A', status: 'verified' },
  { lineNumber: '8"-P-1502-CS', service: 'Cooling water', size: '8"', spec: 'CS-150', from: 'E-1502', to: 'Header', status: 'in_review' },
  { lineNumber: '4"-I-1450-SS', service: 'Instrument tubing', size: '4"', spec: 'SS-300', from: 'FT-1450', to: 'JB-04', status: 'flagged' },
]

export const equipmentList: EquipmentItem[] = [
  { tag: 'P-1201A', name: 'Crude feed pump', type: 'Centrifugal pump', weightTonnes: 3.2, status: 'verified', datasheet: 'DS-P-1201A r2' },
  { tag: 'V-1310', name: 'Separator vessel', type: 'Pressure vessel', weightTonnes: 41.5, status: 'in_review', datasheet: 'DS-V-1310 r1' },
  { tag: 'E-1502', name: 'Product cooler', type: 'Shell & tube exchanger', weightTonnes: 12.8, status: 'verified', datasheet: 'DS-E-1502 r3' },
]

export const modelObjects: ModelObject[] = [
  { id: 'IFC-0001', ifcClass: 'IfcPump', name: 'P-1201A', discipline: 'Mechanical', quantity: '1 ea', revision: 'M-04', mappedWbs: 'A.01.03', status: 'verified' },
  { id: 'IFC-0002', ifcClass: 'IfcTank', name: 'V-1310', discipline: 'Process', quantity: '41.5 t', revision: 'M-04', mappedWbs: 'A.01.05', status: 'in_review' },
  { id: 'IFC-0003', ifcClass: 'IfcPipeSegment', name: '6"-P-1201-CS', discipline: 'Piping', quantity: '128 m', revision: 'M-05', mappedWbs: 'A.02.01', status: 'in_review' },
  { id: 'IFC-0004', ifcClass: 'IfcHeatExchanger', name: 'E-1502', discipline: 'Mechanical', quantity: '1 ea', revision: 'M-04', mappedWbs: 'A.01.07', status: 'flagged' },
]

export const realityCaptures: RealityCapture[] = [
  { area: 'Process Area A - Pipe rack', method: 'Drone orthomosaic', capturedAt: '2026-06-07', plannedProgress: 72, capturedProgress: 63, reportedProgress: 70 },
  { area: 'Utilities - Tank farm', method: 'Point cloud (E57)', capturedAt: '2026-06-06', plannedProgress: 55, capturedProgress: 51, reportedProgress: 58 },
  { area: 'Rotating equipment skid', method: '360 site photo', capturedAt: '2026-06-08', plannedProgress: 40, capturedProgress: 42, reportedProgress: 41 },
]

export const evmAccounts: EvmAccount[] = [
  { wbs: 'A.01.03', description: 'Mechanical - Process Area A', discipline: 'Mechanical', bac: 84000000, pv: 52000000, ev: 47000000, ac: 51500000 },
  { wbs: 'A.02.01', description: 'Piping - Process Area A', discipline: 'Piping', bac: 61000000, pv: 33000000, ev: 29500000, ac: 34200000 },
  { wbs: 'P.04.01', description: 'Procurement - Rotating equipment', discipline: 'Procurement', bac: 96000000, pv: 70000000, ev: 68000000, ac: 71500000 },
  { wbs: 'U.02.00', description: 'Utilities & offsites', discipline: 'Civil', bac: 48000000, pv: 22000000, ev: 23500000, ac: 22800000 },
]

export interface SCurvePoint {
  period: string
  planned: number
  actual: number | null
  forecast: number | null
}

export interface ResourceBucket {
  period: string
  mechanical: number
  piping: number
  electrical: number
  civil: number
}

export interface CashFlowPoint {
  period: string
  plannedMonthly: number
  actualMonthly: number | null
  forecastMonthly: number | null
}

// Cumulative cost S-curve (% of BAC). Null = future.
export const sCurveData: SCurvePoint[] = [
  { period: 'Jan', planned:  2, actual:  1.8, forecast: null },
  { period: 'Feb', planned:  5, actual:  4.4, forecast: null },
  { period: 'Mar', planned: 10, actual:  9.1, forecast: null },
  { period: 'Apr', planned: 17, actual: 15.8, forecast: null },
  { period: 'May', planned: 26, actual: 23.6, forecast: null },
  { period: 'Jun', planned: 36, actual: 32.8, forecast: 32.8 },
  { period: 'Jul', planned: 47, actual: null,  forecast: 42.5 },
  { period: 'Aug', planned: 57, actual: null,  forecast: 53.0 },
  { period: 'Sep', planned: 66, actual: null,  forecast: 63.0 },
  { period: 'Oct', planned: 74, actual: null,  forecast: 72.5 },
  { period: 'Nov', planned: 82, actual: null,  forecast: 81.0 },
  { period: 'Dec', planned: 89, actual: null,  forecast: 88.5 },
  { period: 'Jan+', planned: 95, actual: null, forecast: 95.0 },
  { period: 'Feb+', planned: 100, actual: null, forecast: 108 },
]

// Monthly man-hours by discipline (hundreds)
export const resourceData: ResourceBucket[] = [
  { period: 'Jan', mechanical: 18, piping: 22, electrical: 8,  civil: 30 },
  { period: 'Feb', mechanical: 24, piping: 30, electrical: 10, civil: 28 },
  { period: 'Mar', mechanical: 34, piping: 42, electrical: 14, civil: 22 },
  { period: 'Apr', mechanical: 44, piping: 56, electrical: 20, civil: 16 },
  { period: 'May', mechanical: 52, piping: 64, electrical: 28, civil: 10 },
  { period: 'Jun', mechanical: 56, piping: 68, electrical: 34, civil:  6 },
  { period: 'Jul', mechanical: 50, piping: 62, electrical: 40, civil:  4 },
  { period: 'Aug', mechanical: 42, piping: 54, electrical: 46, civil:  2 },
  { period: 'Sep', mechanical: 32, piping: 44, electrical: 50, civil:  2 },
  { period: 'Oct', mechanical: 22, piping: 34, electrical: 44, civil:  2 },
  { period: 'Nov', mechanical: 14, piping: 22, electrical: 36, civil:  0 },
  { period: 'Dec', mechanical:  8, piping: 12, electrical: 24, civil:  0 },
]

// Monthly cash flow (USD millions)
export const cashFlowData: CashFlowPoint[] = [
  { period: 'Jan', plannedMonthly: 3.2,  actualMonthly: 2.9,  forecastMonthly: null },
  { period: 'Feb', plannedMonthly: 5.8,  actualMonthly: 5.1,  forecastMonthly: null },
  { period: 'Mar', plannedMonthly: 9.4,  actualMonthly: 8.6,  forecastMonthly: null },
  { period: 'Apr', plannedMonthly: 13.0, actualMonthly: 12.1, forecastMonthly: null },
  { period: 'May', plannedMonthly: 16.5, actualMonthly: 14.8, forecastMonthly: null },
  { period: 'Jun', plannedMonthly: 17.2, actualMonthly: 15.6, forecastMonthly: 15.6 },
  { period: 'Jul', plannedMonthly: 18.4, actualMonthly: null,  forecastMonthly: 17.0 },
  { period: 'Aug', plannedMonthly: 19.1, actualMonthly: null,  forecastMonthly: 18.5 },
  { period: 'Sep', plannedMonthly: 17.6, actualMonthly: null,  forecastMonthly: 17.2 },
  { period: 'Oct', plannedMonthly: 15.2, actualMonthly: null,  forecastMonthly: 15.8 },
  { period: 'Nov', plannedMonthly: 12.8, actualMonthly: null,  forecastMonthly: 13.4 },
  { period: 'Dec', plannedMonthly: 10.4, actualMonthly: null,  forecastMonthly: 11.0 },
]

export const governanceControls: GovernanceControl[] = [
  { id: 'G-01', control: 'Per-value source lineage & audit trail', standard: 'Internal trust pipeline', status: 'in_place', detail: 'Every value stores document, table, row/column, reviewer, and correction history.' },
  { id: 'G-02', control: 'Human-in-the-loop approval gating', standard: 'AACE review discipline', status: 'in_place', detail: 'Critical validation issues block approval until resolved.' },
  { id: 'G-03', control: 'AI governance & model monitoring', standard: 'ISO/IEC 42001', status: 'planned', detail: 'Formal model monitoring and governance scheduled for enterprise phase.' },
  { id: 'G-04', control: 'Security-minded information management', standard: 'ISO 19650 Part 5', status: 'partial', detail: 'Local-only processing today; private-cloud RBAC required before NOC review.' },
  { id: 'G-05', control: 'Currency / unit / date normalization', standard: 'ISO 4217 / 80000 / 8601', status: 'in_place', detail: 'Values carry original and normalized representations with conversion basis.' },
]

export function computeEvm(account: EvmAccount): EvmResult {
  const cpi = account.ac === 0 ? 0 : account.ev / account.ac
  const spi = account.pv === 0 ? 0 : account.ev / account.pv
  const cv = account.ev - account.ac
  const sv = account.ev - account.pv
  const eac = cpi === 0 ? account.bac : account.bac / cpi
  const vac = account.bac - eac
  const percentComplete = account.bac === 0 ? 0 : (account.ev / account.bac) * 100

  return { ...account, cpi, spi, cv, sv, eac, vac, percentComplete }
}

export function buildPredictiveSignals(results: EvmResult[]): PredictiveSignal[] {
  const signals: PredictiveSignal[] = []

  results.forEach((result) => {
    if (result.cpi < 0.95) {
      const likelihood = Math.min(0.95, 0.5 + (0.95 - result.cpi) * 2)
      signals.push({
        id: `pred-overrun-${result.wbs}`,
        title: `Cost overrun pressure on ${result.wbs}`,
        category: 'Overrun',
        severity: result.cpi < 0.9 ? 'high' : 'medium',
        likelihood,
        basis: `CPI ${result.cpi.toFixed(2)} implies forecast EAC ${formatUsd(result.eac)} vs BAC ${formatUsd(result.bac)}.`,
        recommendation: 'Review productivity and committed-cost drivers before next forecast cycle.',
        evidence: 'rules-based',
      })
    }

    if (result.spi < 0.95) {
      signals.push({
        id: `pred-schedule-${result.wbs}`,
        title: `Schedule slippage on ${result.wbs}`,
        category: 'Schedule',
        severity: result.spi < 0.9 ? 'high' : 'medium',
        likelihood: Math.min(0.95, 0.45 + (0.95 - result.spi) * 2),
        basis: `SPI ${result.spi.toFixed(2)} with schedule variance ${formatUsd(result.sv)}.`,
        recommendation: 'Confirm critical-path activities and recovery plan with contractor.',
        evidence: 'threshold',
      })
    }

    if (result.cpi < 0.97 && result.spi > 1.0) {
      signals.push({
        id: `pred-misalign-${result.wbs}`,
        title: `Schedule-cost misalignment on ${result.wbs}`,
        category: 'Progress integrity',
        severity: 'medium',
        likelihood: 0.6,
        basis: 'Ahead of schedule but over cost may indicate progress overstatement or rework.',
        recommendation: 'Cross-check earned progress against reality-capture and installed quantities.',
        evidence: 'reconciliation',
      })
    }
  })

  return signals
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}
