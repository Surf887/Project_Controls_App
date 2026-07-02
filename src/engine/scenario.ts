import type { ChangeItem, RiskItem } from '../data/registers'
import type { MonteCarloResult, ScenarioInputs } from '../store/types'

/**
 * Deterministic PRNG (mulberry32). Monte Carlo results must be reproducible so
 * a reported P50 can be re-derived later (audit / AACE traceability); plain
 * Math.random() gave a different answer on every run.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DEFAULT_MONTE_CARLO_SEED = 0x5eed_2026

/**
 * Sample a triangular distribution. Bounds are normalised so callers may pass
 * them in any order — with negative quantities (e.g. credit change orders,
 * `impact * 0.8` > `impact * 1.2`) the naive formula sampled outside the
 * distribution entirely. Degenerate ranges (min === max) return the mode.
 */
function randomTriangular(rng: () => number, a: number, mode: number, b: number): number {
  const min = Math.min(a, b, mode)
  const max = Math.max(a, b, mode)
  if (max === min) {
    return mode
  }
  const m = Math.min(Math.max(mode, min), max)
  const u = rng()
  const f = (m - min) / (max - min)
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (m - min))
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - m))
}

/** Percentile with linear interpolation between closest ranks. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0
  }
  if (sorted.length === 1) {
    return sorted[0]
  }

  const rank = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) {
    return sorted[lower]
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower)
}

function isOpenChange(change: ChangeItem): boolean {
  return change.status === 'pending' || change.status === 'under_review'
}

function isOpenRisk(risk: RiskItem): boolean {
  return risk.status !== 'closed' && risk.status !== 'rejected'
}

export function runMonteCarlo(
  baseEac: number,
  changes: ChangeItem[],
  risks: RiskItem[],
  inputs: ScenarioInputs,
  iterations = 2000,
  seed = DEFAULT_MONTE_CARLO_SEED,
): MonteCarloResult {
  const rng = mulberry32(seed)
  const samples: number[] = []

  const openChanges = changes.filter(isOpenChange)
  const openRisks = risks.filter(isOpenRisk)

  for (let i = 0; i < iterations; i += 1) {
    const productivity = randomTriangular(rng, inputs.productivityFactor * 0.85, inputs.productivityFactor, inputs.productivityFactor * 1.15)
    const productivityDelta = productivity === 0 ? 0 : baseEac * (1 / productivity - 1) * 0.35

    const pendingDelta = openChanges.reduce((sum, change) => {
      const low = change.costImpactUsd * 0.8
      const high = change.costImpactUsd * 1.2
      const sampled = randomTriangular(rng, low, change.costImpactUsd, high)
      return sum + sampled * inputs.changeApprovalProbability
    }, 0)

    const riskDelta = openRisks.reduce((sum, risk) => {
      const low = risk.costExposureUsd * 0.5
      const high = risk.costExposureUsd * 1.1
      const probability = risk.postMitigationLikelihood / 5
      return sum + randomTriangular(rng, low, risk.costExposureUsd, high) * probability
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

  // Driver filters mirror the simulation filters above so the tornado labels
  // describe the same population that generated the samples.
  const drivers = [
    { label: 'Productivity', impact: baseEac * Math.abs(inputs.productivityFactor - 1) * 0.35 },
    {
      label: 'Pending changes',
      impact: openChanges.reduce((s, c) => s + c.costImpactUsd, 0) * inputs.changeApprovalProbability,
    },
    {
      label: 'Open risks',
      impact: openRisks.reduce((s, r) => s + r.costExposureUsd * (r.postMitigationLikelihood / 5), 0),
    },
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
