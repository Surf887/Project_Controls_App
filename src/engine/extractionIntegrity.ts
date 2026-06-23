import type { ExtractedValue } from '../data/projectData'
import { resolveSccsForExtraction } from './sccs'
import { reverseIngestionPosting } from './ingestionPosting'
import type { ProjectState } from '../store/types'

function isFullyApproved(value: ExtractedValue): boolean {
  return value.reviewStatus === 'approved' && value.approvalStatus === 'approved'
}

export function extractionFinancialFieldsChanged(prior: ExtractedValue, next: ExtractedValue): boolean {
  return (
    prior.normalizedValue !== next.normalizedValue ||
    prior.wbs !== next.wbs ||
    prior.cbs !== next.cbs ||
    prior.category !== next.category
  )
}

export interface SanitizedValuesResult {
  values: ExtractedValue[]
  /** Value IDs whose active postings must be reversed before persisting. */
  reverseValueIds: string[]
}

/**
 * Merge incoming extracted values with prior state and detect reversals.
 */
export function sanitizeExtractedValues(
  previous: ExtractedValue[],
  incoming: ExtractedValue[],
): SanitizedValuesResult {
  const prevById = new Map(previous.map((value) => [value.id, value]))
  const reverseValueIds: string[] = []

  const values = incoming.map((value) => {
    const prior = prevById.get(value.id)
    let merged = { ...value }

    if (prior?.applied) {
      const needsReverse = !isFullyApproved(merged) || extractionFinancialFieldsChanged(prior, merged)
      if (needsReverse) {
        reverseValueIds.push(value.id)
        merged = { ...merged, applied: undefined, appliedAt: undefined, postingId: undefined }
      } else if (!merged.applied) {
        merged = {
          ...merged,
          applied: true,
          appliedAt: prior.appliedAt,
          postingId: prior.postingId,
        }
      }
    }

    return {
      ...merged,
      sccs: resolveSccsForExtraction(merged),
    }
  })

  return { values, reverseValueIds }
}

/** Apply posting reversals then persist sanitized extraction values. */
export function applyValuesUpdate(state: ProjectState, incoming: ExtractedValue[], actor = 'Correction'): ProjectState {
  const { values, reverseValueIds } = sanitizeExtractedValues(state.values, incoming)
  let next = state
  for (const valueId of reverseValueIds) {
    next = reverseIngestionPosting(next, valueId, actor)
  }
  return { ...next, values }
}

/** Client-side correction helper — clears review state; caller must dispatch SET_VALUES. */
export function resetExtractionForCorrection(value: ExtractedValue): ExtractedValue {
  return {
    ...value,
    reviewStatus: 'pending_review',
    approvalStatus: 'unapproved',
    applied: undefined,
    appliedAt: undefined,
    postingId: undefined,
  }
}
