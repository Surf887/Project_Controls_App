import { createSeedState } from './seedState'
import type { ProjectState } from './types'

export const projectStorageKey = 'project-controls-platform-v2'

/**
 * Bump this whenever the persisted ProjectState shape changes in a way that
 * makes old saved payloads unsafe to shallow-merge. On load we discard any
 * payload whose embedded schemaVersion is missing or different, rather than
 * merging stale shapes onto the current seed.
 */
export const schemaVersion = 6

/** Envelope persisted to localStorage: state plus the schema it was saved under. */
interface PersistedEnvelope {
  schemaVersion: number
  state: Partial<ProjectState>
}

export function loadProjectState(): ProjectState {
  const fallback = createSeedState()

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(projectStorageKey)
    if (!raw) {
      return fallback
    }

    const envelope = JSON.parse(raw) as Partial<PersistedEnvelope>
    // Discard persisted state when the schema is missing or mismatched instead
    // of merging an out-of-date shape onto the current seed state.
    if (envelope.schemaVersion !== schemaVersion || !envelope.state) {
      return fallback
    }

    const parsed = envelope.state
    if (!parsed.meta || !Array.isArray(parsed.costSheetRows)) {
      return fallback
    }

    return {
      ...fallback,
      ...parsed,
      meta: { ...fallback.meta, ...parsed.meta },
      settings: {
        ...fallback.settings,
        ...parsed.settings,
        contingencyRules: {
          ...fallback.settings.contingencyRules,
          ...parsed.settings?.contingencyRules,
        },
        fx: { ...fallback.settings.fx, ...parsed.settings?.fx },
        reportingPeriod: {
          ...fallback.settings.reportingPeriod,
          ...parsed.settings?.reportingPeriod,
        },
      },
      basisOfEstimate: { ...fallback.basisOfEstimate, ...parsed.basisOfEstimate },
      deliverables: parsed.deliverables ?? fallback.deliverables,
      contingencyDraws: parsed.contingencyDraws ?? fallback.contingencyDraws,
      fxRates: parsed.fxRates ?? fallback.fxRates,
      connectors: parsed.connectors ?? fallback.connectors,
      syncJobs: parsed.syncJobs ?? fallback.syncJobs,
      ruleOfCreditTemplates: parsed.ruleOfCreditTemplates ?? fallback.ruleOfCreditTemplates,
      progressCredits: parsed.progressCredits ?? fallback.progressCredits,
      longLeadItems: parsed.longLeadItems ?? fallback.longLeadItems,
      cbsNodes: parsed.cbsNodes ?? fallback.cbsNodes,
      burdenRules: parsed.burdenRules ?? fallback.burdenRules,
      generatedTeamReports: parsed.generatedTeamReports ?? fallback.generatedTeamReports,
      forecastApprovals: parsed.forecastApprovals ?? fallback.forecastApprovals,
      portfolioProjects: parsed.portfolioProjects ?? fallback.portfolioProjects,
      auditLog: parsed.auditLog ?? fallback.auditLog,
      claims: parsed.claims ?? fallback.claims,
      vendors: parsed.vendors ?? fallback.vendors,
      costAccruals: parsed.costAccruals ?? fallback.costAccruals,
      contracts: parsed.contracts ?? fallback.contracts,
      rfqBids: parsed.rfqBids ?? fallback.rfqBids,
      invoices: parsed.invoices ?? fallback.invoices,
      subcontracts: parsed.subcontracts ?? fallback.subcontracts,
      fieldDailyReports: parsed.fieldDailyReports ?? fallback.fieldDailyReports,
      fieldObservations: parsed.fieldObservations ?? fallback.fieldObservations,
      turnoverChecklists: parsed.turnoverChecklists ?? fallback.turnoverChecklists,
      purchaseOrders: parsed.purchaseOrders?.map((po, index) => ({
        ...fallback.purchaseOrders[index],
        ...po,
      })) ?? fallback.purchaseOrders,
    }
  } catch {
    return fallback
  }
}

export function saveProjectState(state: ProjectState) {
  if (typeof window === 'undefined') {
    return
  }

  const envelope: PersistedEnvelope = { schemaVersion, state }
  try {
    window.localStorage.setItem(projectStorageKey, JSON.stringify(envelope))
  } catch (error) {
    // QuotaExceededError (or storage being unavailable) must not crash the app.
    // Surface it for diagnostics; the in-memory state remains the source of truth.
    console.error('Failed to persist project state to localStorage:', error)
  }
}

export function clearProjectState() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(projectStorageKey)
}
