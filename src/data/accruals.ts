import type { CostAccrualEntry } from '../store/types'

export const seedManualAccruals: CostAccrualEntry[] = [
  {
    id: 'ACR-MAN-001',
    period: 'Jun-26',
    wbs: 'A.02.02',
    description: 'Piping labour — week ending 7 Jun (timesheet lag)',
    sourceType: 'timesheet',
    sourceRef: 'TS-W24-PIP',
    basisAmountUsd: 420_000,
    settledAmountUsd: 0,
    accrualUsd: 420_000,
    status: 'reviewed',
    calculationMethod: 'Approved timesheets not yet in AP/ERP',
    owner: 'Northfield Construction',
    notes: 'Contractor payroll cutoff 5 Jun; invoice expected W25.',
  },
  {
    id: 'ACR-MAN-002',
    period: 'Jun-26',
    wbs: 'U.02',
    description: 'Civil concrete pour — material ticket accrual',
    sourceType: 'manual',
    sourceRef: 'MT-2026-0612',
    basisAmountUsd: 185_000,
    settledAmountUsd: 0,
    accrualUsd: 185_000,
    status: 'draft',
    calculationMethod: 'Material delivery tickets without vendor invoice',
    owner: 'Cost Engineer',
    notes: 'Awaiting batch invoice from ready-mix supplier.',
  },
]
