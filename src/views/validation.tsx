import { validationRules } from '../data/projectData'
import { useProjectStore } from '../store/projectStore'
import { MetricCard } from './extractionShared'

export function Validation() {
  const { state, dispatch } = useProjectStore()
  const values = state.values
  const mappedValues = values.filter((value) => value.wbs !== 'N/A').length
  const mappingCoverage = values.length === 0 ? 0 : Math.round((mappedValues / values.length) * 100)

  function onSelect(id: string) {
    dispatch({ type: 'SET_SELECTED_VALUE', payload: id })
  }

  return (
    <div className="view-stack">
      <section className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--grid-gap, 20px)' }}>
        <MetricCard label="Total values" value={values.length.toString()} detail="extracted from source documents" />
        <MetricCard label="Mapping coverage" value={`${mappingCoverage}%`} detail="values mapped to client WBS/CBS" />
        <MetricCard
          label="Validation rules"
          value={validationRules.length.toString()}
          detail="deterministic controls before ML"
        />
        <MetricCard
          label="Open warnings"
          value={values.reduce((total, value) => total + value.validationIssues.length, 0).toString()}
          detail="requires reviewer judgement"
          tone="risk"
        />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Rules engine</span>
              <h3>Validation checks</h3>
            </div>
          </div>
          <div className="rule-list">
            {validationRules.map((rule) => (
              <article className="rule-card" key={rule.id}>
                <span className={`badge badge-${rule.result === 'fail' ? 'risk' : rule.result === 'warning' ? 'watch' : 'good'}`}>
                  {rule.result}
                </span>
                <h4>{rule.name}</h4>
                <p>{rule.description}</p>
                <small>Affects: {rule.affectedFields.join(', ')}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Mapping model</span>
              <h3>Map standards, never force them</h3>
            </div>
          </div>
          <div className="mapping-list">
            {values.map((value) => (
              <button className="mapping-row" key={value.id} onClick={() => onSelect(value.id)} type="button">
                <span>
                  <strong>{value.field}</strong>
                  <small>{value.standardMapping}</small>
                </span>
                <b>{value.wbs}</b>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
