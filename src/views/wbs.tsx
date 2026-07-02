import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { CostType, ProjectPhase, WbsNode } from '../store/types'
import { buildWbsImport, sampleWbsCsvContent } from '../utils/wbsImport'

const costTypes: CostType[] = ['CAPEX', 'OPEX', 'Owner Cost', 'Contingency', 'Management Reserve']
const phases: ProjectPhase[] = ['Engineering', 'Procurement', 'Construction', 'Commissioning']

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

interface WbsManagerProps {
  onImportComplete?: () => void
}

export function WbsManager({ onImportComplete }: WbsManagerProps) {
  const { state, dispatch } = useProjectStore()
  const [message, setMessage] = useState('Upload a WBS CSV or edit hierarchy tags in place.')

  const totals = useMemo(
    () => ({
      nodes: state.wbsNodes.length,
      budget: state.wbsNodes.reduce((sum, node) => sum + node.originalBudget, 0),
      capex: state.wbsNodes.filter((node) => node.costType === 'CAPEX').length,
    }),
    [state.wbsNodes],
  )

  function updateNode(id: string, patch: Partial<WbsNode>) {
    dispatch({
      type: 'SET_WBS_NODES',
      payload: state.wbsNodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    })
  }

  async function handleUpload(file: File) {
    const text = await file.text()
    const result = buildWbsImport(text)

    if (result.error) {
      setMessage(result.error)
      return
    }

    dispatch({ type: 'SET_WBS_NODES', payload: result.nodes })
    dispatch({ type: 'SET_COST_SHEET', payload: result.costRows })
    setMessage(`Imported ${result.nodes.length} WBS nodes from ${file.name}. Cost sheet updated.`)
    onImportComplete?.()
  }

  function downloadSample() {
    const blob = new Blob([sampleWbsCsvContent()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'sample-wbs.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Project structure</span>
          <h1>WBS manager</h1>
          <p className="muted">
            Import a work breakdown structure and tag cost type, phase, and discipline for every node.
          </p>
        </div>
      </div>

      <section className="metric-grid">
        <MetricTile label="WBS nodes" value={totals.nodes.toString()} detail="Hierarchy loaded in project store" />
        <MetricTile label="Original budget" value={formatUsd(totals.budget)} detail="Sum of WBS original budgets" />
        <MetricTile label="CAPEX nodes" value={totals.capex.toString()} detail="Capital scope elements" />
        <MetricTile label="Baseline" value={state.meta.baselineLabel} detail={state.meta.name} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">WBS import</span>
            <h3>Upload CSV/JSON structure and tag cost type, phase, and discipline</h3>
          </div>
          <button className="ghost-button" onClick={downloadSample} type="button">
            Download sample CSV
          </button>
        </div>
        <div className="split-panel">
          <div className="upload-zone">
            <p className="muted">
              Expected columns: <code>wbs, parentWbs, description, costType, phase, discipline, originalBudget, currency</code>.
              After upload the cost sheet is rebuilt from the hierarchy.
            </p>
            <div className="upload-actions">
              <label className="file-drop">
                <input
                  accept=".csv,text/csv"
                  className="hidden-file"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void handleUpload(file)
                      event.target.value = ''
                    }
                  }}
                  type="file"
                />
                <strong>Choose WBS CSV</strong>
                <span>EcoSys-style project structure import</span>
              </label>
            </div>
            <p className="upload-message">{message}</p>
          </div>
          <div className="format-card">
            <h3>Cost-type tags</h3>
            <ul>
              <li>CAPEX / OPEX / Owner Cost / Contingency / Management Reserve</li>
              <li>Phase: Engineering, Procurement, Construction, Commissioning</li>
              <li>Discipline free-text (Mechanical, Piping, Civil, etc.)</li>
              <li>Persists in browser localStorage via project store</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Project structure</span>
            <h3>Edit hierarchy tags</h3>
          </div>
          <span className="badge badge-good">{state.wbsNodes.length} rows</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>Parent</th>
                <th>Description</th>
                <th>Cost type</th>
                <th>Phase</th>
                <th>Discipline</th>
                <th>Original budget</th>
              </tr>
            </thead>
            <tbody>
              {state.wbsNodes.map((node) => (
                <tr key={node.id}>
                  <td><strong>{node.wbs}</strong></td>
                  <td>{node.parentWbs ?? '—'}</td>
                  <td>{node.description}</td>
                  <td>
                    <select
                      className="select-input compact-select"
                      onChange={(event) => updateNode(node.id, { costType: event.target.value as CostType })}
                      value={node.costType}
                    >
                      {costTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="select-input compact-select"
                      onChange={(event) => updateNode(node.id, { phase: event.target.value as ProjectPhase })}
                      value={node.phase}
                    >
                      {phases.map((phase) => (
                        <option key={phase} value={phase}>{phase}</option>
                      ))}
                    </select>
                  </td>
                  <td>{node.discipline}</td>
                  <td>{formatUsd(node.originalBudget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
