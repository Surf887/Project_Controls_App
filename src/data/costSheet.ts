// EcoSys / Oracle Unifier-style cost sheet data model.
// Rows are hierarchical WBS control accounts and work packages.
// Columns mirror a typical EcoSys cost sheet layout:
//   Budget | Commitments | Actuals (by period) | EAC | Forecast-to-Complete | VAC | Notes

import type { CostType, ProjectPhase } from '../store/types'
import type { SccsAssignment } from './sccs'

export type RowType = 'header' | 'control_account' | 'work_package' | 'cost_element'
export type CellLock = 'locked' | 'editable' | 'formula'

export interface PeriodActual {
  period: string   // e.g. "Jan-26"
  actual: number
  forecast: number
  locked: boolean  // past periods are locked; current/future are editable
}

export interface CostRow {
  id: string
  parentId: string | null
  level: number            // 0 = project, 1 = control account, 2 = work package, 3 = cost element
  wbs: string
  cbs: string
  description: string
  discipline: string
  costType: CostType
  phase: ProjectPhase
  currency: 'USD'
  // Summary columns
  originalBudget: number
  approvedChanges: number
  currentBudget: number    // formula: originalBudget + approvedChanges
  commitments: number
  actualsToDate: number    // formula: sum of period actuals
  eac: number              // editable: cost engineer forecast
  ftc: number              // formula: eac - actualsToDate
  vac: number              // formula: currentBudget - eac
  // Period data
  periods: PeriodActual[]
  // Metadata
  notes: string
  lastModifiedBy: string
  lastModifiedAt: string
  isDirty: boolean
  isExpanded: boolean
  /** ISO 19008 SCCS composite (PBS · SAB · COR) — mapped from WBS/CBS/phase. */
  sccs?: SccsAssignment
}

export const PERIODS = [
  'Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26', 'Jun-26',
  'Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26',
]

export const CURRENT_PERIOD_INDEX = 5 // Jun-26 is the current open period

function makePeriods(actuals: number[], forecasts: number[]): PeriodActual[] {
  return PERIODS.map((period, i) => ({
    period,
    actual: actuals[i] ?? 0,
    forecast: forecasts[i] ?? 0,
    locked: i < CURRENT_PERIOD_INDEX,
  }))
}

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0)
}

export function buildRow(
  partial: Omit<CostRow, 'actualsToDate' | 'ftc' | 'vac' | 'currentBudget' | 'isDirty'>,
): CostRow {
  const actualsToDate = sum(partial.periods.map((p) => p.actual))
  const currentBudget = partial.originalBudget + partial.approvedChanges
  const ftc = partial.eac - actualsToDate
  const vac = currentBudget - partial.eac
  return { ...partial, actualsToDate, currentBudget, ftc, vac, isDirty: false }
}

// ─── Seeded rows ─────────────────────────────────────────────────────────────

export const initialCostSheet: CostRow[] = [
  // ── Control account A.01 ─────────────────────────────────────────────────
  buildRow({
    id: 'A.01', parentId: null, level: 1,
    wbs: 'A.01', cbs: 'C-1000', description: 'Process Area A — Mechanical',
    discipline: 'Mechanical', costType: 'CAPEX', phase: 'Engineering', currency: 'USD',
    originalBudget: 84_000_000, approvedChanges: 2_100_000,
    commitments: 72_000_000, eac: 88_500_000,
    periods: makePeriods(
      [1_200_000, 2_800_000, 5_400_000, 8_200_000, 10_100_000, 9_600_000, 0,0,0,0,0,0],
      [0,0,0,0,0,9_600_000, 11_200_000, 10_800_000, 9_900_000, 9_000_000, 7_800_000, 6_900_000],
    ),
    notes: 'Revised EAC per June progress review.', lastModifiedBy: 'Maya Chen', lastModifiedAt: '2026-06-10 14:22', isExpanded: true,
  }),

  buildRow({
    id: 'A.01.01', parentId: 'A.01', level: 2,
    wbs: 'A.01.01', cbs: 'C-1100', description: 'Equipment supply — static',
    discipline: 'Mechanical', costType: 'CAPEX', phase: 'Engineering', currency: 'USD',
    originalBudget: 38_000_000, approvedChanges: 1_200_000,
    commitments: 36_000_000, eac: 40_500_000,
    periods: makePeriods(
      [800_000, 1_600_000, 3_200_000, 5_100_000, 6_200_000, 5_800_000, 0,0,0,0,0,0],
      [0,0,0,0,0,5_800_000, 6_500_000, 6_200_000, 5_600_000, 5_000_000, 4_000_000, 3_100_000],
    ),
    notes: '', lastModifiedBy: 'Maya Chen', lastModifiedAt: '2026-06-10 14:22', isExpanded: false,
  }),

  buildRow({
    id: 'A.01.02', parentId: 'A.01', level: 2,
    wbs: 'A.01.02', cbs: 'C-1200', description: 'Equipment supply — rotating',
    discipline: 'Mechanical', costType: 'CAPEX', phase: 'Procurement', currency: 'USD',
    originalBudget: 28_000_000, approvedChanges: 600_000,
    commitments: 24_500_000, eac: 29_800_000,
    periods: makePeriods(
      [300_000, 900_000, 1_800_000, 2_600_000, 3_100_000, 2_900_000, 0,0,0,0,0,0],
      [0,0,0,0,0,2_900_000, 3_800_000, 3_600_000, 3_400_000, 3_000_000, 2_600_000, 2_500_000],
    ),
    notes: 'Vendor delivery slip — EAC revised +USD 1.2M.', lastModifiedBy: 'Maya Chen', lastModifiedAt: '2026-06-09 11:05', isExpanded: false,
  }),

  buildRow({
    id: 'A.01.03', parentId: 'A.01', level: 2,
    wbs: 'A.01.03', cbs: 'C-1300', description: 'Installation labour',
    discipline: 'Mechanical', costType: 'CAPEX', phase: 'Construction', currency: 'USD',
    originalBudget: 18_000_000, approvedChanges: 300_000,
    commitments: 11_500_000, eac: 18_200_000,
    periods: makePeriods(
      [100_000, 300_000, 400_000, 500_000, 800_000, 900_000, 0,0,0,0,0,0],
      [0,0,0,0,0,900_000, 900_000, 1_000_000, 900_000, 1_000_000, 1_200_000, 1_300_000],
    ),
    notes: '', lastModifiedBy: 'Unassigned', lastModifiedAt: '', isExpanded: false,
  }),

  // ── Control account A.02 ─────────────────────────────────────────────────
  buildRow({
    id: 'A.02', parentId: null, level: 1,
    wbs: 'A.02', cbs: 'C-2000', description: 'Process Area A — Piping',
    discipline: 'Piping', costType: 'CAPEX', phase: 'Construction', currency: 'USD',
    originalBudget: 61_000_000, approvedChanges: 900_000,
    commitments: 52_000_000, eac: 65_400_000,
    periods: makePeriods(
      [600_000, 1_400_000, 3_000_000, 5_500_000, 7_800_000, 8_400_000, 0,0,0,0,0,0],
      [0,0,0,0,0,8_400_000, 9_200_000, 8_800_000, 8_400_000, 7_600_000, 6_000_000, 4_700_000],
    ),
    notes: 'Piping productivity lower than baseline; EAC under review.', lastModifiedBy: 'Omar Haddad', lastModifiedAt: '2026-06-11 09:30', isExpanded: true,
  }),

  buildRow({
    id: 'A.02.01', parentId: 'A.02', level: 2,
    wbs: 'A.02.01', cbs: 'C-2100', description: 'Piping materials',
    discipline: 'Piping', costType: 'CAPEX', phase: 'Construction', currency: 'USD',
    originalBudget: 31_000_000, approvedChanges: 400_000,
    commitments: 30_000_000, eac: 32_200_000,
    periods: makePeriods(
      [400_000, 900_000, 2_100_000, 4_000_000, 5_400_000, 5_600_000, 0,0,0,0,0,0],
      [0,0,0,0,0,5_600_000, 5_800_000, 5_200_000, 4_600_000, 3_800_000, 2_600_000, 1_400_000],
    ),
    notes: '', lastModifiedBy: 'Omar Haddad', lastModifiedAt: '2026-06-11 09:30', isExpanded: false,
  }),

  buildRow({
    id: 'A.02.02', parentId: 'A.02', level: 2,
    wbs: 'A.02.02', cbs: 'C-2200', description: 'Piping installation labour',
    discipline: 'Piping', costType: 'CAPEX', phase: 'Construction', currency: 'USD',
    originalBudget: 30_000_000, approvedChanges: 500_000,
    commitments: 22_000_000, eac: 33_200_000,
    periods: makePeriods(
      [200_000, 500_000, 900_000, 1_500_000, 2_400_000, 2_800_000, 0,0,0,0,0,0],
      [0,0,0,0,0,2_800_000, 3_400_000, 3_600_000, 3_800_000, 3_800_000, 3_400_000, 3_300_000],
    ),
    notes: 'Spoolpiece rework driving labour overrun.', lastModifiedBy: 'Omar Haddad', lastModifiedAt: '2026-06-11 09:30', isExpanded: false,
  }),

  // ── Control account P.04 ─────────────────────────────────────────────────
  buildRow({
    id: 'P.04', parentId: null, level: 1,
    wbs: 'P.04', cbs: 'C-5000', description: 'Procurement — Rotating equipment',
    discipline: 'Procurement', costType: 'CAPEX', phase: 'Procurement', currency: 'USD',
    originalBudget: 96_000_000, approvedChanges: 0,
    commitments: 94_000_000, eac: 97_200_000,
    periods: makePeriods(
      [2_000_000, 4_000_000, 8_000_000, 12_000_000, 16_000_000, 16_500_000, 0,0,0,0,0,0],
      [0,0,0,0,0,16_500_000, 14_000_000, 12_000_000, 10_000_000, 8_000_000, 6_200_000, 5_200_000],
    ),
    notes: '', lastModifiedBy: 'Leila Mansouri', lastModifiedAt: '2026-06-08 16:00', isExpanded: false,
  }),

  // ── Control account U.02 ─────────────────────────────────────────────────
  buildRow({
    id: 'U.02', parentId: null, level: 1,
    wbs: 'U.02', cbs: 'C-7000', description: 'Utilities & Offsites',
    discipline: 'Civil', costType: 'CAPEX', phase: 'Construction', currency: 'USD',
    originalBudget: 48_000_000, approvedChanges: 1_400_000,
    commitments: 38_000_000, eac: 48_600_000,
    periods: makePeriods(
      [800_000, 1_800_000, 3_200_000, 4_800_000, 6_200_000, 6_600_000, 0,0,0,0,0,0],
      [0,0,0,0,0,6_600_000, 7_200_000, 7_000_000, 6_800_000, 5_800_000, 4_000_000, 2_900_000],
    ),
    notes: '', lastModifiedBy: 'Unassigned', lastModifiedAt: '', isExpanded: false,
  }),

  // ── Project contingency & management reserve ─────────────────────────────
  buildRow({
    id: 'CN.00', parentId: null, level: 0,
    wbs: 'CN.00', cbs: 'C-9000', description: 'Project contingency reserve',
    discipline: 'Project Controls', costType: 'Contingency', phase: 'Engineering', currency: 'USD',
    originalBudget: 18_500_000, approvedChanges: 0,
    commitments: 0, eac: 18_500_000,
    periods: makePeriods(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ),
    notes: 'AACE Class 3 contingency — auto-draw on approved changes per draw rules.',
    lastModifiedBy: 'Cost Engineer', lastModifiedAt: '2026-06-01 10:00', isExpanded: true,
  }),
  buildRow({
    id: 'MR.00', parentId: null, level: 0,
    wbs: 'MR.00', cbs: 'C-9100', description: 'Management reserve',
    discipline: 'Project Controls', costType: 'Management Reserve', phase: 'Engineering', currency: 'USD',
    originalBudget: 12_000_000, approvedChanges: 0,
    commitments: 0, eac: 12_000_000,
    periods: makePeriods(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ),
    notes: 'Owner-controlled reserve for changes above $1M threshold.',
    lastModifiedBy: 'Project Director', lastModifiedAt: '2026-06-01 10:00', isExpanded: true,
  }),
]
