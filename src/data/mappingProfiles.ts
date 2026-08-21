export type MappingSourceType = 'csv' | 'excel' | 'snowflake' | 'ocr' | 'api'
export type MappingTargetDomain = 'contractor_report' | 'cost_transaction' | 'schedule_activity'
export type MappingOperation = 'direct' | 'coalesce' | 'concat' | 'constant'
export type MappingTransform = 'trim' | 'uppercase' | 'lowercase' | 'number' | 'date_iso'

export interface MappingRule {
  id: string
  targetField: string
  sourceColumns: string[]
  operation: MappingOperation
  constant?: string
  delimiter?: string
  transforms: MappingTransform[]
  valueMap: Record<string, string>
  required: boolean
  defaultValue?: string
}

export interface MappingProfile {
  id: string
  name: string
  organization: string
  sourceType: MappingSourceType
  targetDomain: MappingTargetDomain
  dataset: string
  version: number
  status: 'draft' | 'active' | 'retired'
  schemaFingerprint: string
  sourceHeaders: string[]
  rules: MappingRule[]
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface MappingIssue {
  row: number
  field: string
  severity: 'warning' | 'error'
  message: string
}

export interface MappingResult {
  rows: Record<string, string>[]
  issues: MappingIssue[]
  schemaChanged: boolean
  currentFingerprint: string
}
