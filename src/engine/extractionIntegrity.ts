import type { ExtractedValue } from '../data/projectData'
import { resolveSccsForExtraction } from './sccs'

function isFullyApproved(value: ExtractedValue): boolean {
  return value.reviewStatus === 'approved' && value.approvalStatus === 'approved'
}

/**
 * Merge incoming extracted values with prior state:
 * - Re-approval required before re-post if a posted value is edited
 * - Block clearing `applied` via SET_VALUES (must stay idempotent until corrected)
 */
export function sanitizeExtractedValues(
  previous: ExtractedValue[],
  incoming: ExtractedValue[],
): ExtractedValue[] {
  const prevById = new Map(previous.map((value) => [value.id, value]))

  return incoming.map((value) => {
    const prior = prevById.get(value.id)
    let merged = { ...value }

    if (prior?.applied) {
      if (!isFullyApproved(merged)) {
        merged = { ...merged, applied: undefined, appliedAt: undefined }
      } else if (!merged.applied) {
        merged = { ...merged, applied: true, appliedAt: prior.appliedAt }
      }
    }

    return {
      ...merged,
      sccs: resolveSccsForExtraction(merged),
    }
  })
}

/** Client-side correction helper — clears posting lock when value is edited. */
export function resetExtractionForCorrection(value: ExtractedValue): ExtractedValue {
  return {
    ...value,
    reviewStatus: 'pending_review',
    approvalStatus: 'unapproved',
    applied: undefined,
    appliedAt: undefined,
  }
}
