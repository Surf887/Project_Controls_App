import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { teamReportTemplates } from '../data/governance'
import { downloadCsv, generateTeamReportCsv } from '../engine/governance'
import { useProjectStore } from '../store/projectStore'
import { fetchImmutableAudit, type ImmutableAuditEvent } from '../api/client'

export function TeamReportsView() {
  const { state, dispatch, currentUser } = useProjectStore()

  function generate(templateId: string) {
    const template = teamReportTemplates.find((item) => item.id === templateId)
    if (!template) return

    const report = generateTeamReportCsv(template, state, currentUser?.name ?? 'Report user')
    dispatch({ type: 'ADD_GENERATED_REPORT', payload: report })
    downloadCsv(`${template.id}-${Date.now()}.csv`, report.content)
  }

  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Team reports</span>
          <h1>Team report packs</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Report templates</span>
            <h3>Generate CSV packs for team consumption</h3>
          </div>
        </div>
        <div className="report-list">
          {teamReportTemplates.map((template) => (
            <article key={template.id} className="report-card">
              <div>
                <span className="eyebrow">{template.audience}</span>
                <h4>{template.name}</h4>
                <p>{template.description}</p>
              </div>
              <div className="report-meta">
                <button type="button" className="ghost-button" onClick={() => generate(template.id)}>Generate CSV</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Recent exports</span>
            <h3>Generated in this session</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Audience</th>
                <th>Rows</th>
                <th>Generated</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {state.generatedTeamReports.length === 0 && (
                <tr><td colSpan={5}>No reports generated yet.</td></tr>
              )}
              {state.generatedTeamReports.map((report) => (
                <tr key={report.id}>
                  <td><strong>{report.name}</strong></td>
                  <td>{report.audience}</td>
                  <td>{report.rowCount}</td>
                  <td>{report.generatedAt}</td>
                  <td>{report.generatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function AuditTrailView() {
  const { state, backendEnabled } = useProjectStore()
  const [events, setEvents] = useState<ImmutableAuditEvent[]>([])
  const [integrity, setIntegrity] = useState<{ ok: boolean; errors: string[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!backendEnabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchImmutableAudit(state.meta.id)
      .then((result) => {
        if (cancelled) return
        setEvents(result.events)
        setIntegrity(result.integrity)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Audit trail unavailable')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [backendEnabled, state.meta.id])

  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Audit trail</span>
          <h1>Who changed what and when</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Server immutable audit</span>
            <h3>HMAC-verified action history</h3>
          </div>
          {integrity && (
            <span className={`badge ${integrity.ok ? 'badge-good' : 'badge-risk'}`}>
              {integrity.ok ? 'Chain verified' : 'Integrity failure'}
            </span>
          )}
        </div>
        {!backendEnabled && <p className="empty-state">Connect to the API to verify the immutable audit chain.</p>}
        {loading && <p className="empty-state">Loading immutable audit events…</p>}
        {error && <p className="notice-card risk">{error}</p>}
        {integrity && !integrity.ok && (
          <p className="notice-card risk">{integrity.errors.join('; ')}</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Team</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {!loading && backendEnabled && events.length === 0 && (
                <tr><td colSpan={7}>No immutable audit events recorded yet.</td></tr>
              )}
              {events.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.at}</td>
                  <td><strong>{entry.actor}</strong></td>
                  <td>{entry.team}</td>
                  <td>{entry.entityType}</td>
                  <td>{entry.entityId}</td>
                  <td>{entry.action}</td>
                  <td>{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Workflow history</span>
            <h3>Project-state activity for in-app drill-down</h3>
          </div>
          <span className="badge badge-watch">Not the immutable chain</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Team</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {state.auditLog.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.at}</td>
                  <td><strong>{entry.actor}</strong></td>
                  <td>{entry.team}</td>
                  <td>{entry.entityType}</td>
                  <td>{entry.entityId}</td>
                  <td><Link to={`/audit/${entry.id}`}>{entry.action}</Link></td>
                  <td>{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
