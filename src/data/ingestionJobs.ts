export type IngestionJobType = 'ocr_document' | 'snowflake_stage' | 'planview_stage' | 'p6_large_import'
export type IngestionJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface IngestionJob {
  id: string
  projectId: string
  jobType: IngestionJobType
  status: IngestionJobStatus
  request: Record<string, unknown>
  result?: Record<string, unknown>
  idempotencyKey?: string
  createdById: string
  createdByName: string
  createdByRole: string
  attempts: number
  maxAttempts: number
  availableAt: string
  leaseOwner?: string
  leaseUntil?: string
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  updatedAt: string
}
