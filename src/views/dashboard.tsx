import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildScurveFromCostSheet } from '../engine/loading'
import { pathForView } from '../routes/viewPaths'
import { useProjectStore } from '../store/projectStore'
import { SCurveChart } from './charts'
import { confidenceClass, formatCurrency, MetricCard, ReportCard } from './extractionShared'

export function Dashboard() {
  const { state } = useProjectStore()
  const navigate = useNavigate()
  const values = state.values
  const reports = state.reports

  const scurveData = useMemo(() => buildScurveFromCostSheet(state.costSheetRows), [state.costSheetRows])

  const metrics = useMemo(() => {
    const approved = values.filter((value) => value.approvalStatus === 'approved').length
    const needsCorrection = values.filter((value) => value.reviewStatus === 'needs_correction').length
    const criticalIssues = values.reduce(
      (total, value) => total + value.validationIssues.filter((issue) => issue.severity === 'critical').length,
      0,
    )
    const averageConfidence =
      values.length === 0 ? 0 : values.reduce((total, value) => total + value.confidence, 0) / values.length
    const forecastExposure = values
      .filter((value) => value.unit === 'USD')
      .reduce((total, value) => total + value.normalizedValue, 0)

    return {
      approved,
      needsCorrection,
      criticalIssues,
      averageConfidence,
      forecastExposure,
      reviewProgress: values.length === 0 ? 0 : Math.round((approved / values.length) * 100),
    }
  }, [values])

  const pipelineStages = [
    { label: 'Received', count: reports.length, detail: 'contractor files' },
    { label: 'Extracted', count: values.length, detail: 'structured values' },
    { label: 'Reviewed', count: metrics.approved, detail: 'approved values' },
    { label: 'Exceptions', count: metrics.needsCorrection + metrics.criticalIssues, detail: 'need action' },
  ]

  return (
    <div className="view-stack">
      <section className="dashboard-hero">
        <div className="dashboard-hero-text">
          <span className="eyebrow">AI Project Controls Intelligence Platform</span>
          <h2>Every reported number — reviewable, correctable, approvable, traceable.</h2>
          <p>Owner-side contractor report ingestion · Earned value analytics · Rules-based risk signals · Source lineage on every value.</p>
          <div className="hero-actions" style={{ marginTop: '4px' }}>
            <button className="primary-button" onClick={() => navigate(pathForView('review'))} type="button">Open review queue</button>
            <button className="ghost-button" onClick={() => navigate(pathForView('validation'))} type="button">Validation rules</button>
          </div>
        </div>
        <div className="dashboard-hero-chart">
          <span className="eyebrow">Project S-curve — cost cumulative %</span>
          <SCurveChart data={scurveData} />
        </div>
      </section>

      <section className="metric-grid" style={{ gap: 'var(--grid-gap, 20px)' }}>
        <MetricCard label="Forecast exposure" value={formatCurrency(metrics.forecastExposure)} detail="USD values in current queue" />
        <MetricCard label="Review progress" value={`${metrics.reviewProgress}%`} detail={`${metrics.approved} approved values`} />
        <MetricCard
          label="Avg. confidence"
          value={`${Math.round(metrics.averageConfidence * 100)}%`}
          detail="AI extraction confidence"
        />
        <MetricCard label="Critical issues" value={metrics.criticalIssues.toString()} detail="must resolve before approval" tone="risk" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Trust pipeline</span>
            <h3>Messy source to approved intelligence</h3>
          </div>
          <span className="badge badge-watch">Human-in-the-loop</span>
        </div>
        <div className="pipeline-grid">
          {pipelineStages.map((stage, index) => (
            <article className="pipeline-stage" key={stage.label}>
              <span className="stage-index">{String(index + 1).padStart(2, '0')} / {pipelineStages.length}</span>
              <strong>{stage.label}</strong>
              <b>{stage.count}</b>
              <small>{stage.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Current queue</span>
              <h3>Reports requiring confidence review</h3>
            </div>
          </div>
          <div className="report-list compact">
            {reports.map((report) => (
              <ReportCard report={report} key={report.id} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Risk signals</span>
              <h3>Rules before predictions</h3>
            </div>
          </div>
          <div className="risk-list">
            {values
              .filter((value) => value.validationIssues.length > 0)
              .map((value) => (
                <article className="risk-item" key={value.id}>
                  <span className={`badge badge-${confidenceClass(value.confidence)}`}>
                    {Math.round(value.confidence * 100)}% confidence
                  </span>
                  <strong>{value.field}</strong>
                  <p>{value.validationIssues[0].message}</p>
                </article>
              ))}
          </div>
        </div>
      </section>
    </div>
  )
}
