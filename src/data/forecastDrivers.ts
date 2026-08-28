export type ForecastDriverSource =
  | 'risk'
  | 'opportunity'
  | 'change'
  | 'issue'
  | 'claim'
  | 'schedule'
  | 'productivity'
  | 'document'
  | 'manual'

export type ForecastDriverTreatment = 'deterministic' | 'expected_value' | 'triangular' | 'excluded'
export type ForecastDriverStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'superseded'

export interface DocumentEvidence {
  documentId: string
  fileName: string
  page?: number
  excerpt: string
  boundingBox?: number[]
}

export interface ForecastDriver {
  id: string
  title: string
  sourceType: ForecastDriverSource
  sourceEntityId: string
  linkedEntityIds: string[]
  wbs: string[]
  cbs?: string
  impactDirection: 'cost' | 'saving'
  lowUsd: number
  mostLikelyUsd: number
  highUsd: number
  probability: number
  scheduleImpactDays: number
  treatment: ForecastDriverTreatment
  status: ForecastDriverStatus
  confidence: number
  rationale: string
  evidence?: DocumentEvidence
  createdAt: string
  createdBy: string
  reviewedAt?: string
  reviewedBy?: string
  reviewComment?: string
}
