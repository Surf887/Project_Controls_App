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
      <section className="panel">
        <span className="eyebrow">Detail</span>
        <h2>
          {type} · {id}
        </h2>
        {!record && <p className="muted">Record not found in active project.</p>}
        {record && (
          <pre className="detail-json">{JSON.stringify(record, null, 2)}</pre>
        )}
        <Link className="ghost-button" to={type === 'change' ? '/changes' : type === 'wbs' ? '/wbs' : '/risks'}>
          Back to register
        </Link>
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
      <section className="panel">
        <span className="eyebrow">Audit drill-down</span>
        <h2>{entryId}</h2>
        {!entry && <p className="muted">Audit entry not found.</p>}
        {entry && (
          <>
            <p>
              <strong>{entry.action}</strong> · {entry.actor} · {new Date(entry.at).toLocaleString()}
            </p>
            <p className="muted">{entry.summary}</p>
            <p className="muted">
              {entry.entityType} · {entry.entityId} · {entry.team}
            </p>
          </>
        )}
        <Link className="ghost-button" to="/audit">
          Back to audit trail
        </Link>
      </section>
    </div>
  )
}
