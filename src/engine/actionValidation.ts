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
  if (action.type === 'IMPORT_SCHEDULE') {
    const { batch, activities, relationships } = action.payload
    const ids = new Set(activities.map((activity) => activity.id))
    if (ids.size !== activities.length) {
      throw new ActionValidationError('Schedule import contains duplicate activity IDs.')
    }
    if (
      batch.activityCount !== activities.length ||
      batch.relationshipCount !== relationships.length ||
      batch.mappedCount !== activities.filter((activity) => activity.mappingStatus !== 'unmapped').length ||
      batch.warningCount !== batch.issues.filter((issue) => issue.severity === 'warning').length ||
      batch.errorCount !== batch.issues.filter((issue) => issue.severity === 'error').length
    ) {
      throw new ActionValidationError('Schedule import counts do not match its payload.')
    }
    const inconsistentActivity = activities.find(
      (activity) =>
        activity.sourceBatchId !== batch.id ||
        activity.sourceSystem !== batch.sourceSystem ||
        (activity.mappingStatus !== 'unmapped' &&
          !findOwningControlAccount(state.costSheetRows, activity.wbs)),
    )
    if (inconsistentActivity) {
      throw new ActionValidationError(
        `Schedule activity ${inconsistentActivity.sourceActivityId} has an invalid batch, source, or WBS mapping.`,
      )
    }
    const invalidRelationship = relationships.find(
      (relationship) =>
        relationship.sourceBatchId !== batch.id ||
        relationship.sourceSystem !== batch.sourceSystem ||
        !ids.has(relationship.predecessorId) ||
        !ids.has(relationship.successorId),
    )
    if (invalidRelationship) {
      throw new ActionValidationError(`Schedule relationship ${invalidRelationship.id} references an invalid activity.`)
    }
  }
  if (action.type === 'UPDATE_SCHEDULE_ACTIVITY_MAPPING') {
    if (!state.scheduleActivities.some((activity) => activity.id === action.payload.activityId)) {
      throw new ActionValidationError('Schedule activity not found.')
    }
    if (!findOwningControlAccount(state.costSheetRows, action.payload.wbs)) {
      throw new ActionValidationError(`WBS ${action.payload.wbs} does not map to a control account.`)
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
