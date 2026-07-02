import { useMemo } from 'react'
import { approvalMatrix } from '../data/approvalMatrix'
import {
  buildPredictiveSignals,
  equipmentList,
  formatUsd,
  governanceControls,
  lineList,
  modelObjects,
  realityCaptures,
  tagRegister,
  type ItemStatus,
} from '../data/intelligence'
import { buildCashFlowFromState } from '../engine/cashFlow'
import { projectIncurredTotals } from '../engine/incurredCost'
import { sumBac, sumCostSheetMetric } from '../engine/costAggregation'
import { computeForecast } from '../engine/forecast'
import { computeEvmWithMethod, costSheetToEvmAccounts } from '../engine/evmFromCostSheet'
import { buildScurveFromCostSheet } from '../engine/loading'
import { useProjectStore } from '../store/projectStore'
import { CashFlowChart, ResourceHistogram, SCurveChart } from './charts'

function statusBadgeClass(status: ItemStatus | 'in_place' | 'partial' | 'planned') {
  switch (status) {
    case 'verified':
    case 'in_place':
      return 'badge-good'
    case 'flagged':
      return 'badge-risk'
    case 'planned':
      return 'badge-risk'
    default:
      return 'badge-watch'
  }
}

function statusLabel(status: string) {
  return status.replace('_', ' ')
}

export function EngineeringIntelligence() {
  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Engineering intelligence</span>
          <h1>Tag register &amp; line list</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Engineering intelligence</span>
            <h3>Tag register extracted from P&IDs</h3>
          </div>
          <span className="badge badge-watch">Phase 2 layer</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sortable-header" title="Sort by Tag">Tag ▾</th>
                <th>Description</th>
                <th className="sortable-header" title="Sort by Discipline">Discipline ▾</th>
                <th>Drawing</th>
                <th>Rev</th>
                <th className="sortable-header" title="Sort by Confidence">Confidence ▾</th>
                <th className="sortable-header" title="Sort by Status">Status ▾</th>
              </tr>
            </thead>
            <tbody>
              {tagRegister.map((item) => (
                <tr key={item.tag}>
                  <td><strong>{item.tag}</strong></td>
                  <td>{item.description}</td>
                  <td>{item.discipline}</td>
                  <td>{item.drawing}</td>
                  <td>{item.revision}</td>
                  <td>{Math.round(item.confidence * 100)}%</td>
                  <td><span className={`badge ${statusBadgeClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Line list</span>
              <h3>Piping lines</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Service</th>
                  <th>Size</th>
                  <th>Spec</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lineList.map((line) => (
                  <tr key={line.lineNumber}>
                    <td><strong>{line.lineNumber}</strong><small>{line.from} → {line.to}</small></td>
                    <td>{line.service}</td>
                    <td>{line.size}</td>
                    <td>{line.spec}</td>
                    <td><span className={`badge ${statusBadgeClass(line.status)}`}>{statusLabel(line.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Equipment list</span>
              <h3>Tagged equipment</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                <th className="sortable-header" title="Sort by Tag">Tag ▾</th>
                <th className="sortable-header" title="Sort by Type">Type ▾</th>
                <th className="sortable-header" title="Sort by Weight">Weight ▾</th>
                <th>Datasheet</th>
                <th className="sortable-header" title="Sort by Status">Status ▾</th>
              </tr>
              </thead>
              <tbody>
                {equipmentList.map((item) => (
                  <tr key={item.tag}>
                    <td><strong>{item.tag}</strong><small>{item.name}</small></td>
                    <td>{item.type}</td>
                    <td>{item.weightTonnes} t</td>
                    <td>{item.datasheet}</td>
                    <td><span className={`badge ${statusBadgeClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

export function ModelIntelligence() {
  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Model intelligence</span>
          <h1>IFC objects &amp; WBS mapping</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Model intelligence</span>
            <h3>IFC objects, quantities, and WBS mapping</h3>
          </div>
          <span className="badge badge-watch">Long-term layer</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Object</th>
                <th>IFC class</th>
                <th>Discipline</th>
                <th>Quantity</th>
                <th>Model rev</th>
                <th>Mapped WBS</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {modelObjects.map((object) => (
                <tr key={object.id}>
                  <td><strong>{object.name}</strong><small>{object.id}</small></td>
                  <td>{object.ifcClass}</td>
                  <td>{object.discipline}</td>
                  <td>{object.quantity}</td>
                  <td>{object.revision}</td>
                  <td>{object.mappedWbs}</td>
                  <td><span className={`badge ${statusBadgeClass(object.status)}`}>{statusLabel(object.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function RealityIntelligence() {
  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Reality intelligence</span>
          <h1>Captured progress vs planned</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Reality intelligence</span>
            <h3>Captured progress vs planned and reported</h3>
          </div>
          <span className="badge badge-watch">Long-term layer</span>
        </div>
        <div className="reality-list">
          {realityCaptures.map((capture) => {
            const overstatement = capture.reportedProgress - capture.capturedProgress

            return (
              <article className="reality-card" key={capture.area}>
                <div className="reality-head">
                  <div>
                    <strong>{capture.area}</strong>
                    <small>{capture.method} · {capture.capturedAt}</small>
                  </div>
                  <span className={`badge ${overstatement > 3 ? 'badge-risk' : 'badge-good'}`}>
                    {overstatement > 3 ? `Overstated +${overstatement}%` : 'Within tolerance'}
                  </span>
                </div>
                <ProgressBar label="Planned" value={capture.plannedProgress} tone="plan" />
                <ProgressBar label="Reported" value={capture.reportedProgress} tone="report" />
                <ProgressBar label="Captured" value={capture.capturedProgress} tone="capture" />
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ProgressBar({ label, value, tone }: { label: string; value: number; tone: 'plan' | 'report' | 'capture' }) {
  return (
    <div className="progress-row">
      <span>{label}</span>
      <div className="progress-track">
        <div className={`progress-fill ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <b>{value}%</b>
    </div>
  )
}

export function ControlsIntelligence() {
  const { state } = useProjectStore()
  const forecastByWbs = useMemo(
    () => new Map(computeForecast(state.costSheetRows, state.changes, state.risks, state.opportunities).map((row) => [row.wbs, row.eacMostLikely])),
    [state.changes, state.costSheetRows, state.opportunities, state.risks],
  )
  const results = useMemo(
    () =>
      costSheetToEvmAccounts(state.costSheetRows, {
        templates: state.ruleOfCreditTemplates,
        progressCredits: state.progressCredits,
      }).map((account) =>
        computeEvmWithMethod(account, state.settings.evmEacMethod, forecastByWbs.get(account.wbs)),
      ),
    [
      forecastByWbs,
      state.costSheetRows,
      state.progressCredits,
      state.ruleOfCreditTemplates,
      state.settings.evmEacMethod,
    ],
  )
  const scurve = useMemo(() => buildScurveFromCostSheet(state.costSheetRows), [state.costSheetRows])
  const cashFlow = useMemo(
    () => buildCashFlowFromState(state.costSheetRows, state.invoices),
    [state.costSheetRows, state.invoices],
  )
  const incurred = useMemo(
    () => projectIncurredTotals(state.costSheetRows, state.costAccruals),
    [state.costAccruals, state.costSheetRows],
  )
  const commitments = useMemo(
    () => sumCostSheetMetric(state.costSheetRows, 'commitments'),
    [state.costSheetRows],
  )
  const currentBudget = useMemo(() => sumBac(state.costSheetRows), [state.costSheetRows])
  const totals = results.reduce(
    (acc, r) => ({ bac: acc.bac + r.bac, ev: acc.ev + r.ev, ac: acc.ac + r.ac, eac: acc.eac + r.eac }),
    { bac: 0, ev: 0, ac: 0, eac: 0 },
  )
  const portfolioCpi = totals.ac === 0 ? 0 : totals.ev / totals.ac
  const portfolioVac = totals.bac - totals.eac

  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Controls intelligence</span>
          <h1>Earned value &amp; cost performance</h1>
        </div>
      </div>
      <section className="metric-grid">
        <MetricTile label="Current budget" value={formatUsd(currentBudget)} detail="Control-account BAC" />
        <MetricTile label="Commitments" value={formatUsd(commitments)} detail="PO / contract exposure on sheet" />
        <MetricTile label="Actual cost" value={formatUsd(incurred.actuals)} detail="Booked to date" />
        <MetricTile label="Incurred cost" value={formatUsd(incurred.incurred)} detail="Actuals + open accruals" tone="default" />
        <MetricTile label="Forecast EAC" value={formatUsd(totals.eac)} detail="CPI-based forecast" />
        <MetricTile label="Portfolio CPI" value={portfolioCpi.toFixed(2)} detail={portfolioCpi < 1 ? 'Over cost' : 'On/under cost'} tone={portfolioCpi < 1 ? 'risk' : 'default'} />
        <MetricTile label="Variance at completion" value={formatUsd(portfolioVac)} detail={portfolioVac < 0 ? 'Projected overrun' : 'Projected underrun'} tone={portfolioVac < 0 ? 'risk' : 'default'} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Project S-curve — cumulative cost %</span>
            <h3>Planned vs actual vs forecast (EAC)</h3>
          </div>
          <span className="badge badge-good">ISO 21508 EVM</span>
        </div>
        <SCurveChart data={scurve} />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Resource histogram</span>
              <h3>Man-hours by discipline</h3>
            </div>
          </div>
          <ResourceHistogram />
        </div>
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Monthly cash flow</span>
              <h3>Planned vs actual vs forecast</h3>
            </div>
          </div>
          <CashFlowChart data={cashFlow} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Earned value by WBS</span>
            <h3>CPI / SPI / EAC detail (ISO 21508)</h3>
          </div>
          <span className="badge badge-good">Rules-based</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>% complete</th>
                <th>CPI</th>
                <th>SPI</th>
                <th>CV</th>
                <th>SV</th>
                <th>EAC</th>
                <th>VAC</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.wbs}>
                  <td><strong>{r.wbs}</strong><small>{r.description}</small></td>
                  <td>{r.percentComplete.toFixed(0)}%</td>
                  <td><span className={r.cpi < 1 ? 'metric-negative' : 'metric-positive'}>{r.cpi.toFixed(2)}</span></td>
                  <td><span className={r.spi < 1 ? 'metric-negative' : 'metric-positive'}>{r.spi.toFixed(2)}</span></td>
                  <td className={r.cv < 0 ? 'metric-negative' : 'metric-positive'}>{formatUsd(r.cv)}</td>
                  <td className={r.sv < 0 ? 'metric-negative' : 'metric-positive'}>{formatUsd(r.sv)}</td>
                  <td>{formatUsd(r.eac)}</td>
                  <td className={r.vac < 0 ? 'metric-negative' : 'metric-positive'}>{formatUsd(r.vac)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function PredictiveIntelligence() {
  const { state } = useProjectStore()
  const results = useMemo(
    () =>
      costSheetToEvmAccounts(state.costSheetRows).map((account) =>
        computeEvmWithMethod(account, state.settings.evmEacMethod),
      ),
    [state.costSheetRows, state.settings.evmEacMethod],
  )
  const signals = buildPredictiveSignals(results)

  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Predictive intelligence</span>
          <h1>Rules-based risk signals</h1>
        </div>
        <span className="badge badge-watch">{signals.length} active signals</span>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Signal analysis</span>
            <h3>Rules-based risk signals before ML</h3>
          </div>
        </div>
        <p className="empty-state">
          These signals are deterministic thresholds on earned-value and reconciliation data. ML prediction graduates
          only when sufficient historical project data exists.
        </p>
        <div className="signal-grid">
          {signals.map((signal) => (
            <article className={`signal-card ${signal.severity}`} key={signal.id}>
              <div className="signal-head">
                <span className={`badge badge-${signal.severity === 'high' ? 'risk' : signal.severity === 'medium' ? 'watch' : 'good'}`}>
                  {signal.severity}
                </span>
                <b>{Math.round(signal.likelihood * 100)}% likelihood</b>
              </div>
              <h4>{signal.title}</h4>
              <p>{signal.basis}</p>
              <small>Recommendation: {signal.recommendation}</small>
              <span className="signal-tag">{signal.category} · {signal.evidence}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function Governance() {
  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Governance &amp; audit</span>
          <h1>Approval matrix &amp; controls posture</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Approval matrix</span>
            <h3>Who approves changes, forecasts, draws, and period close</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item type</th>
                <th>Amount from (USD)</th>
                <th>Amount to</th>
                <th>Approver role</th>
                <th>Named approver</th>
              </tr>
            </thead>
            <tbody>
              {approvalMatrix.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.itemType.replace(/_/g, ' ')}</td>
                  <td>{rule.minAmountUsd.toLocaleString()}</td>
                  <td>{rule.maxAmountUsd ? rule.maxAmountUsd.toLocaleString() : 'No limit'}</td>
                  <td>{rule.approverRole}</td>
                  <td>{rule.approverName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Governance & audit</span>
            <h3>Controls and standards posture</h3>
          </div>
          <span className="badge badge-good">Trust pipeline</span>
        </div>
        <div className="govern-list">
          {governanceControls.map((control) => (
            <article className="govern-card" key={control.id}>
              <div className="govern-head">
                <span>{control.id}</span>
                <span className={`badge ${statusBadgeClass(control.status)}`}>{statusLabel(control.status)}</span>
              </div>
              <h4>{control.control}</h4>
              <p>{control.detail}</p>
              <small>Standard: {control.standard}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function MetricTile({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'risk' }) {
  return (
    <article className={tone === 'risk' ? 'metric-card risk' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
