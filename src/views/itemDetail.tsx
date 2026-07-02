import { Link, useLocation } from 'react-router-dom'
import { useProjectStore } from '../store/projectStore'
import { MonthlyCloseRedirectNote } from './monthlyClose'

export function ItemDetailPage() {
  const location = useLocation()
  const match = location.pathname.match(/^\/item\/([^/]+)\/([^/]+)/)
  const type = match?.[1]
  const id = match?.[2]
  const { state } = useProjectStore()

  const record = (() => {
    switch (type) {
      case 'change':
        return state.changes.find((c) => c.id === id)
      case 'risk':
        return state.risks.find((r) => r.id === id)
      case 'wbs':
        return state.costSheetRows.find((r) => r.id === id || r.wbs === id)
      default:
        return null
    }
  })()

  return (
    <div className="view-stack" data-testid="item-detail">
      <MonthlyCloseRedirectNote />
      <div className="topbar">
        <div>
          <span className="eyebrow">Item detail</span>
          <h1>{type} · {id}</h1>
        </div>
        <div className="topbar-actions">
          <Link className="ghost-button" to={type === 'change' ? '/changes' : type === 'wbs' ? '/wbs' : '/risks'}>
            Back to register
          </Link>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">{type ?? 'Record'}</span>
            <h3>Raw record — {id}</h3>
          </div>
        </div>
        {!record && <p className="muted">Record not found in active project.</p>}
        {record && (
          <pre className="detail-json">{JSON.stringify(record, null, 2)}</pre>
        )}
      </section>
    </div>
  )
}

export function AuditDrillDownPage() {
  const location = useLocation()
  const entryId = location.pathname.replace(/^\/audit\//, '')
  const { state } = useProjectStore()
  const entry = state.auditLog.find((e) => e.id === entryId)

  return (
    <div className="view-stack" data-testid="audit-drill-down">
      <MonthlyCloseRedirectNote />
      <div className="topbar">
        <div>
          <span className="eyebrow">Audit drill-down</span>
          <h1>{entryId}</h1>
        </div>
        <div className="topbar-actions">
          <Link className="ghost-button" to="/audit">
            Back to audit trail
          </Link>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Audit entry</span>
            <h3>Full event detail</h3>
          </div>
        </div>
        {!entry && <p className="muted">Audit entry not found.</p>}
        {entry && (
          <>
            <p>
              <strong>{entry.action}</strong> · {entry.actor} · {new Date(entry.at).toLocaleString()}
            </p>
            <p className="muted" style={{ marginTop: '6px' }}>{entry.summary}</p>
            <p className="muted" style={{ marginTop: '4px' }}>
              {entry.entityType} · {entry.entityId} · {entry.team}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
