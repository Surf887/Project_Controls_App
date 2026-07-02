import { useMemo } from 'react'
import { buildDraftForecastPackage } from '../engine/governance'
import { useProjectStore } from '../store/projectStore'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function ForecastApprovalView() {
  const { state, dispatch } = useProjectStore()
  const current = useMemo(() => {
    const existing =
      state.forecastApprovals.find((p) => p.status === 'under_review') ??
      state.forecastApprovals.find((p) => p.status === 'draft')
    if (existing) return existing
    return buildDraftForecastPackage(state)
  }, [state.forecastApprovals, state.costSheetRows, state.changes, state.risks, state.opportunities, state.settings.eacScenario, state.meta.baselineLabel])

  function submit() {
    const existing = state.forecastApprovals.find((p) => p.id === current.id)
    if (existing) {
      dispatch({ type: 'SUBMIT_FORECAST', payload: { packageId: existing.id, actor: 'Cost Engineer', comment: 'Monthly forecast submission.' } })
    } else {
      dispatch({ type: 'SET_FORECAST_APPROVALS', payload: [...state.forecastApprovals, current] })
      dispatch({ type: 'SUBMIT_FORECAST', payload: { packageId: current.id, actor: 'Cost Engineer' } })
    }
  }

  return (
    <div className="view-stack">
      <h1 className="page-heading">Forecast approval</h1>
      <section className="metric-grid">
        <MetricTile label="Current BAC" value={formatUsd(current.bacTotalUsd)} detail="Budget at completion" />
        <MetricTile label="Proposed EAC" value={formatUsd(current.eacTotalUsd)} detail={`Scenario: ${current.scenario}`} tone="watch" />
        <MetricTile label="VAC" value={formatUsd(current.vacUsd)} detail={current.vacUsd < 0 ? 'Projected overrun' : 'Underrun'} tone={current.vacUsd < 0 ? 'watch' : 'default'} />
        <MetricTile label="Status" value={current.status.replace('_', ' ')} detail={current.approver} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Forecast approval</span>
            <h3>{current.label}</h3>
          </div>
          <div className="panel-header-actions">
            {current.status !== 'approved' && current.status !== 'under_review' && (
              <button type="button" className="primary-button" onClick={submit}>Submit for approval</button>
            )}
            {current.status === 'under_review' && (
              <>
                <button type="button" className="primary-button" onClick={() => dispatch({ type: 'APPROVE_FORECAST', payload: { packageId: current.id, actor: 'Project Director', comment: 'Forecast approved.' } })}>Approve</button>
                <button type="button" className="ghost-button" onClick={() => dispatch({ type: 'REJECT_FORECAST', payload: { packageId: current.id, actor: 'Project Director', comment: 'Return for rework.' } })}>Reject</button>
              </>
            )}
          </div>
        </div>
        <p className="muted">{current.notes || 'Monthly forecast package requires approver sign-off before locking EAC in reporting.'}</p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Approval history</span>
            <h3>Forecast workflow trail</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Package</th>
                <th>Period</th>
                <th>Status</th>
                <th>EAC</th>
                <th>Submitted</th>
                <th>Approver</th>
              </tr>
            </thead>
            <tbody>
              {state.forecastApprovals.map((pkg) => (
                <tr key={pkg.id}>
                  <td><strong>{pkg.label}</strong></td>
                  <td>{pkg.period}</td>
                  <td>{pkg.status.replace('_', ' ')}</td>
                  <td>{formatUsd(pkg.eacTotalUsd)}</td>
                  <td>{pkg.submittedAt ?? '—'}</td>
                  <td>{pkg.approver}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="workfront-list">
          {current.approvalHistory.map((step) => (
            <article key={step.id} className="workfront-card">
              <strong>{step.action.replace('_', ' ')}</strong>
              <small>{step.at} · {step.actor} ({step.role})</small>
              {step.comment && <p className="muted">{step.comment}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function MetricTile({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'watch' }) {
  return (
    <article className={tone === 'watch' ? 'metric-card watch' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
