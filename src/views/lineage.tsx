import { useProjectStore } from '../store/projectStore'
import { approvalLabels, statusClass } from './extractionShared'

export function Lineage() {
  const { state } = useProjectStore()
  const value = state.values.find((item) => item.id === state.selectedValueId) ?? state.values[0]

  if (!value) {
    return (
      <section className="panel">
        <span className="eyebrow">Click-to-source traceability</span>
        <h3>No extracted values yet</h3>
        <p className="empty-state">
          Import a contractor report from the ingestion workspace to trace every number to its source.
        </p>
      </section>
    )
  }

  return (
    <div className="view-stack">
      <section className="panel lineage-card">
        <div>
          <span className="eyebrow">Click-to-source traceability</span>
          <h2>{value.field}</h2>
          <p>
            Every approved dashboard number keeps its source document, table location, confidence, reviewer,
            correction history, and approval status.
          </p>
        </div>
        <span className={`badge badge-${statusClass(value.approvalStatus)}`}>{approvalLabels[value.approvalStatus]}</span>
      </section>

      <section className="two-column">
        <div className="panel">
          <span className="eyebrow">Source reference</span>
          <h3>{value.source.document}</h3>
          <dl className="detail-list">
            <div>
              <dt>Sheet / page</dt>
              <dd>{value.source.sheet ?? `Page ${value.source.page ?? 'N/A'}`}</dd>
            </div>
            <div>
              <dt>Table</dt>
              <dd>{value.source.table}</dd>
            </div>
            <div>
              <dt>Row / column</dt>
              <dd>{value.source.row} / {value.source.column}</dd>
            </div>
            <div>
              <dt>Anchor</dt>
              <dd>{value.source.anchor}</dd>
            </div>
          </dl>
        </div>

        <div className="panel source-preview">
          <span className="eyebrow">Source preview</span>
          <div className="sheet-preview">
            <div className="sheet-row header">
              <span>WBS</span>
              <span>Metric</span>
              <span>Reported</span>
              <span>Reviewer</span>
            </div>
            <div className="sheet-row">
              <span>{value.wbs}</span>
              <span>{value.field}</span>
              <span className="highlight-cell">{value.rawValue}</span>
              <span>{value.reviewer}</span>
            </div>
            <div className="sheet-row muted">
              <span>Source</span>
              <span>{value.source.table}</span>
              <span>{value.source.row}</span>
              <span>{value.source.column}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Audit trail</span>
            <h3>Correction history</h3>
          </div>
          <span className="badge badge-watch">{value.correctionHistory.length} entries</span>
        </div>
        {value.correctionHistory.length === 0 ? (
          <p className="empty-state">No corrections recorded yet.</p>
        ) : (
          <div className="timeline">
            {value.correctionHistory.map((entry) => (
              <article className="timeline-item" key={`${entry.at}-${entry.reason}`}>
                <strong>{entry.by}</strong>
                <span>{entry.at}</span>
                <p>{entry.reason}</p>
                <small>
                  {entry.from} → {entry.to}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
