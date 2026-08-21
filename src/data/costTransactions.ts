export type CostTransactionType = 'actual' | 'commitment' | 'accrual' | 'invoice'
export type CostTransactionStatus = 'staged' | 'approved' | 'rejected' | 'posted'

export interface CostTransaction {
  id: string
  batchId: string
  sourceSystem: 'snowflake' | 'csv' | 'api'
  externalId: string
  projectCode: string
  wbs: string
  sourceWbs: string
  cbs?: string
  recordType: CostTransactionType
  postingDate: string
  fiscalPeriod: string
  amount: number
  currency: string
  poNumber?: string
  vendor?: string
  description?: string
  sourceUpdatedAt?: string
  status: CostTransactionStatus
  mappingStatus: 'mapped' | 'unmapped'
  duplicate: boolean
  postedAt?: string
  postedBy?: string
}

export interface CostTransactionIssue {
  row: number
  externalId?: string
  field: string
  severity: 'warning' | 'error'
  message: string
}

export interface CostTransactionBatch {
  id: string
  sourceSystem: 'snowflake' | 'csv' | 'api'
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
  watermark?: string
  issues: CostTransactionIssue[]
}
