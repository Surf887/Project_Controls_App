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
    <div className="view-stack" data-testid="pmo-dashboard">
      <MonthlyCloseRedirectNote />
      <div className="topbar">
        <div>
          <span className="eyebrow">Portfolio governance</span>
          <h1>PMO dashboard</h1>
          <p className="muted">Cross-project health, policy thresholds, and flagged assets.</p>
        </div>
        <div className="topbar-actions">
          <Link className="ghost-button" to="/portfolio">
            Portfolio compare
          </Link>
        </div>
      </div>

      {!backendEnabled && (
        <p className="callout">Enable the API backend to load live portfolio rollup and policy data.</p>
      )}

      {error && <p className="callout risk">{error}</p>}

      {rollup && policy && (
        <>
          <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            <article className="metric-card">
              <span>Projects</span>
              <strong>{rollup.projectCount}</strong>
              <p>Active in portfolio</p>
            </article>
            <article className="metric-card">
              <span>Total BAC</span>
              <strong>{formatUsd(rollup.totalBacUsd)}</strong>
              <p>Approved budget at completion</p>
            </article>
            <article className="metric-card">
              <span>Total EAC</span>
              <strong>{formatUsd(rollup.totalEacUsd)}</strong>
              <p>Current forecast at completion</p>
            </article>
            <article className="metric-card">
              <span>Weighted CPI</span>
              <strong>{rollup.weightedCpi.toFixed(2)}</strong>
              <p>Portfolio cost performance index</p>
            </article>
            <article className="metric-card">
              <span>Weighted SPI</span>
              <strong>{rollup.weightedSpi.toFixed(2)}</strong>
              <p>Portfolio schedule performance index</p>
            </article>
          </div>

          <article className="panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">PMO policy</span>
                <h3>{policy.name}</h3>
              </div>
            </div>
            <ul className="plain-list">
              <li>CPI warning below {policy.cpiWarningThreshold}</li>
              <li>Open change exposure limit {formatUsd(policy.openChangeExposureLimitUsd)}</li>
              <li>Forecast sign-off roles: {policy.forecastSignoffRoles.join(', ')}</li>
            </ul>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Policy compliance</span>
                <h3>Flagged projects</h3>
              </div>
              <span className={`badge ${rollup.flaggedProjects.length === 0 ? 'badge-good' : 'badge-risk'}`}>
                {rollup.flaggedProjects.length === 0 ? 'All clear' : `${rollup.flaggedProjects.length} flagged`}
              </span>
            </div>
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
    </div>
  )
}
