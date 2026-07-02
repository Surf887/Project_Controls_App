import { useMemo } from 'react'
import { buildPoExposures, computeFxRiskUsd } from '../engine/forex'
import { useProjectStore } from '../store/projectStore'
import type { FxRate, FxSettings, SupportedCurrency } from '../store/types'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    signDisplay: value === 0 ? 'never' : 'auto',
  }).format(value)
}

const currencies: SupportedCurrency[] = ['USD', 'EUR', 'GBP', 'AED', 'SGD']

export function ForexView() {
  const { state, dispatch } = useProjectStore()
  const fx = state.settings.fx

  const exposures = useMemo(
    () => buildPoExposures(state.purchaseOrders, state.fxRates),
    [state.purchaseOrders, state.fxRates],
  )

  const risk = useMemo(
    () => computeFxRiskUsd(exposures, fx.adverseMovePct),
    [exposures, fx.adverseMovePct],
  )

  function updateFxSettings(patch: Partial<FxSettings>) {
    dispatch({ type: 'SET_FX_SETTINGS', payload: patch })
  }

  function updateRate(id: string, rate: number) {
    dispatch({
      type: 'SET_FX_RATES',
      payload: state.fxRates.map((item) => (item.id === id ? { ...item, rate } : item)),
    })
  }

  function addRate(from: SupportedCurrency) {
    if (from === 'USD' || state.fxRates.some((item) => item.from === from)) {
      return
    }

    const next: FxRate = {
      id: `FX-${from}-${Date.now()}`,
      from,
      to: 'USD',
      rate: 1,
      effectiveDate: new Date().toISOString().slice(0, 10),
      source: 'manual',
    }

    dispatch({ type: 'SET_FX_RATES', payload: [...state.fxRates, next] })
  }

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile label="PO exposure (USD)" value={formatUsd(exposures.reduce((s, e) => s + e.amountUsd, 0))} detail="Converted at treasury rates" />
        <MetricTile label="Unhedged exposure" value={formatUsd(risk.totalUnhedgedUsd)} detail="Open FX position" tone="watch" />
        <MetricTile
          label={`Adverse move (${fx.adverseMovePct}%)`}
          value={formatUsd(risk.adverseImpactUsd)}
          detail="Included in forecast when enabled"
          tone="risk"
        />
        <MetricTile
          label="Forecast FX load"
          value={fx.includeFxInForecast ? 'On' : 'Off'}
          detail="Spread across non-reserve WBS rows"
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Rate table</span>
            <h3>USD reporting conversion</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Rate</th>
                <th>Effective</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {state.fxRates.map((rate) => (
                <tr key={rate.id}>
                  <td><strong>{rate.from}</strong></td>
                  <td>{rate.to}</td>
                  <td>
                    <input
                      type="number"
                      step="0.0001"
                      value={rate.rate}
                      onChange={(event) => updateRate(rate.id, Number(event.target.value))}
                      style={{ width: '8rem' }}
                    />
                  </td>
                  <td>{rate.effectiveDate}</td>
                  <td>{rate.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-actions">
          {currencies
            .filter((currency) => currency !== 'USD')
            .filter((currency) => !state.fxRates.some((rate) => rate.from === currency))
            .map((currency) => (
              <button key={currency} type="button" className="btn-secondary" onClick={() => addRate(currency)}>
                Add {currency}/USD
              </button>
            ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Forecast settings</span>
            <h3>FX risk in EAC</h3>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Include FX in forecast</span>
            <input
              type="checkbox"
              checked={fx.includeFxInForecast}
              onChange={(event) => updateFxSettings({ includeFxInForecast: event.target.checked })}
            />
          </label>
          <label className="field">
            <span>Adverse move % (stress)</span>
            <input
              type="number"
              min={0}
              max={25}
              step={0.5}
              value={fx.adverseMovePct}
              onChange={(event) => updateFxSettings({ adverseMovePct: Number(event.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Commitment exposure</span>
            <h3>PO currency & hedge position</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PO</th>
                <th>Currency</th>
                <th>Foreign value</th>
                <th>USD equivalent</th>
                <th>Hedged</th>
                <th>Unhedged USD</th>
                <th>Instrument</th>
              </tr>
            </thead>
            <tbody>
              {exposures.map((exposure) => (
                <tr key={exposure.id}>
                  <td>
                    <strong>{exposure.referenceId}</strong>
                    <div className="muted">{exposure.description}</div>
                  </td>
                  <td>{exposure.currency}</td>
                  <td>{exposure.amountForeign.toLocaleString()}</td>
                  <td>{formatUsd(exposure.amountUsd)}</td>
                  <td>{exposure.hedgedPct}%</td>
                  <td>{formatUsd(exposure.unhedgedUsd)}</td>
                  <td>{exposure.hedgeInstrument ?? '—'}</td>
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
  tone?: 'default' | 'watch' | 'risk'
}) {
  const cls = ['metric-card', tone !== 'default' ? tone : ''].filter(Boolean).join(' ')
  return (
    <article className={cls}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
