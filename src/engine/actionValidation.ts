import { findOwningControlAccount, pendingApplyCount } from './applyExtractionsCore'
import type { ProjectAction, ProjectState } from '../store/types'

export class ActionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionValidationError'
  }
}

/** Server-side guards for actions that need more than RBAC (period lock rules, etc.). */
export function validateProjectAction(state: ProjectState, action: ProjectAction): void {
  if (action.type === 'SET_VALUES' && state.settings.reportingPeriod?.locked) {
    throw new ActionValidationError('Cannot change extraction mappings or values while the reporting period is locked.')
  }
  if (action.type === 'SET_VALUES') {
    const invalidApprovedMapping = action.payload.find(
      (value) =>
        value.reviewStatus === 'approved' &&
        value.approvalStatus === 'approved' &&
        (value.category === 'cost' || value.category === 'forecast' || value.category === 'change') &&
        !findOwningControlAccount(state.costSheetRows, value.wbs),
    )
    if (invalidApprovedMapping) {
      throw new ActionValidationError(
        `Cannot approve ${invalidApprovedMapping.field}: WBS ${invalidApprovedMapping.wbs} does not map to a control account.`,
      )
    }
  }

  if (action.type === 'LOCK_REPORTING_PERIOD') {
    const pending = pendingApplyCount(state.values)
    if (pending > 0) {
      throw new ActionValidationError(
        `Cannot lock period: ${pending} approved extraction(s) must be applied or sent back for correction first.`,
      )
    }
  }
}
