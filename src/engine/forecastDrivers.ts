import type { ForecastDriver, ForecastDriverStatus } from '../data/forecastDrivers'
import type { ProjectState } from '../store/types'

function statusFor(sourceStatus: string): ForecastDriverStatus {
  if (sourceStatus === 'approved' || sourceStatus === 'settled' || sourceStatus === 'realised') return 'approved'
  if (sourceStatus === 'rejected' || sourceStatus === 'closed') return 'rejected'
  return 'in_review'
}

function nowFrom(value: string | undefined): string {
  if (value && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString()
  return new Date(0).toISOString()
}

export function driverExpectedValue(driver: ForecastDriver): number {
  if (
    driver.treatment === 'excluded' ||
    driver.status === 'rejected' ||
    driver.status === 'superseded' ||
    ((driver.sourceType === 'document' || driver.sourceType === 'manual') && driver.status !== 'approved')
  ) {
    return 0
  }
  const sign = driver.impactDirection === 'saving' ? -1 : 1
  const amount =
    driver.treatment === 'deterministic'
      ? driver.mostLikelyUsd
      : driver.mostLikelyUsd * driver.probability
  return sign * amount
}

export function buildForecastDriverLedger(state: ProjectState): ForecastDriver[] {
  const activeChangeIds = new Set(
    state.changes
      .filter((change) => change.status !== 'rejected' && change.status !== 'withdrawn')
      .map((change) => change.id),
  )
  const issueRiskIds = new Set(
    state.issues
      .filter((issue) => issue.status !== 'closed' && issue.linkedRiskId)
      .map((issue) => issue.linkedRiskId!),
  )

  const changes: ForecastDriver[] = state.changes.map((change) => ({
    id: `DRV-CHANGE-${change.id}`,
    title: change.title,
    sourceType: 'change',
    sourceEntityId: change.id,
    linkedEntityIds: change.linkedRiskId ? [change.linkedRiskId] : [],
    wbs: change.affectedWbs,
    impactDirection: change.costImpactUsd < 0 ? 'saving' : 'cost',
    lowUsd: Math.abs(change.costImpactUsd),
    mostLikelyUsd: Math.abs(change.costImpactUsd),
    highUsd: Math.abs(change.costImpactUsd),
    probability: change.status === 'approved' ? 1 : change.probability,
    scheduleImpactDays: change.scheduleImpactDays,
    treatment: change.status === 'approved' ? 'deterministic' : 'expected_value',
    status: statusFor(change.status),
    confidence: 1,
    rationale: change.rationale,
    createdAt: nowFrom(change.raisedAt),
    createdBy: change.raisedBy,
  }))

  const risks: ForecastDriver[] = state.risks.map((risk) => ({
    id: `DRV-RISK-${risk.id}`,
    title: risk.title,
    sourceType: 'risk',
    sourceEntityId: risk.id,
    linkedEntityIds: [],
    wbs: [],
    impactDirection: 'cost',
    lowUsd: risk.costExposureUsd * 0.5,
    mostLikelyUsd: risk.costExposureUsd,
    highUsd: risk.costExposureUsd * 1.1,
    probability: risk.postMitigationLikelihood / 5,
    scheduleImpactDays: risk.scheduleExposureDays,
    treatment: issueRiskIds.has(risk.id) ? 'excluded' : 'expected_value',
    status: statusFor(risk.status),
    confidence: 0.8,
    rationale: issueRiskIds.has(risk.id)
      ? `Superseded by a realised issue linked to ${risk.id}.`
      : risk.consequence,
    createdAt: nowFrom(risk.reviewDate),
    createdBy: risk.owner,
  }))

  const opportunities: ForecastDriver[] = state.opportunities.map((opportunity) => ({
    id: `DRV-OPP-${opportunity.id}`,
    title: opportunity.title,
    sourceType: 'opportunity',
    sourceEntityId: opportunity.id,
    linkedEntityIds: [],
    wbs: [],
    impactDirection: 'saving',
    lowUsd: opportunity.costSavingUsd * 0.5,
    mostLikelyUsd: opportunity.costSavingUsd,
    highUsd: opportunity.costSavingUsd,
    probability: opportunity.likelihood / 5,
    scheduleImpactDays: -Math.abs(opportunity.scheduleSavingDays),
    treatment: opportunity.status === 'realised' ? 'deterministic' : 'expected_value',
    status: statusFor(opportunity.status),
    confidence: 0.8,
    rationale: opportunity.benefit,
    createdAt: nowFrom(opportunity.reviewDate),
    createdBy: opportunity.owner,
  }))

  const issues: ForecastDriver[] = state.issues.map((issue) => ({
    id: `DRV-ISSUE-${issue.id}`,
    title: issue.title,
    sourceType: 'issue',
    sourceEntityId: issue.id,
    linkedEntityIds: issue.linkedRiskId ? [issue.linkedRiskId] : [],
    wbs: [],
    impactDirection: issue.costImpactUsd < 0 ? 'saving' : 'cost',
    lowUsd: Math.abs(issue.costImpactUsd),
    mostLikelyUsd: Math.abs(issue.costImpactUsd),
    highUsd: Math.abs(issue.costImpactUsd),
    probability: issue.status === 'closed' ? 0 : 1,
    scheduleImpactDays: issue.scheduleImpactDays,
    treatment: issue.status === 'closed' ? 'excluded' : 'deterministic',
    status: statusFor(issue.status),
    confidence: 1,
    rationale: issue.resolution || issue.description,
    createdAt: nowFrom(issue.raisedAt),
    createdBy: issue.raisedBy,
  }))

  const claimProbability: Record<string, number> = {
    draft: 0.25,
    submitted: 0.5,
    under_review: 0.65,
    negotiating: 0.75,
    approved: 1,
    settled: 1,
    rejected: 0,
  }
  const claims: ForecastDriver[] = state.claims.map((claim) => {
    const duplicate = Boolean(claim.linkedChangeId && activeChangeIds.has(claim.linkedChangeId))
    return {
      id: `DRV-CLAIM-${claim.id}`,
      title: claim.title,
      sourceType: 'claim',
      sourceEntityId: claim.id,
      linkedEntityIds: claim.linkedChangeId ? [claim.linkedChangeId] : [],
      wbs: claim.wbs ? [claim.wbs] : [],
      impactDirection: 'cost',
      lowUsd: claim.costExposureUsd * 0.5,
      mostLikelyUsd: claim.costExposureUsd,
      highUsd: claim.costExposureUsd * 1.2,
      probability: claimProbability[claim.status] ?? 0.5,
      scheduleImpactDays: 0,
      treatment: duplicate
        ? 'excluded'
        : claim.status === 'approved' || claim.status === 'settled'
          ? 'deterministic'
          : 'expected_value',
      status: statusFor(claim.status),
      confidence: 0.75,
      rationale: duplicate
        ? `Excluded because linked change ${claim.linkedChangeId} already carries the exposure.`
        : claim.entitlementBasis,
      createdAt: nowFrom(claim.submittedAt),
      createdBy: claim.owner,
    } satisfies ForecastDriver
  })

  return [...changes, ...risks, ...opportunities, ...issues, ...claims, ...(state.forecastDrivers ?? [])]
}

/** Drivers not already represented by the legacy risk/change/opportunity engine. */
export function supplementalForecastDrivers(state: ProjectState): ForecastDriver[] {
  return buildForecastDriverLedger(state).filter((driver) =>
    driver.sourceType === 'issue' ||
    driver.sourceType === 'claim' ||
    driver.sourceType === 'document' ||
    driver.sourceType === 'manual',
  )
}

export function supersededRiskIds(state: ProjectState): Set<string> {
  return new Set(
    state.issues
      .filter((issue) => issue.status !== 'closed' && issue.linkedRiskId)
      .map((issue) => issue.linkedRiskId!),
  )
}
