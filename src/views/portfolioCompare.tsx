import { useMemo } from 'react'
import { useProjectStore } from '../store/projectStore'
import { syncActivePortfolioProject } from '../engine/governance'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function PortfolioCompareView() {
  const { state, dispatch } = useProjectStore()
  const projects = useMemo(() => syncActivePortfolioProject(state), [state])

  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Portfolio management</span>
          <h1>Portfolio compare</h1>
        </div>
      </div>
      <section className="metric-grid">
        <MetricTile label="Projects in portfolio" value={projects.length.toString()} detail="Cross-project benchmarking" />
        <MetricTile
          label="Active project EAC"
          value={formatUsd(projects.find((p) => p.isActive)?.eacUsd ?? 0)}
          detail={projects.find((p) => p.isActive)?.name ?? '—'}
        />
        <MetricTile
          label="Best CPI (portfolio)"
          value={Math.max(...projects.map((p) => p.cpi)).toFixed(2)}
          detail="Highest cost performance index"
        />
        <MetricTile
          label="Forecast approval"
          value={projects.find((p) => p.isActive)?.forecastApprovalStatus.replace('_', ' ') ?? '—'}
          detail="Current project workflow status"
          tone="watch"
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Portfolio comparison</span>
            <h3>Project-to-project performance</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => dispatch({ type: 'SYNC_PORTFOLIO' })}>
            Refresh active project
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Phase</th>
                <th>BAC</th>
                <th>EAC</th>
                <th>Actuals</th>
                <th>VAC</th>
                <th>CPI</th>
                <th>SPI</th>
                <th>Open changes</th>
                <th>Open risks</th>
                <th>Forecast approval</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className={project.isActive ? 'row-active' : ''}>
                  <td>
                    <strong>{project.name}</strong>
                    <div className="muted">{project.client}{project.isActive ? ' · active' : ''}</div>
                  </td>
                  <td>{project.phase}</td>
                  <td>{formatUsd(project.bacUsd)}</td>
                  <td>{formatUsd(project.eacUsd)}</td>
                  <td>{formatUsd(project.actualsUsd)}</td>
                  <td className={project.vacUsd < 0 ? 'metric-negative' : 'metric-positive'}>{formatUsd(project.vacUsd)}</td>
                  <td>{project.cpi.toFixed(2)}</td>
                  <td>{project.spi.toFixed(2)}</td>
                  <td>{formatUsd(project.openChangesUsd)}</td>
                  <td>{formatUsd(project.openRisksUsd)}</td>
                  <td><span className="badge badge-watch">{project.forecastApprovalStatus.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MetricTile({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'watch' }) {
  return (
    <article className="metric-card" style={tone === 'watch' ? { borderColor: 'color-mix(in srgb, var(--warning-fg) 25%, var(--border))' } : undefined}>
      <span>{label}</span>
      <strong style={tone === 'watch' ? { color: 'var(--warning-fg)' } : undefined}>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
