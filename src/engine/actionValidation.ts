import { pendingApplyCount } from './applyExtractionsCore'
import type { ProjectAction, ProjectState } from '../store/types'

export class ActionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionValidationError'
  }
}

/** Server-side guards for actions that need more than RBAC (period lock rules, etc.). */
export function validateProjectAction(state: ProjectState, action: ProjectAction): void {
  if (action.type === 'LOCK_REPORTING_PERIOD') {
    const pending = pendingApplyCount(state.values)
    if (pending > 0) {
      throw new ActionValidationError(
        `Cannot lock period: ${pending} approved extraction(s) must be applied or sent back for correction first.`,
      )
    }
  }
}
