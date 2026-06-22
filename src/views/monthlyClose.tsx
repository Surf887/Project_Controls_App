import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { evaluateMonthlyClose, type CloseStepProgress } from '../engine/monthlyCloseProgress'
import { sumBac, sumCostSheetMetric } from '../engine/costAggregation'
import { pendingApplyCount } from '../engine/applyExtractions'
import { projectIncurredTotals } from '../engine/incurredCost'
import { useProjectRole } from '../hooks/useProjectRole'
import { pathForView } from '../routes/viewPaths'
import { useProjectStore } from '../store/projectStore'
import { fetchClosePack } from '../api/client'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function statusLabel(status: CloseStepProgress['status']) {
  switch (status) {
    case 'complete':
      return 'Done'
    case 'in_progress':
      return 'In progress'
    case 'blocked':
      return 'Blocked'
    case 'ready':
      return 'Ready'
    default:
      return 'Pending'
  }
}

export function MonthlyCloseWorkspace() {
  const { state, dispatch, backendEnabled, currentUser } = useProjectStore()
  const { canApprove } = useProjectRole()
  const navigate = useNavigate()
  const close = useMemo(() => evaluateMonthlyClose(state), [state])

  const metrics = useMemo(() => {
    const incurred = projectIncurredTotals(state.costSheetRows, state.costAccruals)
    return {
      bac: sumBac(state.costSheetRows),
      actuals: incurred.actuals,
      incurred: incurred.incurred,
      accruals: incurred.openAccruals,
      eac: sumCostSheetMetric(state.costSheetRows, 'eac'),
      vac: sumBac(state.costSheetRows) - sumCostSheetMetric(state.costSheetRows, 'eac'),
    }
  }, [state.costAccruals, state.costSheetRows])

  async function downloadClosePack() {
    if (!backendEnabled) {
      navigate('/exports')
      return
    }
    try {
      const pack = await fetchClosePack(state.meta.id)
      pack.files.forEach((file) => {
        const blob = new Blob([file.content], { type: file.mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
        URL.revokeObjectURL(url)
      })
    } catch {
      navigate('/exports')
    }
  }

  const continuePath = pathForView(close.currentStep.view)

  return (
    <div className="view-stack monthly-close" data-testid="monthly-close-workspace">
      <header className="close-hero panel">
        <div className="close-hero-copy">
          <span className="eyebrow">O&amp;G monthly control cycle · {close.periodLabel}</span>
          <h1>Month-end close</h1>
          <p className="muted">
            One guided path — not a module maze. Accruals, VOWD, change board, forecast sign-off, leadership pack.
            EcoSys separates progress from cost; we run them in sequence with live gates.
          </p>
        </div>
        <div className="close-hero-progress" aria-label={`${close.percentComplete}% complete`}>
          <div className="close-ring" style={{ '--pct': close.percentComplete } as React.CSSProperties}>
            <span>{close.percentComplete}%</span>
          </div>
          <p>
            <strong>{close.completedCount}</strong> of {close.totalSteps} steps complete
          </p>
        </div>
      </header>

      <section className="close-metrics metric-grid">
        <div className="metric-tile">
          <span>BAC</span>
          <strong>{formatUsd(metrics.bac)}</strong>
        </div>
        <div className="metric-tile">
          <span>Actuals</span>
          <strong>{formatUsd(metrics.actuals)}</strong>
        </div>
        <div className="metric-tile">
          <span>Incurred</span>
          <strong>{formatUsd(metrics.incurred)}</strong>
        </div>
        <div className="metric-tile">
          <span>Accruals</span>
          <strong>{formatUsd(metrics.accruals)}</strong>
        </div>
        <div className="metric-tile">
          <span>EAC</span>
          <strong>{formatUsd(metrics.eac)}</strong>
        </div>
        <div className={`metric-tile ${metrics.vac < 0 ? 'metric-tile--watch' : ''}`}>
          <span>VAC</span>
          <strong>{formatUsd(metrics.vac)}</strong>
        </div>
      </section>

      <section className="panel ingestion-apply-panel" data-testid="ingestion-apply">
        <div className="ingestion-apply-head">
          <div>
            <span className="eyebrow">Ingestion → forecast</span>
            <h3>Approved contractor data → live EAC</h3>
            <p className="muted">
              {pendingApplyCount(state.values) > 0
                ? `${pendingApplyCount(state.values)} approved extraction${pendingApplyCount(state.values) === 1 ? '' : 's'} ready to post to the cost model.`
                : 'No approved extractions waiting. Approve values in the review queue to post them into the forecast.'}
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={pendingApplyCount(state.values) === 0 || state.settings.reportingPeriod.locked}
            onClick={() =>
              dispatch({
                type: 'APPLY_APPROVED_EXTRACTIONS',
                payload: { actor: currentUser?.name ?? 'Cost Controller' },
              })
            }
            data-testid="apply-extractions-btn"
          >
            Apply approved extractions
          </button>
        </div>
        {state.ingestionApplications && state.ingestionApplications[0] && (
          <div className="ingestion-apply-insight" data-testid="ingestion-insight">
            <p>
              <strong>
                EAC moved {state.ingestionApplications[0].eacDeltaUsd >= 0 ? '+' : '−'}
                {formatUsd(Math.abs(state.ingestionApplications[0].eacDeltaUsd))}
              </strong>{' '}
              after applying {state.ingestionApplications[0].appliedCount} extraction
              {state.ingestionApplications[0].appliedCount === 1 ? '' : 's'} from{' '}
              {state.ingestionApplications[0].byReport.map((r) => r.reportName).join(', ') || 'contractor reports'}.
            </p>
            <ul className="ingestion-apply-lines">
              {state.ingestionApplications[0].lines.slice(0, 5).map((line) => (
                <li key={line.valueId}>
                  {line.field} → {line.targetControlAccountWbs} (
                  {line.effect === 'commitments' ? 'committed' : 'forecast'} {formatUsd(line.amountUsd)})
                </li>
              ))}
            </ul>
            {state.ingestionApplications[0].commitmentsDeltaUsd !== 0 && (
              <p className="muted">
                Commitments moved {state.ingestionApplications[0].commitmentsDeltaUsd >= 0 ? '+' : '−'}
                {formatUsd(Math.abs(state.ingestionApplications[0].commitmentsDeltaUsd))}.
              </p>
            )}
          </div>
        )}
      </section>

      {close.globalBlockers.length > 0 && (
        <section className="panel close-blockers-panel" data-testid="close-blockers">
          <h3>What needs attention</h3>
          <ul>
            {close.globalBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel close-cta-panel">
        <div>
          <span className="eyebrow">Current step</span>
          <h2>{close.currentStep.title}</h2>
          <p className="muted">{close.currentStep.description}</p>
        </div>
        <div className="close-cta-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate(continuePath)}
            data-testid="close-continue-primary"
          >
            {close.percentComplete === 100 ? 'Review final step' : `Go to step ${close.currentStep.order} →`}
          </button>
          {close.percentComplete >= 6 && (
            <button className="ghost-button" type="button" onClick={() => void downloadClosePack()}>
              Download close pack
            </button>
          )}
          <button
            className="ghost-button"
            type="button"
            onClick={() => dispatch({ type: 'SYNC_COMMITMENTS' })}
          >
            Sync commitments
          </button>
          {canApprove && !state.settings.reportingPeriod.locked && close.percentComplete >= 7 && (
            <button
              className="primary-button"
              type="button"
              onClick={() =>
                dispatch({
                  type: 'LOCK_REPORTING_PERIOD',
                  payload: { actor: 'Project Controls Manager', period: state.settings.reportingPeriod.period },
                })
              }
            >
              Lock {state.settings.reportingPeriod.period}
            </button>
          )}
          {state.settings.reportingPeriod.locked && (
            <span className="badge badge-good">Period locked</span>
          )}
        </div>
      </section>

      <nav className="close-stepper" aria-label="Monthly close steps">
        {close.steps.map((stepProgress) => {
          const { step, status, signals } = stepProgress
          const isCurrent = step.id === close.currentStep.id
          return (
            <Link
              key={step.id}
              className={`close-stepper-item close-stepper-item--${status}${isCurrent ? ' close-stepper-item--current' : ''}`}
              to={pathForView(step.view)}
              data-testid={`close-step-${step.id}`}
            >
              <span className="close-stepper-order">{step.order}</span>
              <div className="close-stepper-body">
                <strong>{step.title}</strong>
                <small>{statusLabel(status)}</small>
                <ul className="close-signals">
                  {signals.slice(0, 2).map((signal) => (
                    <li key={signal.label} className={signal.ok ? 'ok' : 'warn'}>
                      {signal.label}: {signal.value}
                    </li>
                  ))}
                </ul>
              </div>
            </Link>
          )
        })}
      </nav>

      <section className="panel close-ecosys-note">
        <h3>Why this beats module-first PMIS</h3>
        <ul className="close-compare-list">
          <li>
            <strong>Workflow clarity</strong> — sequential gates with live data, not 40 open menu items
          </li>
          <li>
            <strong>Speed</strong> — one continue button; command palette (⌘K) for power users
          </li>
          <li>
            <strong>O&amp;G opinion</strong> — budget change vs forecast variance enforced before sign-off
          </li>
          <li>
            <strong>Trust</strong> — control-account totals only; immutable audit on every save
          </li>
        </ul>
      </section>
    </div>
  )
}

export function MonthlyCloseRedirectNote() {
  return (
    <p className="muted">
      <Link to="/close">← Back to month-end close</Link>
    </p>
  )
}
