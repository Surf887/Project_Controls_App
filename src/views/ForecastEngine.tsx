import { useMemo } from 'react'
import { computeForecast, totalForecastSnapshot } from '../engine/forecast'
import { buildPoExposures, computeFxRiskUsd } from '../engine/forex'
import { useProjectStore } from '../store/projectStore'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    signDisplay: value === 0 ? 'never' : 'auto',
  }).format(value)
}

export function ForecastEngineView() {
  const { state } = useProjectStore()

  const fxAdverseUsd = useMemo(() => {
    if (!state.settings.fx.includeFxInForecast) {
      return 0
    }

    return computeFxRiskUsd(
      buildPoExposures(state.purchaseOrders, state.fxRates),
      state.settings.fx.adverseMovePct,
    ).adverseImpactUsd
  }, [state.fxRates, state.purchaseOrders, state.settings.fx])

  const snapshots = useMemo(
    () =>
      computeForecast(state.costSheetRows, state.changes, state.risks, state.opportunities, {
        fxAdverseUsd,
      }),
    [fxAdverseUsd, state.changes, state.costSheetRows, state.opportunities, state.risks],
  )

  const totals = useMemo(() => totalForecastSnapshot(snapshots, state.costSheetRows), [snapshots, state.costSheetRows])

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile label="EAC base" value={formatUsd(totals.eacBase)} detail="Actuals + remaining budget" />
        <MetricTile label="Best case EAC" value={formatUsd(totals.eacBestCase)} detail="Approved changes only" />
        <MetricTile label="Most likely EAC" value={formatUsd(totals.eacMostLikely)} detail="Pending × probability + risk + FX" tone="risk" />
        <MetricTile label="Worst case EAC" value={formatUsd(totals.eacWorstCase)} detail="Full pending + open-risk worst case + 2× FX" tone="risk" />
        <MetricTile label="Contingency draws" value={formatUsd(totals.contingencyDraw)} detail="Posted from reserve WBS" />
        <MetricTile label="FX load (most likely)" value={formatUsd(totals.fxExposure)} detail={`Unhedged stress at ${state.settings.fx.adverseMovePct}%`} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Forecast engine</span>
            <h3>Change-order-aware EAC by WBS row</h3>
          </div>
          <span className="badge badge-good">Pure deterministic engine</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>EAC base</th>
                <th>Approved Δ</th>
                <th>Pending (prob.)</th>
                <th>Risk</th>
                <th>FX</th>
                <th>Reserve draw</th>
                <th>Best</th>
                <th>Most likely</th>
                <th>Worst</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((row) => (
                <tr key={row.wbs}>
                  <td><strong>{row.wbs}</strong></td>
                  <td>{formatUsd(row.eacBase)}</td>
                  <td>{formatUsd(row.approvedChangesDelta)}</td>
                  <td>{formatUsd(row.pendingChangesExpectedDelta)}</td>
                  <td>{formatUsd(row.riskExposure)}</td>
                  <td>{formatUsd(row.fxExposure)}</td>
                  <td>{formatUsd(row.contingencyDraw)}</td>
                  <td>{formatUsd(row.eacBestCase)}</td>
                  <td><strong>{formatUsd(row.eacMostLikely)}</strong></td>
                  <td>{formatUsd(row.eacWorstCase)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MetricTile({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'risk'
}) {
  return (
    <article className={tone === 'risk' ? 'metric-card risk' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
