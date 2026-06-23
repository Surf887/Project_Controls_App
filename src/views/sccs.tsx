import { useMemo } from 'react'
import { useProjectStore } from '../store/projectStore'
import {
  enrichCostSheetRows,
  enrichExtractedValues,
  exportSccsCsv,
  facetTree,
  lookupLabels,
  resolveSccsForCostRow,
  rollupCostSheetBySccs,
} from '../engine/sccs'
import { SCCS_STANDARD, countSccsCodes, type SccsFacet } from '../data/sccs'
import {
  defaultCbsCorRules,
  defaultPhaseSabRules,
  defaultWbsPbsRules,
} from '../data/sccsMappings'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function FacetPanel({ facet, title }: { facet: SccsFacet; title: string }) {
  const codes = facetTree(facet)
  return (
    <article className="panel sccs-facet-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">{facet.toUpperCase()}</p>
          <h3>{title}</h3>
        </div>
      </header>
      <div className="table-scroll">
        <table className="data-table compact-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Level</th>
              <th>Name</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((entry) => (
              <tr key={entry.code}>
                <td>
                  <code>{entry.code}</code>
                </td>
                <td>{entry.level}</td>
                <td>{entry.name}</td>
                <td className="muted">{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export function SccsView() {
  const { state, dispatch } = useProjectStore()
  const codeCounts = countSccsCodes()

  const enrichedRows = useMemo(() => enrichCostSheetRows(state.costSheetRows), [state.costSheetRows])
  const rollup = useMemo(() => rollupCostSheetBySccs(enrichedRows), [enrichedRows])
  const mappedValues = useMemo(
    () => enrichExtractedValues(state.values).filter((value) => value.sccs),
    [state.values],
  )

  function reapplyMappings() {
    dispatch({ type: 'SET_COST_SHEET', payload: enrichCostSheetRows(state.costSheetRows) })
    dispatch({ type: 'SET_VALUES', payload: enrichExtractedValues(state.values) })
  }

  return (
    <div className="view-stack sccs-view" data-testid="sccs-view">
      <header className="panel-header">
        <div>
          <p className="eyebrow">{SCCS_STANDARD} · Standard Cost Coding System</p>
          <h1>SCCS structure</h1>
          <p className="muted">
            Three ISO facets — PBS ({codeCounts.pbs} codes), SAB ({codeCounts.sab} codes), COR ({codeCounts.cor} codes)
            — mapped from your project WBS, CBS, and phase. Project breakdowns stay unique; SCCS enables
            cross-operator benchmarking and data exchange.
          </p>
        </div>
        <div className="hero-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => downloadText('sccs-cost-export.csv', exportSccsCsv(enrichedRows), 'text/csv')}
            data-testid="export-sccs-csv"
          >
            Export SCCS CSV
          </button>
          <button className="primary-button" type="button" onClick={reapplyMappings} data-testid="reapply-sccs">
            Re-apply mappings
          </button>
        </div>
      </header>

      <section className="callout sccs-diagram">
        <strong>Composite code</strong> = PBS · SAB · COR — e.g.{' '}
        <code>AAC.KD.HT</code> = Process &amp; utilities · Construction · Technical personnel
      </section>

      <div className="sccs-facet-grid">
        <FacetPanel facet="pbs" title="Physical Breakdown Structure" />
        <FacetPanel facet="sab" title="Standard Activity Breakdown" />
        <FacetPanel facet="cor" title="Code of Resources" />
      </div>

      <section className="panel">
        <h3>Mapping rules (project → ISO)</h3>
        <div className="sccs-mapping-grid">
          <div>
            <h4>WBS → PBS</h4>
            <ul className="sccs-rule-list">
              {defaultWbsPbsRules.map((rule) => (
                <li key={rule.wbsPrefix}>
                  <code>{rule.wbsPrefix}*</code> → <code>{rule.pbs}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Phase → SAB</h4>
            <ul className="sccs-rule-list">
              {defaultPhaseSabRules.map((rule) => (
                <li key={rule.phase}>
                  {rule.phase} → <code>{rule.sab}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>CBS → COR</h4>
            <ul className="sccs-rule-list">
              {defaultCbsCorRules.slice(0, 8).map((rule) => (
                <li key={rule.cbsPrefix}>
                  <code>{rule.cbsPrefix}*</code> → <code>{rule.cor}</code>
                </li>
              ))}
              <li className="muted">+ {defaultCbsCorRules.length - 8} more rules</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Live rollup — cost sheet by SCCS composite</h3>
        <div className="table-scroll">
          <table className="data-table" data-testid="sccs-rollup-table">
            <thead>
              <tr>
                <th>Composite</th>
                <th>PBS</th>
                <th>SAB</th>
                <th>COR</th>
                <th>Control accounts</th>
                <th>Current budget</th>
                <th>EAC</th>
              </tr>
            </thead>
            <tbody>
              {rollup.map((line) => {
                const labels = lookupLabels(line)
                return (
                  <tr key={line.composite}>
                    <td>
                      <code>{line.composite}</code>
                    </td>
                    <td title={labels.pbs}>
                      <code>{line.pbs}</code>
                    </td>
                    <td title={labels.sab}>
                      <code>{line.sab}</code>
                    </td>
                    <td title={labels.cor}>
                      <code>{line.cor}</code>
                    </td>
                    <td>{line.rowCount}</td>
                    <td>{formatUsd(line.budgetUsd)}</td>
                    <td>{formatUsd(line.eacUsd)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Cost sheet control accounts — resolved SCCS</h3>
        <div className="table-scroll">
          <table className="data-table compact-table">
            <thead>
              <tr>
                <th>WBS</th>
                <th>CBS</th>
                <th>Phase</th>
                <th>Composite</th>
                <th>EAC</th>
              </tr>
            </thead>
            <tbody>
              {enrichedRows
                .filter((row) => row.parentId === null)
                .map((row) => {
                  const sccs = resolveSccsForCostRow(row)
                  return (
                    <tr key={row.id}>
                      <td>{row.wbs}</td>
                      <td>{row.cbs}</td>
                      <td>{row.phase}</td>
                      <td>
                        <code>{sccs.composite}</code>
                      </td>
                      <td>{formatUsd(row.eac)}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </section>

      {mappedValues.length > 0 && (
        <section className="panel">
          <h3>Ingestion queue — extracted values with SCCS</h3>
          <div className="table-scroll">
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>WBS</th>
                  <th>CBS</th>
                  <th>Category</th>
                  <th>Composite</th>
                </tr>
              </thead>
              <tbody>
                {mappedValues.slice(0, 15).map((value) => (
                  <tr key={value.id}>
                    <td>{value.field}</td>
                    <td>{value.wbs}</td>
                    <td>{value.cbs}</td>
                    <td>{value.category}</td>
                    <td>
                      <code>{value.sccs?.composite}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
