/**
 * Tracked edge cases for enterprise readiness — link each to a test as coverage grows.
 */
export interface EdgeCaseEntry {
  id: string
  domain: 'cost' | 'change' | 'forecast' | 'portfolio' | 'integration' | 'audit'
  title: string
  scenario: string
  expectedBehavior: string
  testFile?: string
  status: 'open' | 'covered' | 'deferred'
}

export const edgeCaseRegister: EdgeCaseEntry[] = [
  {
    id: 'EC-COST-001',
    domain: 'cost',
    title: 'WBS parent/child double-count',
    scenario: 'Sum all cost sheet rows for project BAC',
    expectedBehavior: 'Totals use control accounts only (parentId === null)',
    testFile: 'src/engine/costAggregation.test.ts',
    status: 'covered',
  },
  {
    id: 'EC-COST-002',
    domain: 'cost',
    title: 'Contingency double-draw',
    scenario: 'Same risk draws CN.00 twice in one period',
    expectedBehavior: 'Second draw rejected or idempotent reconcile',
    status: 'open',
  },
  {
    id: 'EC-CHG-001',
    domain: 'change',
    title: 'Forecast variance vs budget change',
    scenario: 'CO tagged forecast_variance must not move BAC',
    expectedBehavior: 'Mechanism drives forecast only; BAC unchanged',
    testFile: 'src/engine/forecast.test.ts',
    status: 'covered',
  },
  {
    id: 'EC-FCT-001',
    domain: 'forecast',
    title: 'Locked period override',
    scenario: 'User edits cost sheet in closed period',
    expectedBehavior: 'Validation gate or audit compensating entry',
    status: 'open',
  },
  {
    id: 'EC-PRT-001',
    domain: 'portfolio',
    title: 'Inactive benchmark drift',
    scenario: 'Non-active portfolio project metrics stale',
    expectedBehavior: 'Only active project syncs; benchmarks labeled as-of date',
    status: 'open',
  },
  {
    id: 'EC-INT-001',
    domain: 'integration',
    title: 'Partial ERP actuals load',
    scenario: 'SAP load missing WBS subset',
    expectedBehavior: 'Validation report; no silent overwrite of unmatched rows',
    testFile: 'server/src/integrations/connectorRegistry.test.ts',
    status: 'covered',
  },
  {
    id: 'EC-AUD-001',
    domain: 'audit',
    title: 'Client forged audit entry',
    scenario: 'POST ADD_AUDIT action from browser',
    expectedBehavior: 'Server rejects; audit append-only via API layer',
    testFile: 'server/src/auth/actionPolicy.test.ts',
    status: 'covered',
  },
]
