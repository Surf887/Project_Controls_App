import { describe, expect, it } from 'vitest'
import { initialCostSheet } from '../data/costSheet'
import type { ScheduleActivity } from '../data/schedule'
import {
  buildScheduleCompletionCurve,
  controlAccountSchedulePerformance,
  plannedActivityProgress,
  scheduleSummary,
} from './scheduleControl'

function activity(partial: Partial<ScheduleActivity> & { id: string; sourceActivityId: string }): ScheduleActivity {
  return {
    id: partial.id,
    sourceActivityId: partial.sourceActivityId,
    sourceWbs: partial.sourceWbs ?? 'A.01',
    wbs: partial.wbs ?? 'A.01',
    name: partial.name ?? 'Test activity',
    activityType: partial.activityType ?? 'task',
    status: partial.status ?? 'in_progress',
    calendar: partial.calendar ?? 'Project',
    baselineStart: partial.baselineStart ?? '2026-01-01',
    baselineFinish: partial.baselineFinish ?? '2026-06-30',
    currentStart: partial.currentStart ?? '2026-01-01',
    currentFinish: partial.currentFinish ?? '2026-07-15',
    actualStart: partial.actualStart ?? '2026-01-02',
    actualFinish: partial.actualFinish,
    remainingDurationDays: partial.remainingDurationDays ?? 10,
    totalFloatDays: partial.totalFloatDays ?? -2,
    percentComplete: partial.percentComplete ?? 50,
    physicalPercentComplete: partial.physicalPercentComplete ?? 45,
    plannedLaborHours: partial.plannedLaborHours ?? 100,
    actualLaborHours: partial.actualLaborHours ?? 60,
    primaryResource: partial.primaryResource,
    sourceSystem: partial.sourceSystem ?? 'p6_csv',
    sourceBatchId: partial.sourceBatchId ?? 'batch-1',
    mappingStatus: partial.mappingStatus ?? 'mapped',
  }
}

describe('schedule control engine', () => {
  const activities = [
    activity({ id: 'P6:A1', sourceActivityId: 'A1', wbs: 'A.01', physicalPercentComplete: 60 }),
    activity({
      id: 'P6:A2',
      sourceActivityId: 'A2',
      wbs: 'A.02.02',
      baselineStart: '2026-03-01',
      baselineFinish: '2026-09-30',
      currentStart: '2026-03-01',
      currentFinish: '2026-10-31',
      physicalPercentComplete: 30,
      totalFloatDays: 5,
      plannedLaborHours: 200,
    }),
  ]

  it('calculates planned progress at the schedule data date', () => {
    expect(plannedActivityProgress(activities[0], '2025-12-31')).toBe(0)
    expect(plannedActivityProgress(activities[0], '2026-07-01')).toBe(100)
    expect(plannedActivityProgress(activities[0], '2026-04-01')).toBeGreaterThan(0)
  })

  it('summarizes schedule quality and finish variance', () => {
    const summary = scheduleSummary(activities, [], '2026-06-30')
    expect(summary.activityCount).toBe(2)
    expect(summary.criticalCount).toBe(1)
    expect(summary.lateCount).toBe(2)
    expect(summary.finishVarianceDays).toBeGreaterThan(0)
    expect(summary.spi).toBeGreaterThan(0)
  })

  it('links P6 activities to cost control accounts for PV and EV', () => {
    const lines = controlAccountSchedulePerformance(activities, initialCostSheet, '2026-06-30')
    expect(lines.map((line) => line.wbs)).toEqual(expect.arrayContaining(['A.01', 'A.02']))
    expect(lines.every((line) => line.pv > 0 && line.ev > 0)).toBe(true)
    expect(lines.find((line) => line.wbs === 'A.02')?.activityCount).toBe(1)
  })

  it('builds a baseline, forecast, and actual completion curve', () => {
    const completed = {
      ...activities[0],
      status: 'completed' as const,
      actualFinish: '2026-06-15',
      physicalPercentComplete: 100,
    }
    const curve = buildScheduleCompletionCurve([completed, activities[1]], '2026-06-30')
    expect(curve.length).toBeGreaterThan(1)
    expect(curve.some((point) => point.actual != null && point.actual > 0)).toBe(true)
    expect(curve[curve.length - 1]?.planned).toBe(100)
    expect(curve[curve.length - 1]?.forecast).toBe(100)
  })
})
