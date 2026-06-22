import type { ChangeItem, RiskItem } from '../data/registers'
import type { MonteCarloResult, ScenarioInputs } from '../store/types'

function randomTriangular(min: number, mode: number, max: number): number {
  const u = Math.random()
  const f = (mode - min) / (max - min)
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (mode - min))
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode))
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[index]
}

export function runMonteCarlo(
  baseEac: number,
  changes: ChangeItem[],
  risks: RiskItem[],
  inputs: ScenarioInputs,
  iterations = 2000,
): MonteCarloResult {
  const samples: number[] = []

  for (let i = 0; i < iterations; i += 1) {
    const productivity = randomTriangular(inputs.productivityFactor * 0.85, inputs.productivityFactor, inputs.productivityFactor * 1.15)
    const productivityDelta = baseEac * (1 / productivity - 1) * 0.35

    const pendingDelta = changes
      .filter((change) => change.status === 'pending' || change.status === 'under_review')
      .reduce((sum, change) => {
        const low = change.costImpactUsd * 0.8
        const high = change.costImpactUsd * 1.2
        const sampled = randomTriangular(low, change.costImpactUsd, high)
        return sum + sampled * inputs.changeApprovalProbability
      }, 0)

    const riskDelta = risks
      .filter((risk) => risk.status !== 'closed' && risk.status !== 'rejected')
      .reduce((sum, risk) => {
        const low = risk.costExposureUsd * 0.5
        const high = risk.costExposureUsd * 1.1
        const probability = risk.postMitigationLikelihood / 5
        return sum + randomTriangular(low, risk.costExposureUsd, high) * probability
      }, 0)

    const escalation = baseEac * (inputs.escalationRatePct / 100) * 0.25
    const scopeGrowth = baseEac * (inputs.scopeGrowthPct / 100)
    const scheduleBurn = inputs.scheduleExtensionMonths * 1_800_000
    const contingencyDraw = baseEac * (inputs.contingencyDrawPct / 100) * 0.1

    samples.push(
      baseEac + productivityDelta + pendingDelta + riskDelta + escalation + scopeGrowth + scheduleBurn - contingencyDraw,
    )
  }

  samples.sort((a, b) => a - b)

  const drivers = [
    { label: 'Productivity', impact: baseEac * Math.abs(inputs.productivityFactor - 1) * 0.35 },
    { label: 'Pending changes', impact: changes.filter((c) => c.status === 'pending').reduce((s, c) => s + c.costImpactUsd, 0) },
    { label: 'Open risks', impact: risks.filter((r) => r.status !== 'closed').reduce((s, r) => s + r.costExposureUsd * (r.postMitigationLikelihood / 5), 0) },
    { label: 'Escalation', impact: baseEac * (inputs.escalationRatePct / 100) * 0.25 },
    { label: 'Scope growth', impact: baseEac * (inputs.scopeGrowthPct / 100) },
    { label: 'Schedule extension', impact: inputs.scheduleExtensionMonths * 1_800_000 },
  ]
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 6)

  return {
    p10: percentile(samples, 10),
    p50: percentile(samples, 50),
    p90: percentile(samples, 90),
    samples,
    drivers,
  }
}
