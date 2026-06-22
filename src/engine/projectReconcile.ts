import type { ProjectState } from '../store/types'
import { applyContingencyDrawsToCostSheet, reconcileContingencyDraws } from './contingency'

export function reconcileContingencyInState(state: ProjectState): ProjectState {
  const contingencyDraws = reconcileContingencyDraws(
    state.changes,
    state.contingencyDraws ?? [],
    state.settings.contingencyRules,
    state.costSheetRows,
  )

  const costSheetRows = applyContingencyDrawsToCostSheet(state.costSheetRows, contingencyDraws)

  if (
    JSON.stringify(contingencyDraws) === JSON.stringify(state.contingencyDraws ?? []) &&
    JSON.stringify(costSheetRows) === JSON.stringify(state.costSheetRows)
  ) {
    return state
  }

  return {
    ...state,
    contingencyDraws,
    costSheetRows,
  }
}
