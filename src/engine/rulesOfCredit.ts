import type { WorkFront } from '../data/phases'
import type {
  Deliverable,
  ProgressCreditEntry,
  RuleOfCreditTemplate,
} from '../store/types'

export function stepsCreditTotal(template: RuleOfCreditTemplate): number {
  return template.steps.reduce((sum, step) => sum + step.creditPercent, 0)
}

export function computeEarnedPercent(
  template: RuleOfCreditTemplate,
  entry: ProgressCreditEntry | undefined,
): number {
  if (!entry) {
    return 0
  }

  const completed = new Set(entry.completedStepIds)
  const stepCredit = template.steps
    .filter((step) => completed.has(step.id))
    .reduce((sum, step) => sum + step.creditPercent, 0)

  if (entry.quantityTotal && entry.quantityTotal > 0 && entry.quantityInstalled != null) {
    const quantityPct = Math.min((entry.quantityInstalled / entry.quantityTotal) * 100, 100)
    return Math.min(Math.max(stepCredit, quantityPct), 100)
  }

  return Math.min(stepCredit, 100)
}

export function computePlannedPercent(template: RuleOfCreditTemplate, asOfStepIndex: number): number {
  return template.steps
    .slice(0, asOfStepIndex + 1)
    .reduce((sum, step) => sum + step.creditPercent, 0)
}

export function findProgressEntry(
  entries: ProgressCreditEntry[],
  targetType: ProgressCreditEntry['targetType'],
  targetId: string,
): ProgressCreditEntry | undefined {
  return entries.find((entry) => entry.targetType === targetType && entry.targetId === targetId)
}

export function findTemplate(
  templates: RuleOfCreditTemplate[],
  templateId: string,
): RuleOfCreditTemplate | undefined {
  return templates.find((template) => template.id === templateId)
}

export function syncDeliverableEarned(
  deliverable: Deliverable,
  templates: RuleOfCreditTemplate[],
  entries: ProgressCreditEntry[],
): number {
  const entry = findProgressEntry(entries, 'deliverable', deliverable.id)
  if (!entry) {
    return deliverable.earnedProgress
  }

  const template = findTemplate(templates, entry.templateId)
  if (!template) {
    return deliverable.earnedProgress
  }

  return computeEarnedPercent(template, entry)
}

export function syncWorkFrontEarned(
  workFront: WorkFront,
  templates: RuleOfCreditTemplate[],
  entries: ProgressCreditEntry[],
): number {
  const entry = findProgressEntry(entries, 'work_front', workFront.id)
  if (!entry) {
    return workFront.earnedPercent
  }

  const template = findTemplate(templates, entry.templateId)
  if (!template) {
    return workFront.earnedPercent
  }

  return computeEarnedPercent(template, entry)
}

export function wbsEarnedPercent(
  wbs: string,
  templates: RuleOfCreditTemplate[],
  entries: ProgressCreditEntry[],
): number | null {
  const entry = entries.find((item) => item.targetType === 'wbs' && item.targetId === wbs)
  if (!entry) {
    return null
  }

  const template = findTemplate(templates, entry.templateId)
  if (!template) {
    return null
  }

  return computeEarnedPercent(template, entry)
}

export function toggleStepCompletion(
  entry: ProgressCreditEntry,
  stepId: string,
): ProgressCreditEntry {
  const completed = new Set(entry.completedStepIds)
  if (completed.has(stepId)) {
    completed.delete(stepId)
  } else {
    completed.add(stepId)
  }

  return {
    ...entry,
    completedStepIds: [...completed],
  }
}
