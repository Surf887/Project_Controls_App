import { Link } from 'react-router-dom'
import { teamReportTemplates } from '../data/governance'
import { downloadCsv, generateTeamReportCsv } from '../engine/governance'
import { useProjectStore } from '../store/projectStore'

export function TeamReportsView() {
  const { state, dispatch } = useProjectStore()

  function generate(templateId: string) {
    const template = teamReportTemplates.find((item) => item.id === templateId)
    if (!template) return

    const report = generateTeamReportCsv(template, state, 'You')
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
  const { state } = useProjectStore()

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
            <span className="eyebrow">Immutable log</span>
            <h3>Forecast, change, and settings history</h3>
          </div>
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
                  <td>
                    <Link to={`/audit/${entry.id}`}>{entry.action}</Link>
                  </td>
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
