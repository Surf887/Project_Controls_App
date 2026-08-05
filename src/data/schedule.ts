export type ScheduleSourceSystem = 'p6_csv' | 'p6_xer' | 'planview' | 'manual'
export type ScheduleActivityType = 'task' | 'start_milestone' | 'finish_milestone' | 'level_of_effort'
export type ScheduleActivityStatus = 'not_started' | 'in_progress' | 'completed'
export type ScheduleMappingStatus = 'mapped' | 'manual' | 'unmapped'
export type ScheduleRelationshipType = 'FS' | 'SS' | 'FF' | 'SF'

export interface ScheduleActivity {
  id: string
  sourceActivityId: string
  sourceWbs: string
  wbs: string
  name: string
  activityType: ScheduleActivityType
  status: ScheduleActivityStatus
  calendar: string
  baselineStart: string
  baselineFinish: string
  currentStart: string
  currentFinish: string
  actualStart?: string
  actualFinish?: string
  remainingDurationDays: number
  totalFloatDays: number
  percentComplete: number
  physicalPercentComplete: number
  plannedLaborHours: number
  actualLaborHours: number
  primaryResource?: string
  sourceSystem: ScheduleSourceSystem
  sourceBatchId: string
  mappingStatus: ScheduleMappingStatus
}

export interface ScheduleRelationship {
  id: string
  predecessorId: string
  successorId: string
  type: ScheduleRelationshipType
  lagDays: number
  sourceSystem: ScheduleSourceSystem
  sourceBatchId: string
}

export interface ScheduleImportIssue {
  id: string
  row: number
  severity: 'warning' | 'error'
  field: string
  message: string
  sourceActivityId?: string
}

export interface ScheduleImportBatch {
  id: string
  sourceSystem: ScheduleSourceSystem
  fileName: string
  dataDate: string
  importedAt: string
  importedBy: string
  status: 'accepted' | 'accepted_with_warnings' | 'rejected'
  activityCount: number
  relationshipCount: number
  mappedCount: number
  warningCount: number
  errorCount: number
  issues: ScheduleImportIssue[]
  columnMap: Record<string, string>
}
