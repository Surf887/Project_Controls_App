import { useMemo } from 'react'
import { PERIODS, CURRENT_PERIOD_INDEX } from '../data/costSheet'
import { accrualTotals, accruedCostForWbs } from '../engine/accruals'
import { sumCostSheetMetric } from '../engine/costAggregation'
import { useProjectStore } from '../store/projectStore'
import type { AccrualStatus, CostAccrualEntry } from '../store/types'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    signDisplay: value === 0 ? 'never' : 'auto',
  }).format(value)
}

const sourceLabels: Record<CostAccrualEntry['sourceType'], string> = {
  subcontract: 'Subcontract (earned − invoiced)',
  purchase_order: 'PO commitment − invoiced',
  invoice_pending: 'Invoice pending actuals',
  manual: 'Manual / period-end adjustment',
  timesheet: 'Timesheet lag',
}

export function AccrualsView() {
  const { state, dispatch } = useProjectStore()
  const currentPeriod = PERIODS[CURRENT_PERIOD_INDEX]
  const totals = useMemo(() => accrualTotals(state.costAccruals), [state.costAccruals])

  const costSheetActuals = useMemo(
    () => sumCostSheetMetric(state.costSheetRows, 'actualsToDate'),
    [state.costSheetRows],
  )

  const economicActuals = costSheetActuals + totals.totalOpen

  const wbsRollup = useMemo(() => {
    const rows = state.costSheetRows.filter((row) => row.parentId === null)
    return rows.map((row) => ({
      wbs: row.wbs,
      description: row.description,
      postedActuals: row.actualsToDate,
      accrued: accruedCostForWbs(state.costAccruals, row.wbs),
    }))
  }, [state.costAccruals, state.costSheetRows])

  function setStatus(entry: CostAccrualEntry, status: AccrualStatus) {
    dispatch({ type: 'UPDATE_COST_ACCRUAL', payload: { ...entry, status } })
  }

  const allPosted = state.costAccruals.length > 0 && state.costAccruals.every((a) => a.status === 'posted')

  return (
    <div className="view-stack">

      {/* Topbar — matches handoff: mono eyebrow + h1 + status chip + actions */}
      <header className="topbar">
        <div className="topbar-identity">
          <span className="eyebrow">Monthly control cycle · Step 1 of 5{allPosted ? ' · Posted' : ''}</span>
          <h1>Accruals</h1>
        </div>
        <div className="topbar-actions">
          <span
            className="period-banner-status"
            style={{ background: allPosted ? 'var(--positive-bg)' : 'var(--warning-bg)', color: allPosted ? 'var(--positive-fg)' : 'var(--warning-fg)' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            {allPosted ? `Period locked · ${currentPeriod}` : `Drafting · ${currentPeriod}`}
          </span>
          <button type="button" className="ghost-button" onClick={() => dispatch({ type: 'RECONCILE_ACCRUALS' })}>
            Recalculate
          </button>
          <button type="button" className="primary-button" onClick={() => dispatch({ type: 'RECONCILE_ACCRUALS' })}>
            + Add accrual
          </button>
        </div>
      </header>

      <section className="metric-grid kpi-row">
        <MetricTile label="Open accruals" value={formatUsd(totals.totalOpen)} detail={`Period ${currentPeriod}`} tone="watch" />
        <MetricTile label="Posted accruals" value={formatUsd(totals.totalPosted)} detail="Prior period postings" />
        <MetricTile label="Cost sheet actuals" value={formatUsd(costSheetActuals)} detail="Posted AP / ERP actuals" />
        <MetricTile label="Economic actuals" value={formatUsd(economicActuals)} detail="Actuals + open accruals (period-end view)" tone="accent" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Accrual methods</span>
            <h3>How period-end cost is calculated</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => dispatch({ type: 'RECONCILE_ACCRUALS' })}>
            Recalculate
          </button>
        </div>
        <div className="metric-grid">
          <article className="metric-card">
            <span>Subcontract</span>
            <strong>{formatUsd(totals.bySource.subcontract)}</strong>
            <p>Earned progress not yet invoiced</p>
          </article>
          <article className="metric-card">
            <span>PO commitment</span>
            <strong>{formatUsd(totals.bySource.purchase_order)}</strong>
            <p>Committed minus invoiced on PO</p>
          </article>
          <article className="metric-card">
            <span>Pending invoice</span>
            <strong>{formatUsd(totals.bySource.invoice_pending)}</strong>
            <p>Approved invoice not in actuals</p>
          </article>
          <article className="metric-card">
            <span>Manual / timesheet</span>
            <strong>{formatUsd(totals.bySource.manual + totals.bySource.timesheet)}</strong>
            <p>Field tickets and payroll lag</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Accrual register</span>
            <h3>Period-end unbilled cost by source</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>Description</th>
                <th>Source</th>
                <th>Basis</th>
                <th>Settled</th>
                <th>Accrual</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.costAccruals.map((entry) => (
                <tr key={entry.id}>
                  <td><strong>{entry.wbs}</strong></td>
                  <td>{entry.description}</td>
                  <td>{sourceLabels[entry.sourceType]}</td>
                  <td>{formatUsd(entry.basisAmountUsd)}</td>
                  <td>{formatUsd(entry.settledAmountUsd)}</td>
                  <td><strong>{formatUsd(entry.accrualUsd)}</strong></td>
                  <td className="muted">{entry.calculationMethod}</td>
                  <td>
                    <select
                      className="select-input"
                      value={entry.status}
                      onChange={(event) => setStatus(entry, event.target.value as AccrualStatus)}
                      style={{ minHeight: 'unset', padding: '3px 8px', fontSize: 12 }}
                    >
                      <option value="draft">draft</option>
                      <option value="reviewed">reviewed</option>
                      <option value="posted">posted</option>
                      <option value="reversed">reversed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">WBS rollup</span>
            <h3>Posted actuals vs accrued cost by control account</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>Description</th>
                <th>Posted actuals</th>
                <th>Open accrual</th>
                <th>Economic actuals</th>
              </tr>
            </thead>
            <tbody>
              {wbsRollup.map((row) => (
                <tr key={row.wbs}>
                  <td><strong>{row.wbs}</strong></td>
                  <td>{row.description}</td>
                  <td>{formatUsd(row.postedActuals)}</td>
                  <td>{formatUsd(row.accrued)}</td>
                  <td><strong>{formatUsd(row.postedActuals + row.accrued)}</strong></td>
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
  tone?: 'default' | 'watch' | 'risk' | 'accent'
}) {
  let className = 'metric-card'
  if (tone === 'watch') className = 'metric-card watch'
  else if (tone === 'risk') className = 'metric-card risk'
  return (
    <article className={className}>
      <span>{label}</span>
      <strong style={tone === 'accent' ? { color: 'var(--ac)' } : undefined}>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
