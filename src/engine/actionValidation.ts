import { findOwningControlAccount, pendingApplyCount } from './applyExtractionsCore'
import type { ProjectAction, ProjectState } from '../store/types'
import { canonicalFields } from './dynamicMapping'

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
  if (action.type === 'IMPORT_DOCUMENT_DRAFTS') {
    if (action.payload.document.projectId !== state.meta.id) {
      throw new ActionValidationError('Document project does not match the active project.')
    }
    if (action.payload.drivers.some((driver) => driver.status !== 'draft')) {
      throw new ActionValidationError('Document-extracted forecast drivers must enter as drafts.')
    }
    const documentDriverIds = new Set(action.payload.document.draftDrivers.map((driver) => driver.id))
    if (
      documentDriverIds.size !== action.payload.drivers.length ||
      action.payload.drivers.some((driver) => !documentDriverIds.has(driver.id))
    ) {
      throw new ActionValidationError('Document draft-driver payload is inconsistent.')
    }
    if (
      action.payload.drivers.some(
        (driver) =>
          driver.evidence?.documentId !== action.payload.document.id ||
          driver.lowUsd > driver.mostLikelyUsd ||
          driver.mostLikelyUsd > driver.highUsd,
      )
    ) {
      throw new ActionValidationError('Document driver evidence or impact range is invalid.')
    }
  }
  if (action.type === 'UPDATE_FORECAST_DRIVER') {
    const driver = action.payload
    const existing = state.forecastDrivers.find((entry) => entry.id === driver.id)
    if (!existing) {
      throw new ActionValidationError('Forecast driver not found.')
    }
    if (driver.status !== existing.status && (driver.status === 'approved' || driver.status === 'rejected')) {
      throw new ActionValidationError('Forecast driver decisions require the approval action.')
    }
    if (driver.lowUsd > driver.mostLikelyUsd || driver.mostLikelyUsd > driver.highUsd) {
      throw new ActionValidationError('Forecast driver requires low ≤ most likely ≤ high.')
    }
  }
  if (action.type === 'DECIDE_FORECAST_DRIVER') {
    const driver = state.forecastDrivers.find((entry) => entry.id === action.payload.driverId)
    if (!driver) throw new ActionValidationError('Forecast driver not found.')
    if (driver.status !== 'in_review') {
      throw new ActionValidationError('Forecast driver must be saved for review before a decision.')
    }
    if (
      action.payload.decision === 'approved' &&
      (driver.lowUsd > driver.mostLikelyUsd ||
        driver.mostLikelyUsd > driver.highUsd ||
        driver.wbs.length === 0 ||
        driver.wbs.some((wbs) => !findOwningControlAccount(state.costSheetRows, wbs)))
    ) {
      throw new ActionValidationError('Approved forecast drivers require a valid range and control-account WBS.')
    }
  }
  if (action.type === 'UPSERT_MAPPING_PROFILE') {
    const profile = action.payload
    const existing = state.mappingProfiles.find((entry) => entry.id === profile.id)
    if (existing && profile.version !== existing.version + 1) {
      throw new ActionValidationError(`Mapping profile update must create version ${existing.version + 1}.`)
    }
    const allowedTargets = new Set(canonicalFields[profile.targetDomain].map((field) => field.field))
    const targets = profile.rules.map((rule) => rule.targetField)
    if (new Set(targets).size !== targets.length || targets.some((target) => !allowedTargets.has(target))) {
      throw new ActionValidationError('Mapping profile contains duplicate or unsupported target fields.')
    }
    if (
      profile.rules.some(
        (rule) =>
          rule.operation !== 'constant' &&
          rule.sourceColumns.some((column) => !profile.sourceHeaders.includes(column)),
      )
    ) {
      throw new ActionValidationError('Mapping rule references a source column outside the saved schema.')
    }
    const requiredTargets = canonicalFields[profile.targetDomain]
      .filter((field) => field.required)
      .map((field) => field.field)
    if (
      profile.status === 'active' &&
      requiredTargets.some(
        (target) =>
          !profile.rules.some(
            (rule) =>
              rule.targetField === target &&
              (rule.operation === 'constant' ? Boolean(rule.constant) : rule.sourceColumns.length > 0),
          ),
      )
    ) {
      throw new ActionValidationError('Active mapping profiles must map every required canonical field.')
    }
  }
  if (action.type === 'IMPORT_COST_TRANSACTION_BATCH') {
    const { batch, transactions } = action.payload
    const profile = state.mappingProfiles.find((entry) => entry.id === batch.profileId)
    if (
      !profile ||
      profile.status !== 'active' ||
      profile.targetDomain !== 'cost_transaction' ||
      profile.version !== batch.profileVersion
    ) {
      throw new ActionValidationError('Cost transaction batch requires the active mapped profile version.')
    }
    if (
      batch.rowCount !== transactions.length ||
      batch.mappedCount !== transactions.filter((transaction) => transaction.mappingStatus === 'mapped').length ||
      batch.duplicateCount !== transactions.filter((transaction) => transaction.duplicate).length ||
      batch.errorCount !== batch.issues.filter((issue) => issue.severity === 'error').length ||
      batch.warningCount !== batch.issues.filter((issue) => issue.severity === 'warning').length ||
      transactions.some(
        (transaction) =>
          transaction.batchId !== batch.id ||
          transaction.sourceSystem !== batch.sourceSystem ||
          transaction.status !== 'staged',
      )
    ) {
      throw new ActionValidationError('Cost transaction batch counts or transaction metadata are inconsistent.')
    }
  }
  if (action.type === 'UPDATE_COST_TRANSACTION_MAPPING') {
    const transaction = state.costTransactions.find((entry) => entry.id === action.payload.transactionId)
    if (!transaction || transaction.status === 'posted') {
      throw new ActionValidationError('Cost transaction is unavailable for mapping.')
    }
    if (!findOwningControlAccount(state.costSheetRows, action.payload.wbs)) {
      throw new ActionValidationError(`WBS ${action.payload.wbs} does not map to a control account.`)
    }
  }
  if (action.type === 'DECIDE_COST_TRANSACTION_BATCH') {
    const batch = state.costTransactionBatches.find((entry) => entry.id === action.payload.batchId)
    const transactions = state.costTransactions.filter((entry) => entry.batchId === action.payload.batchId)
    if (!batch || batch.status !== 'staged') {
      throw new ActionValidationError('Cost transaction batch is not awaiting approval.')
    }
    if (
      action.payload.decision === 'approved' &&
      (batch.errorCount > 0 ||
        transactions.some(
          (transaction) =>
            !transaction.duplicate &&
            (transaction.mappingStatus !== 'mapped' || transaction.currency !== 'USD'),
        ))
    ) {
      throw new ActionValidationError('Resolve batch errors and WBS mappings before approval.')
    }
  }
  if (action.type === 'POST_COST_TRANSACTION_BATCH') {
    const batch = state.costTransactionBatches.find((entry) => entry.id === action.payload.batchId)
    if (!batch || batch.status !== 'approved') {
      throw new ActionValidationError('Only approved cost transaction batches can be posted.')
    }
    if (state.settings.reportingPeriod?.locked) {
      throw new ActionValidationError('Cannot post cost transactions while the reporting period is locked.')
    }
  }
  if (action.type === 'IMPORT_PLANVIEW_BATCH') {
    const { batch, items } = action.payload
    const profile = state.mappingProfiles.find((entry) => entry.id === batch.profileId)
    if (
      !profile ||
      profile.status !== 'active' ||
      profile.sourceType !== 'api' ||
      profile.targetDomain !== 'project_governance' ||
      profile.version !== batch.profileVersion
    ) {
      throw new ActionValidationError('Planview batch requires the active API governance profile version.')
    }
    if (
      batch.rowCount !== items.length ||
      batch.mappedCount !== items.filter((item) => item.mappingStatus === 'mapped').length ||
      batch.duplicateCount !== items.filter((item) => item.duplicate).length ||
      batch.errorCount !== batch.issues.filter((issue) => issue.severity === 'error').length ||
      batch.warningCount !== batch.issues.filter((issue) => issue.severity === 'warning').length ||
      items.some((item) => item.batchId !== batch.id || item.status !== 'staged')
    ) {
      throw new ActionValidationError('Planview batch counts or item metadata are inconsistent.')
    }
  }
  if (action.type === 'UPDATE_PLANVIEW_ITEM_MAPPING') {
    const item = state.planviewItems.find((entry) => entry.id === action.payload.itemId)
    if (!item || item.status === 'posted') throw new ActionValidationError('Planview item is unavailable for mapping.')
    if (!findOwningControlAccount(state.costSheetRows, action.payload.wbs)) {
      throw new ActionValidationError(`WBS ${action.payload.wbs} does not map to a control account.`)
    }
  }
  if (action.type === 'DECIDE_PLANVIEW_BATCH') {
    const batch = state.planviewSyncBatches.find((entry) => entry.id === action.payload.batchId)
    const items = state.planviewItems.filter((entry) => entry.batchId === action.payload.batchId)
    if (!batch || batch.status !== 'staged') throw new ActionValidationError('Planview batch is not awaiting approval.')
    if (
      action.payload.decision === 'approved' &&
      (batch.errorCount > 0 ||
        items.some((item) => !item.duplicate && item.mappingStatus === 'unmapped'))
    ) {
      throw new ActionValidationError('Resolve Planview batch errors and WBS mappings before approval.')
    }
  }
  if (action.type === 'POST_PLANVIEW_BATCH') {
    const batch = state.planviewSyncBatches.find((entry) => entry.id === action.payload.batchId)
    if (!batch || batch.status !== 'approved') {
      throw new ActionValidationError('Only approved Planview batches can be posted.')
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
