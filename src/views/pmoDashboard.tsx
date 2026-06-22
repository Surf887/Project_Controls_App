import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchPortfolioGovernance,
  type PortfolioGovernanceResponse,
} from '../api/client'
import { useProjectStore } from '../store/projectStore'
import { MonthlyCloseRedirectNote } from './monthlyClose'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function PmoDashboardView() {
  const { backendEnabled } = useProjectStore()
  const [data, setData] = useState<PortfolioGovernanceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!backendEnabled) {
      return
    }
    void fetchPortfolioGovernance()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load portfolio'))
  }, [backendEnabled])

  const rollup = data?.rollup
  const policy = data?.policy

  return (
    <section className="panel-stack" data-testid="pmo-dashboard">
      <MonthlyCloseRedirectNote />
      <header className="panel-header">
        <div>
          <p className="eyebrow">Portfolio governance</p>
          <h1>PMO dashboard</h1>
          <p className="muted">Cross-project health, policy thresholds, and flagged assets.</p>
        </div>
        <Link className="ghost-button" to="/portfolio">
          Portfolio compare
        </Link>
      </header>

      {!backendEnabled && (
        <p className="callout">Enable the API backend to load live portfolio rollup and policy data.</p>
      )}

      {error && <p className="callout risk">{error}</p>}

      {rollup && policy && (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">Projects</span>
              <strong>{rollup.projectCount}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Total BAC</span>
              <strong>{formatUsd(rollup.totalBacUsd)}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Total EAC</span>
              <strong>{formatUsd(rollup.totalEacUsd)}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Weighted CPI</span>
              <strong>{rollup.weightedCpi.toFixed(2)}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Weighted SPI</span>
              <strong>{rollup.weightedSpi.toFixed(2)}</strong>
            </article>
          </div>

          <article className="panel">
            <h2>Policy — {policy.name}</h2>
            <ul className="plain-list">
              <li>CPI warning below {policy.cpiWarningThreshold}</li>
              <li>Open change exposure limit {formatUsd(policy.openChangeExposureLimitUsd)}</li>
              <li>Forecast sign-off roles: {policy.forecastSignoffRoles.join(', ')}</li>
            </ul>
          </article>

          <article className="panel">
            <h2>Flagged projects</h2>
            {rollup.flaggedProjects.length === 0 ? (
              <p className="muted">No projects breaching policy thresholds.</p>
            ) : (
              <ul className="plain-list">
                {rollup.flaggedProjects.map((project) => (
                  <li key={`${project.id}-${project.reason}`}>
                    <strong>{project.name}</strong> — {project.reason}
                  </li>
                ))}
              </ul>
            )}
          </article>
        </>
      )}
    </section>
  )
}
