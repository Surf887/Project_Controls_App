import type { ProjectState } from '../store/types'
import { accrualTotals } from './accruals'
import { sumBac } from './costAggregation'
import { monthlyCloseSteps, type MonthlyCloseStep } from '../data/monthlyCloseSteps'
import { pathForView } from '../routes/viewPaths'

export type CloseStepStatus = 'complete' | 'ready' | 'in_progress' | 'blocked' | 'pending'

export interface CloseStepSignal {
  label: string
  value: string
  ok: boolean
}

export interface CloseStepProgress {
  step: MonthlyCloseStep
  status: CloseStepStatus
  blockers: string[]
  signals: CloseStepSignal[]
}

export interface MonthlyCloseEvaluation {
  steps: CloseStepProgress[]
  currentStep: MonthlyCloseStep
  nextStep: MonthlyCloseStep | null
  completedCount: number
  totalSteps: number
  percentComplete: number
  globalBlockers: string[]
  periodLabel: string
}

const pendingChangeStatuses = new Set(['draft', 'submitted', 'under_review', 'pending'])

function evaluateBaseline(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[0]!
  const hasScope = Boolean(state.basisOfEstimate.scope?.trim())
  const hasMethod = Boolean(state.basisOfEstimate.methodology?.trim())
  const hasOwner = Boolean(state.basisOfEstimate.preparedBy?.trim())
  const controlCount = state.costSheetRows.filter((row) => row.parentId === null).length

  const signals: CloseStepSignal[] = [
    { label: 'BOE scope', value: hasScope ? 'Documented' : 'Missing', ok: hasScope },
    { label: 'Methodology', value: hasMethod ? 'Class defined' : 'Missing', ok: hasMethod },
    { label: 'Control accounts', value: String(controlCount), ok: controlCount > 0 },
  ]

  const blockers: string[] = []
  if (!hasScope) blockers.push('Complete scope narrative on Basis of Estimate')
  if (!hasMethod) blockers.push('Document estimate methodology (AACE class)')
  if (controlCount === 0) blockers.push('Load control account structure')

  const done = hasScope && hasMethod && hasOwner && controlCount > 0
  return { step, status: done ? 'complete' : 'ready', blockers, signals }
}

function evaluateWbs(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[1]!
  const wbsCount = state.wbsNodes.length
  const controls = state.costSheetRows.filter((row) => row.parentId === null)
  const mapped = controls.filter((row) => row.cbs?.trim()).length
  const unmapped = controls.length - mapped

  const signals: CloseStepSignal[] = [
    { label: 'WBS nodes', value: String(wbsCount), ok: wbsCount > 0 },
    { label: 'CBS mapped', value: `${mapped}/${controls.length}`, ok: unmapped === 0 },
    { label: 'CapEx tags', value: controls.every((row) => row.costType) ? 'OK' : 'Review', ok: controls.every((row) => row.costType) },
  ]

  const blockers: string[] = []
  if (wbsCount === 0) blockers.push('Import or build WBS tree')
  if (unmapped > 0) blockers.push(`${unmapped} control account(s) missing CBS mapping`)

  const done = wbsCount > 0 && unmapped === 0
  return { step, status: done ? 'complete' : 'ready', blockers, signals }
}

function evaluateReconcile(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[2]!
  const totals = accrualTotals(state.costAccruals)
  const openDraft = state.costAccruals.filter((entry) => entry.status === 'draft').length
  const openReview = state.costAccruals.filter((entry) => entry.status === 'reviewed').length

  const signals: CloseStepSignal[] = [
    { label: 'Open accruals', value: formatUsd(totals.totalOpen), ok: totals.totalOpen === 0 || openDraft === 0 },
    { label: 'Awaiting post', value: String(openReview), ok: openReview === 0 },
    { label: 'Posted accruals', value: formatUsd(totals.totalPosted), ok: totals.totalPosted >= 0 },
  ]

  const blockers: string[] = []
  if (openDraft > 0) blockers.push(`${openDraft} accrual(s) still in draft — review and post`)
  if (openReview > 0) blockers.push(`${openReview} accrual(s) reviewed but not posted`)

  const done = openDraft === 0 && openReview === 0
  return { step, status: done ? 'complete' : totals.totalOpen > 0 ? 'in_progress' : 'ready', blockers, signals }
}

function evaluateVowd(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[3]!
  const rocCount = state.ruleOfCreditTemplates.length
  const creditCount = state.progressCredits.length
  const withProgress = state.progressCredits.filter((entry) => entry.completedStepIds.length > 0).length
  const staleCredits = creditCount - withProgress

  const signals: CloseStepSignal[] = [
    { label: 'Rules of credit', value: String(rocCount), ok: rocCount > 0 },
    { label: 'Progress entries', value: String(creditCount), ok: creditCount > 0 },
    { label: 'Without earned steps', value: String(staleCredits), ok: staleCredits === 0 },
  ]

  const blockers: string[] = []
  if (creditCount === 0) blockers.push('Enter earned progress via Rules of Credit')
  if (staleCredits > 0) blockers.push(`${staleCredits} account(s) have no earned steps recorded`)

  const done = creditCount > 0 && staleCredits === 0
  return { step, status: done ? 'complete' : 'ready', blockers, signals }
}

function evaluateChanges(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[4]!
  const pending = state.changes.filter((change) => pendingChangeStatuses.has(change.status))
  const boardQueue = state.changes.filter((change) => change.status === 'submitted' || change.status === 'under_review')

  const signals: CloseStepSignal[] = [
    { label: 'Board queue', value: String(boardQueue.length), ok: boardQueue.length === 0 },
    { label: 'Open pipeline', value: String(pending.length), ok: pending.length === 0 },
    {
      label: 'Forecast variance COs',
      value: String(state.changes.filter((c) => c.mechanism === 'forecast_variance').length),
      ok: true,
    },
  ]

  const blockers: string[] = []
  if (boardQueue.length > 0) blockers.push(`${boardQueue.length} change(s) awaiting board decision`)

  const done = boardQueue.length === 0
  return { step, status: done ? 'complete' : boardQueue.length > 0 ? 'blocked' : 'ready', blockers, signals }
}

function evaluateForecast(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[5]!
  const draft =
    state.forecastApprovals.find((pkg) => pkg.status === 'draft') ??
    state.forecastApprovals.find((pkg) => pkg.status === 'under_review')

  const signals: CloseStepSignal[] = [
    { label: 'EAC scenario', value: state.settings.eacScenario, ok: true },
    { label: 'Draft package', value: draft ? draft.label : 'Not created', ok: Boolean(draft) },
    { label: 'Proposed EAC', value: draft ? formatUsd(draft.eacTotalUsd) : '—', ok: Boolean(draft && draft.eacTotalUsd > 0) },
  ]

  const blockers: string[] = []
  if (!draft) blockers.push('Run forecast engine and create monthly package')

  const done = Boolean(draft && draft.eacTotalUsd > 0)
  return { step, status: done ? 'complete' : 'ready', blockers, signals }
}

function evaluateSubmit(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[6]!
  const pkg = state.forecastApprovals.find((p) => p.status === 'under_review' || p.status === 'approved')

  const signals: CloseStepSignal[] = [
    { label: 'Package status', value: pkg?.status.replace('_', ' ') ?? 'Not submitted', ok: pkg?.status === 'under_review' || pkg?.status === 'approved' },
    { label: 'Submitted by', value: pkg?.submittedBy ?? '—', ok: Boolean(pkg?.submittedBy) },
    { label: 'Approver', value: pkg?.approver ?? 'Pending', ok: pkg?.status === 'approved' },
  ]

  const blockers: string[] = []
  if (!pkg) blockers.push('Submit forecast package for approval')
  else if (pkg.status === 'draft') blockers.push('Forecast package is still draft — submit for sign-off')

  const done = pkg?.status === 'approved'
  const inProgress = pkg?.status === 'under_review'
  return {
    step,
    status: done ? 'complete' : inProgress ? 'in_progress' : 'ready',
    blockers,
    signals,
  }
}

function evaluateReports(state: ProjectState): CloseStepProgress {
  const step = monthlyCloseSteps[7]!
  const reports = state.generatedTeamReports.length

  const signals: CloseStepSignal[] = [
    { label: 'Generated packs', value: String(reports), ok: reports > 0 },
    { label: 'Audit trail', value: String(state.auditLog.length), ok: state.auditLog.length > 0 },
    { label: 'Period', value: state.meta.baselineLabel, ok: true },
  ]

  const blockers: string[] = []
  const done = reports > 0
  if (!done) blockers.push('Generate leadership close pack from Export centre')
  return { step, status: done ? 'complete' : 'ready', blockers, signals }
}

const evaluators = [
  evaluateBaseline,
  evaluateWbs,
  evaluateReconcile,
  evaluateVowd,
  evaluateChanges,
  evaluateForecast,
  evaluateSubmit,
  evaluateReports,
]

/** Opinionated O&G monthly close — step status derived from project data, not manual ticks. */
export function evaluateMonthlyClose(state: ProjectState): MonthlyCloseEvaluation {
  const steps = evaluators.map((fn) => fn(state))

  // Sequential gate: later steps cannot complete until prior step completes
  for (let index = 1; index < steps.length; index++) {
    const prior = steps[index - 1]!
    const current = steps[index]!
    if (prior.status !== 'complete') {
      if (current.status === 'complete') {
        current.status = 'blocked'
        current.blockers = [`Complete "${prior.step.title}" first`, ...current.blockers]
      } else if (current.status !== 'blocked') {
        current.status = 'blocked'
        current.blockers = [`Complete "${prior.step.title}" first`, ...current.blockers]
      }
    }
  }

  const completedCount = steps.filter((step) => step.status === 'complete').length
  const currentStep =
    steps.find((step) => step.status !== 'complete')?.step ?? steps[steps.length - 1]!.step
  const currentIndex = steps.findIndex((step) => step.step.id === currentStep.id)
  const nextStep = currentIndex >= 0 && currentIndex < steps.length - 1 ? steps[currentIndex + 1]!.step : null

  const globalBlockers = steps.flatMap((step) =>
    step.status === 'blocked' || step.status === 'ready' ? step.blockers.slice(0, 1) : [],
  )

  return {
    steps,
    currentStep,
    nextStep,
    completedCount,
    totalSteps: steps.length,
    percentComplete: Math.round((completedCount / steps.length) * 100),
    globalBlockers: globalBlockers.slice(0, 3),
    periodLabel: state.meta.baselineLabel,
  }
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function stepForPath(pathname: string): MonthlyCloseStep | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return monthlyCloseSteps.find((step) => pathForView(step.view) === normalized) ?? null
}
