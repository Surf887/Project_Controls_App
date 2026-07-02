import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildCostControlLogStats } from '../engine/costControlLogStats'
import { pathForView } from '../routes/viewPaths'
import { useProjectStore } from '../store/projectStore'
import { MonthlyCloseRedirectNote } from './monthlyClose'

function statusClass(status: 'ok' | 'watch' | 'action') {
  if (status === 'action') return 'log-stat--action'
  if (status === 'watch') return 'log-stat--watch'
  return 'log-stat--ok'
}

export function CostControlLogsView() {
  const { state } = useProjectStore()
  const navigate = useNavigate()
  const stats = useMemo(() => buildCostControlLogStats(state), [state])

  return (
    <div className="view-stack" data-testid="cost-control-logs">
      <MonthlyCloseRedirectNote />
      <div className="topbar">
        <div>
          <span className="eyebrow">Cost control</span>
          <h1>Cost control logs</h1>
          <p className="muted">
            {stats.length} industry-standard logs for monthly close — each links to the workspace that owns the data.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="ghost-button" to="/close">
            Monthly close
          </Link>
        </div>
      </div>

      <div className="log-grid">
        {stats.map(({ log, headline, detail, openCount, status }) => (
          <article key={log.id} className={`panel log-card ${statusClass(status)}`}>
            <div className="log-card-head">
              <span className="log-order">{log.order}</span>
              <div>
                <h2>{log.name}</h2>
                <p className="muted log-tracks">{log.tracks}</p>
              </div>
            </div>
            <div className="log-card-metrics">
              <strong>{headline}</strong>
              <span className="muted">{detail}</span>
              {openCount > 0 && <span className="badge">{openCount} open</span>}
            </div>
            <div className="log-card-actions">
              <button className="primary-button" type="button" onClick={() => navigate(pathForView(log.view))}>
                Open log
              </button>
              {log.relatedViews?.map((view) => (
                <button key={view} className="ghost-button" type="button" onClick={() => navigate(pathForView(view))}>
                  {view.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      <article className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Close sequence</span>
            <h3>How this maps to monthly close</h3>
          </div>
        </div>
        <p className="muted">
          Accruals (8), actuals (6), and commitments (2) reconcile before forecast (5) submission. Changes (3),
          MoC (16), and trends (4) feed the change board. Contingency (10), risk (9), and claims (13) gate reserve
          draws. FX (18) and WBS mapping (17) close out international and coding integrity. All logs append to the
          immutable audit trail on the server.
        </p>
        <p className="muted" style={{ marginTop: '8px' }}>
          <Link to={pathForView('audit-trail')}>Audit trail</Link> ·{' '}
          <Link to="/exports">Export centre</Link>
        </p>
      </article>
    </div>
  )
}
