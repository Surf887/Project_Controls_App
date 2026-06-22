import { sumBac, sumCostSheetMetric } from './costAggregation'
import { buildPoExposures, computeFxRiskUsd } from './forex'
import { subcontractMetrics } from './procurementReconcile'
import type { ProjectState } from '../store/types'
import { costControlLogs, type CostControlLogType } from '../data/costControlLogs'

export interface CostControlLogStat {
  log: CostControlLogType
  headline: string
  detail: string
  openCount: number
  status: 'ok' | 'watch' | 'action'
}

const pendingChangeStatuses = new Set(['draft', 'submitted', 'under_review', 'pending'])
const mocMechanisms = new Set(['scope_change', 'budget_change'])
const claimPattern = /claim|dispute|entitlement/i
const rentalPattern = /crane|rental|generator|vessel hire|temporary facilit|rigging/i
const equipmentCbsPattern = /^C-3/

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function buildCostControlLogStats(state: ProjectState): CostControlLogStat[] {
  const bac = sumBac(state.costSheetRows)
  const current = sumCostSheetMetric(state.costSheetRows, 'currentBudget')
  const actuals = sumCostSheetMetric(state.costSheetRows, 'actualsToDate')
  const eac = sumCostSheetMetric(state.costSheetRows, 'eac')

  const openChanges = state.changes.filter((c) => pendingChangeStatuses.has(c.status))
  const pendingChangeUsd = openChanges.reduce((sum, c) => sum + c.costImpactUsd * c.probability, 0)

  const openRisks = state.risks.filter((r) => r.status !== 'closed' && r.status !== 'realised')
  const riskExposure = openRisks.reduce((sum, r) => sum + r.costExposureUsd, 0)

  const openOpportunities = state.opportunities.filter((o) => o.status !== 'closed')
  const opportunityUsd = openOpportunities.reduce((sum, o) => sum + o.costSavingUsd * (o.likelihood / 5), 0)

  const accrualTotal = state.costAccruals.reduce((sum, row) => sum + row.accrualUsd, 0)
  const unpaidInvoices = state.invoices.filter((inv) => inv.status !== 'paid')
  const invoiceOpenUsd = unpaidInvoices.reduce((sum, inv) => sum + inv.amountUsd, 0)

  const poCommitted = state.purchaseOrders.reduce((sum, po) => sum + po.committedUsd, 0)
  const contingencyRemaining = state.costSheetRows
    .filter((row) => row.wbs.startsWith('CN.'))
    .reduce((sum, row) => sum + Math.max(0, row.currentBudget - row.actualsToDate), 0)
  const contingencyDrawn = state.contingencyDraws.reduce((sum, d) => sum + d.amountUsd, 0)

  const timesheetAccruals = state.costAccruals.filter((a) => a.sourceType === 'timesheet').length
  const fieldReports = state.fieldDailyReports.length

  const lliOpen = state.longLeadItems.filter((item) => item.status !== 'installed').length
  const expeditingOpen = state.expeditingMilestones.filter((m) => m.status !== 'complete').length

  const trendSignals = openChanges.length + state.issues.filter((i) => i.status === 'open').length

  const forecastPackages = state.forecastApprovals.length
  const forecastPending = state.forecastApprovals.filter((p) => p.status === 'draft' || p.status === 'under_review').length

  const commercialIssues = state.issues.filter(
    (issue) =>
      issue.status !== 'closed' &&
      (issue.severity === 'high' ||
        issue.severity === 'critical' ||
        claimPattern.test(`${issue.title} ${issue.description}`)),
  )
  const openClaims = state.claims.filter(
    (claim) => claim.status !== 'settled' && claim.status !== 'rejected',
  )
  const claimExposure =
    openClaims.reduce((sum, claim) => sum + claim.costExposureUsd, 0) +
    commercialIssues.reduce((sum, issue) => sum + issue.costImpactUsd, 0)

  const equipmentRows = state.costSheetRows.filter(
    (row) =>
      row.parentId === null &&
      (equipmentCbsPattern.test(row.cbs) || rentalPattern.test(row.description)),
  )
  const equipmentBudget = equipmentRows.reduce((sum, row) => sum + row.currentBudget, 0)
  const rentalPos = state.purchaseOrders.filter((po) => rentalPattern.test(po.description))

  const scMetrics = subcontractMetrics(state.subcontracts)
  const activeSubcontracts = state.subcontracts.filter(
    (sc) => sc.status === 'active' || sc.status === 'executed',
  )

  const pendingMoc = state.changes.filter(
    (change) => pendingChangeStatuses.has(change.status) && mocMechanisms.has(change.mechanism),
  )
  const pendingDecisions = state.decisions.filter((decision) => decision.status === 'pending')

  const controlAccounts = state.costSheetRows.filter((row) => row.parentId === null)
  const unmappedCbs = controlAccounts.filter((row) => !row.cbs.trim())
  const wbsMappingPct = Math.round(
    ((controlAccounts.length - unmappedCbs.length) / Math.max(controlAccounts.length, 1)) * 100,
  )

  const fxExposures = buildPoExposures(state.purchaseOrders, state.fxRates)
  const fxRisk = computeFxRiskUsd(fxExposures, state.settings.fx.adverseMovePct)
  const foreignPos = state.purchaseOrders.filter((po) => po.currency !== 'USD')

  const costLessons = state.lessons.filter(
    (lesson) =>
      lesson.category === 'What went wrong' ||
      /cost|budget|forecast|accrual|contingency|claim/i.test(`${lesson.title} ${lesson.description}`),
  )
  const draftLessons = state.lessons.filter((lesson) => lesson.status === 'draft')

  const statsById: Record<string, Omit<CostControlLogStat, 'log'>> = {
    budget: {
      headline: formatUsd(current),
      detail: `BAC ${formatUsd(bac)} · approved Δ ${formatUsd(current - bac)}`,
      openCount: 0,
      status: 'ok',
    },
    commitment: {
      headline: formatUsd(poCommitted),
      detail: `${state.purchaseOrders.length} POs · ${state.contracts.length} contracts`,
      openCount: state.purchaseOrders.filter((po) => po.status !== 'closed').length,
      status: poCommitted > bac * 0.85 ? 'watch' : 'ok',
    },
    change: {
      headline: `${openChanges.length} open`,
      detail: `Pending exposure ${formatUsd(pendingChangeUsd)}`,
      openCount: openChanges.length,
      status: openChanges.length > 3 ? 'action' : 'ok',
    },
    trend: {
      headline: `${trendSignals} signals`,
      detail: 'Pending changes + open cost issues (pre-formal CO)',
      openCount: trendSignals,
      status: trendSignals > 5 ? 'watch' : 'ok',
    },
    forecast: {
      headline: formatUsd(eac),
      detail: `${forecastPackages} packages · ${forecastPending} awaiting sign-off`,
      openCount: forecastPending,
      status: forecastPending > 0 ? 'watch' : 'ok',
    },
    actual: {
      headline: formatUsd(actuals),
      detail: `${((actuals / Math.max(current, 1)) * 100).toFixed(0)}% of current budget consumed`,
      openCount: 0,
      status: actuals > current ? 'watch' : 'ok',
    },
    invoice: {
      headline: formatUsd(invoiceOpenUsd),
      detail: `${unpaidInvoices.length} unpaid invoices`,
      openCount: unpaidInvoices.length,
      status: unpaidInvoices.length > 8 ? 'watch' : 'ok',
    },
    accrual: {
      headline: formatUsd(accrualTotal),
      detail: `${state.costAccruals.length} accrual lines this period`,
      openCount: state.costAccruals.filter((a) => a.status !== 'posted').length,
      status: accrualTotal > actuals * 0.15 ? 'watch' : 'ok',
    },
    risk: {
      headline: formatUsd(riskExposure),
      detail: `${openRisks.length} open risks · ${formatUsd(opportunityUsd)} opportunity`,
      openCount: openRisks.length + openOpportunities.length,
      status: riskExposure > contingencyRemaining ? 'action' : 'ok',
    },
    contingency: {
      headline: formatUsd(contingencyRemaining),
      detail: `${formatUsd(contingencyDrawn)} drawn · CN.00 balance`,
      openCount: state.contingencyDraws.length,
      status: contingencyRemaining < contingencyDrawn ? 'watch' : 'ok',
    },
    manpower: {
      headline: `${fieldReports} field days`,
      detail: `${timesheetAccruals} timesheet accrual lines · productivity tracked`,
      openCount: timesheetAccruals,
      status: 'ok',
    },
    'procurement-expediting': {
      headline: `${lliOpen} LLI open`,
      detail: `${expeditingOpen} expediting milestones · vendor delivery exposure`,
      openCount: lliOpen + expeditingOpen,
      status: lliOpen > 4 ? 'watch' : 'ok',
    },
    'contract-claims': {
      headline: formatUsd(claimExposure),
      detail: `${openClaims.length} contract claims · ${commercialIssues.length} linked commercial issues`,
      openCount: openClaims.length + commercialIssues.length,
      status: claimExposure > 1_000_000 ? 'action' : openClaims.length > 0 ? 'watch' : 'ok',
    },
    'equipment-rental': {
      headline: formatUsd(equipmentBudget),
      detail: `${equipmentRows.length} CBS equipment rows · ${rentalPos.length} rental POs`,
      openCount: equipmentRows.length + rentalPos.length,
      status: equipmentBudget > 0 ? 'ok' : 'watch',
    },
    subcontractor: {
      headline: formatUsd(scMetrics.totalValue),
      detail: `${activeSubcontracts.length} active packages · ${formatUsd(scMetrics.underBilled)} unbilled`,
      openCount: activeSubcontracts.length,
      status: scMetrics.underBilled > scMetrics.totalValue * 0.1 ? 'watch' : 'ok',
    },
    'management-of-change': {
      headline: `${pendingMoc.length} pending`,
      detail: `${pendingDecisions.length} board decisions awaiting sign-off`,
      openCount: pendingMoc.length + pendingDecisions.length,
      status: pendingMoc.length > 2 ? 'action' : pendingMoc.length > 0 ? 'watch' : 'ok',
    },
    'cost-code-wbs': {
      headline: `${wbsMappingPct}% mapped`,
      detail: `${state.wbsNodes.length} WBS nodes · ${unmappedCbs.length} control accounts missing CBS`,
      openCount: unmappedCbs.length,
      status: unmappedCbs.length > 0 ? 'watch' : 'ok',
    },
    'currency-fx': {
      headline: formatUsd(fxRisk.totalUnhedgedUsd),
      detail: `${foreignPos.length} foreign-currency POs · ${formatUsd(fxRisk.adverseImpactUsd)} adverse ${state.settings.fx.adverseMovePct}%`,
      openCount: foreignPos.length,
      status: fxRisk.totalUnhedgedUsd > 5_000_000 ? 'watch' : 'ok',
    },
    'lessons-learned': {
      headline: `${costLessons.length} cost lessons`,
      detail: `${draftLessons.length} draft · ${state.lessons.length} total captured`,
      openCount: draftLessons.length,
      status: draftLessons.length > 0 ? 'watch' : 'ok',
    },
  }

  return costControlLogs.map((log) => ({
    log,
    ...(statsById[log.id] ?? {
      headline: '—',
      detail: log.tracks,
      openCount: 0,
      status: 'ok' as const,
    }),
  }))
}
