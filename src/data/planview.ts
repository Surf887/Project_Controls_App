export type PlanviewItemType = 'milestone' | 'action' | 'issue' | 'decision'

export interface PlanviewGovernanceItem {
  id: string
  batchId: string
  externalId: string
  projectCode: string
  itemType: PlanviewItemType
  title: string
  description: string
  owner: string
  sourceStatus: string
  dueDate: string
  progressPercent: number
  sourceWbs: string
  wbs: string
  costImpactUsd: number
  scheduleImpactDays: number
  sourceUpdatedAt?: string
  mappingStatus: 'mapped' | 'unmapped'
  duplicate: boolean
  status: 'staged' | 'approved' | 'rejected' | 'posted'
  postedAt?: string
  postedBy?: string
}

export interface PlanviewSyncBatch {
  id: string
  profileId: string
  profileVersion: number
  dataset: string
  importedAt: string
  importedBy: string
  status: 'staged' | 'approved' | 'rejected' | 'posted'
  rowCount: number
  mappedCount: number
  duplicateCount: number
  errorCount: number
  warningCount: number
  cursor?: string
  issues: Array<{
    row: number
    externalId?: string
    field: string
    severity: 'warning' | 'error'
    message: string
  }>
}
