import { decisionRecords, roadmapItems } from '../data/projectData'

export function Decisions() {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Binding product strategy</span>
            <h3>Decision register for the first build</h3>
          </div>
          <span className="badge badge-good">MVP scope locked</span>
        </div>
        <div className="decision-grid">
          {decisionRecords.map((record) => (
            <article className="decision-card" key={record.id}>
              <span>{record.id}</span>
              <h4>{record.decision}</h4>
              <p>{record.choice}</p>
              <small>Rejected: {record.rejectedAlternative}</small>
              <div>
                <b>{record.evidenceTag}</b>
                <em>{record.confidence} confidence</em>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Roadmap discipline</span>
            <h3>What waits until commercial pull exists</h3>
          </div>
        </div>
        <div className="roadmap-list">
          {roadmapItems.map((item) => (
            <article className="roadmap-item" key={`${item.phase}-${item.item}`}>
              <span>{item.phase}</span>
              <div>
                <h4>{item.item}</h4>
                <p>{item.trigger}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
