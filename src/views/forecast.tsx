import { useMemo, useState } from 'react'
import { computeForecast, totalForecastSnapshot } from '../engine/forecast'
import { runMonteCarlo } from '../engine/scenario'
import { useProjectStore } from '../store/projectStore'
import { defaultScenarioInputs, type ScenarioInputs } from '../store/types'
import { CdfChart, HistogramChart, TornadoChart } from './monteCarloCharts'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function ForecastWhatIf() {
  const { state } = useProjectStore()
  const [inputs, setInputs] = useState<ScenarioInputs>(defaultScenarioInputs)

  const baseTotals = useMemo(
    () =>
      totalForecastSnapshot(
        computeForecast(state.costSheetRows, state.changes, state.risks, state.opportunities),
        state.costSheetRows,
      ),
    [state.changes, state.costSheetRows, state.opportunities, state.risks],
  )

  const monteCarlo = useMemo(
    () =>
      runMonteCarlo(
        baseTotals.eacMostLikely,
        state.changes,
        state.risks,
        inputs,
      ),
    [baseTotals.eacMostLikely, inputs, state.changes, state.risks],
  )

  function updateInput<K extends keyof ScenarioInputs>(key: K, value: number) {
    setInputs((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile label="Deterministic EAC" value={formatUsd(baseTotals.eacMostLikely)} detail="Current cost sheet baseline" />
        <MetricTile label="P10 EAC" value={formatUsd(monteCarlo.p10)} detail="Optimistic (10th percentile)" />
        <MetricTile label="P50 EAC" value={formatUsd(monteCarlo.p50)} detail="Most likely outcome" tone="risk" />
        <MetricTile label="P90 EAC" value={formatUsd(monteCarlo.p90)} detail="Conservative (90th percentile)" tone="risk" />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Scenario inputs</span>
              <h3>What-if drivers (does not mutate project state)</h3>
            </div>
          </div>
          <div className="slider-list">
            <SliderRow label="Productivity factor" hint="0.7 under-performing · 1.3 over-performing" min={0.7} max={1.3} step={0.05} value={inputs.productivityFactor} onChange={(v) => updateInput('productivityFactor', v)} />
            <SliderRow label="Escalation rate" hint="% applied to forecast-to-complete" min={0} max={15} step={0.5} suffix="%" value={inputs.escalationRatePct} onChange={(v) => updateInput('escalationRatePct', v)} />
            <SliderRow label="Scope growth" hint="% added to remaining budget" min={-10} max={20} step={1} suffix="%" value={inputs.scopeGrowthPct} onChange={(v) => updateInput('scopeGrowthPct', v)} />
            <SliderRow label="Schedule extension" hint="Months of time-related cost burn" min={0} max={12} step={1} suffix=" mo" value={inputs.scheduleExtensionMonths} onChange={(v) => updateInput('scheduleExtensionMonths', v)} />
            <SliderRow label="Change approval probability" hint="Overrides individual pending change probabilities" min={0} max={1} step={0.05} value={inputs.changeApprovalProbability} onChange={(v) => updateInput('changeApprovalProbability', v)} />
            <SliderRow label="Contingency draw-down" hint="% of contingency converted to forecast" min={0} max={100} step={5} suffix="%" value={inputs.contingencyDrawPct} onChange={(v) => updateInput('contingencyDrawPct', v)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Monte Carlo simulation</span>
              <h3>N=2000 · triangular distributions</h3>
            </div>
            <span className="badge badge-good">Pure JS engine</span>
          </div>
          <HistogramChart {...monteCarlo} />
        </div>
      </section>

      <section className="two-column">
        <TornadoChart {...monteCarlo} />
        <CdfChart {...monteCarlo} />
      </section>
    </div>
  )
}

function SliderRow({
  label,
  hint,
  min,
  max,
  step,
  suffix = '',
  value,
  onChange,
}: {
  label: string
  hint: string
  min: number
  max: number
  step: number
  suffix?: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="slider-row">
      <div className="slider-row-head">
        <strong>{label}</strong>
        <b>{value}{suffix}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <small>{hint}</small>
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
