import { useProjectStore } from '../store/projectStore'
import type { BasisOfEstimate } from '../store/types'

const sections: Array<{ key: keyof BasisOfEstimate; label: string; hint: string }> = [
  { key: 'scope', label: 'Scope definition', hint: 'AACE 34R-05 — what is included in the estimate.' },
  { key: 'methodology', label: 'Estimating methodology', hint: 'Basis, class, and approach (bottom-up, parametric, etc.).' },
  { key: 'designBasis', label: 'Design basis', hint: 'Drawings, specs, and technical assumptions.' },
  { key: 'allowances', label: 'Allowances', hint: 'Design growth, freight, escalation buffers.' },
  { key: 'exclusions', label: 'Exclusions', hint: 'Explicitly out-of-scope items.' },
  { key: 'risksOpportunities', label: 'Risks & opportunities', hint: 'Linked to register; contingency basis.' },
]

export function BasisOfEstimateView() {
  const { state, dispatch } = useProjectStore()
  const boe = state.basisOfEstimate

  function updateField(key: keyof BasisOfEstimate, value: string) {
    dispatch({
      type: 'SET_BASIS_OF_ESTIMATE',
      payload: { [key]: value, lastUpdated: new Date().toLocaleDateString() },
    })
  }

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">AACE 34R-05 · Basis of Estimate</span>
            <h3>Estimate basis attached to {state.meta.baselineLabel}</h3>
          </div>
          <span className="badge badge-good">Baseline locked</span>
        </div>
        <p className="boe-intro">
          Prepared by <strong>{boe.preparedBy}</strong> · Last updated {boe.lastUpdated}. This document supports audit,
          change evaluation, and forecast reconciliation.
        </p>
      </section>

      <section className="boe-grid">
        {sections.map((section) => (
          <article className="panel boe-section" key={section.key}>
            <span className="eyebrow">{section.label}</span>
            <small>{section.hint}</small>
            <textarea
              className="boe-textarea"
              onChange={(event) => updateField(section.key, event.target.value)}
              rows={5}
              value={boe[section.key]}
            />
          </article>
        ))}
      </section>
    </div>
  )
}
