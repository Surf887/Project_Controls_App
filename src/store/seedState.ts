import {
  defaultConnectors,
} from '../integrations/connectors'
import {
  seedBurdenRules,
  seedCbsNodes,
  seedLongLeadItems,
  seedProgressCredits,
  seedRuleOfCreditTemplates,
} from '../data/controlsConfig'
import {
  contracts,
  fieldDailyReports,
  fieldObservations,
  invoices,
  rfqBids,
  subcontracts,
  turnoverChecklists,
} from '../data/procurementFlow'
import {
  seedAuditLog,
  seedChangeApprovalHistory,
  seedForecastApprovals,
  seedPortfolioProjects,
} from '../data/governance'
import { seedManualAccruals } from '../data/accruals'
import { vendorMaster } from '../data/vendors'
import { buildAccrualRegister } from '../engine/accruals'
import { reconcileContingencyDraws, applyContingencyDrawsToCostSheet } from '../engine/contingency'
import { enrichCostSheetRows, enrichExtractedValues } from '../engine/sccs'
import { initialCostSheet } from '../data/costSheet'
import {
  extractedValues as seededExtractedValues,
  reportDocuments as seededReportDocuments,
} from '../data/projectData'
import {
  commissioningSystems,
  expeditingMilestones,
  productivityTrend,
  punchList,
  purchaseOrders,
  workFronts,
} from '../data/phases'
import {
  actionRegister,
  changeRegister,
  contractClaims,
  decisionLog,
  issueRegister,
  lessonsLearned,
  opportunityRegister,
  riskRegister,
} from '../data/registers'
import {
  defaultBasisOfEstimate,
  defaultProjectSettings,
  seedDeliverables,
  seedFxRates,
  type ProjectState,
  type WbsNode,
} from './types'

function wbsFromCostSheet(): WbsNode[] {
  return initialCostSheet.map((row) => ({
    id: row.id,
    wbs: row.wbs,
    parentWbs: row.parentId,
    description: row.description,
    costType: row.costType,
    phase: row.phase,
    discipline: row.discipline,
    originalBudget: row.originalBudget,
    currency: 'USD' as const,
  }))
}

export function createSeedState(): ProjectState {
  const base: ProjectState = {
    meta: {
      id: 'proj-demo-001',
      name: 'Process Area A Expansion',
      baselineLabel: 'Rev 3 — Jun-26',
    },
    settings: defaultProjectSettings,
    basisOfEstimate: defaultBasisOfEstimate,
    wbsNodes: wbsFromCostSheet(),
    costSheetRows: enrichCostSheetRows(initialCostSheet),
    deliverables: seedDeliverables,
    changes: changeRegister.map((change) => ({
      ...change,
      approvalHistory: seedChangeApprovalHistory()[change.id] ?? change.approvalHistory ?? [],
    })),
    risks: riskRegister,
    opportunities: opportunityRegister,
    issues: issueRegister,
    actions: actionRegister,
    decisions: decisionLog,
    lessons: lessonsLearned,
    claims: contractClaims,
    vendors: vendorMaster,
    purchaseOrders,
    contracts,
    rfqBids,
    invoices,
    subcontracts,
    fieldDailyReports,
    fieldObservations,
    turnoverChecklists,
    expeditingMilestones,
    workFronts,
    productivityTrend,
    commissioningSystems,
    punchList,
    contingencyDraws: [],
    fxRates: seedFxRates,
    connectors: defaultConnectors,
    syncJobs: [],
    ruleOfCreditTemplates: seedRuleOfCreditTemplates,
    progressCredits: seedProgressCredits,
    longLeadItems: seedLongLeadItems,
    cbsNodes: seedCbsNodes,
    burdenRules: seedBurdenRules,
    costAccruals: buildAccrualRegister(subcontracts, purchaseOrders, invoices, seedManualAccruals),
    forecastApprovals: seedForecastApprovals,
    portfolioProjects: seedPortfolioProjects,
    auditLog: seedAuditLog,
    generatedTeamReports: [],
    reports: seededReportDocuments,
    values: enrichExtractedValues(seededExtractedValues),
    selectedValueId: seededExtractedValues[0]?.id ?? '',
    scheduleActivities: [],
    scheduleRelationships: [],
    scheduleImports: [],
    forecastDrivers: [],
    sourceDocuments: [],
    mappingProfiles: [],
    costTransactions: [],
    costTransactionBatches: [],
    ingestionPostings: [],
  }

  const contingencyDraws = reconcileContingencyDraws(
    base.changes,
    base.contingencyDraws,
    base.settings.contingencyRules,
    base.costSheetRows,
  )

  return {
    ...base,
    contingencyDraws,
    costSheetRows: applyContingencyDrawsToCostSheet(base.costSheetRows, contingencyDraws),
  }
}

/** Empty, truthful production bootstrap; reference dictionaries remain available for setup. */
export function createBlankProjectState(id: string, name: string): ProjectState {
  const seed = createSeedState()
  const now = new Date()
  const reportingPeriod = now.toLocaleString('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).replace(' ', '-')
  return {
    ...seed,
    meta: { id, name, baselineLabel: 'Working baseline' },
    settings: {
      ...seed.settings,
      contingencyRules: { ...seed.settings.contingencyRules },
      fx: { ...seed.settings.fx },
      reportingPeriod: { period: reportingPeriod, locked: false },
    },
    basisOfEstimate: {
      scope: '',
      methodology: '',
      designBasis: '',
      allowances: '',
      exclusions: '',
      risksOpportunities: '',
      lastUpdated: new Date().toISOString().slice(0, 10),
      preparedBy: '',
    },
    wbsNodes: [],
    costSheetRows: [],
    deliverables: [],
    changes: [],
    risks: [],
    opportunities: [],
    issues: [],
    actions: [],
    decisions: [],
    lessons: [],
    claims: [],
    vendors: [],
    purchaseOrders: [],
    contracts: [],
    rfqBids: [],
    invoices: [],
    subcontracts: [],
    fieldDailyReports: [],
    fieldObservations: [],
    turnoverChecklists: [],
    expeditingMilestones: [],
    workFronts: [],
    productivityTrend: [],
    commissioningSystems: [],
    punchList: [],
    contingencyDraws: [],
    fxRates: [],
    connectors: [],
    syncJobs: [],
    progressCredits: [],
    longLeadItems: [],
    costAccruals: [],
    forecastApprovals: [],
    portfolioProjects: [],
    auditLog: [],
    generatedTeamReports: [],
    reports: [],
    values: [],
    selectedValueId: '',
    scheduleActivities: [],
    scheduleRelationships: [],
    scheduleImports: [],
    forecastDrivers: [],
    sourceDocuments: [],
    mappingProfiles: [],
    costTransactions: [],
    costTransactionBatches: [],
    ingestionApplications: [],
    ingestionPostings: [],
  }
}
