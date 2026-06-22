import { useMemo } from 'react'
import {
  directIndirectTotals,
  enrichedRowBudget,
  tecopBreakdown,
} from '../engine/costStructure'
import { useProjectStore } from '../store/projectStore'
import type { BurdenRule, CbsNode, TecCategory } from '../store/types'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

const tecLabels: Record<TecCategory, string> = {
  T: 'Technical (labour)',
  E: 'Engineering',
  C: 'Construction equipment',
  O: 'Overhead',
  P: 'Procurement / equipment',
  NTR: 'Non-technical risk',
  Owner: 'Owner costs',
  Reserve: 'Contingency / MR',
}

export function CostStructureView() {
  const { state, dispatch } = useProjectStore()

  const totals = useMemo(
    () => directIndirectTotals(state.costSheetRows, state.cbsNodes),
    [state.cbsNodes, state.costSheetRows],
  )

  const tecop = useMemo(
    () => tecopBreakdown(state.costSheetRows, state.cbsNodes),
    [state.cbsNodes, state.costSheetRows],
  )

  const rowEnrichment = useMemo(
    () =>
      state.costSheetRows
        .filter((row) => row.parentId === null)
        .map((row) => ({
          row,
          ...enrichedRowBudget(row, state.cbsNodes, state.burdenRules),
        })),
    [state.burdenRules, state.cbsNodes, state.costSheetRows],
  )

  function updateCbsNode(id: string, patch: Partial<CbsNode>) {
    dispatch({
      type: 'SET_CBS_NODES',
      payload: state.cbsNodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    })
  }

  function updateBurdenRule(id: string, patch: Partial<BurdenRule>) {
    dispatch({
      type: 'SET_BURDEN_RULES',
      payload: state.burdenRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    })
  }

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile label="Direct cost" value={formatUsd(totals.direct)} detail="Mapped CBS — direct nature" />
        <MetricTile label="Indirect cost" value={formatUsd(totals.indirect)} detail="Engineering, OH, owner, reserve" />
        <MetricTile label="Unmapped CBS" value={formatUsd(totals.unmapped)} detail="Rows without CBS match" tone={totals.unmapped > 0 ? 'watch' : 'default'} />
        <MetricTile label="Loaded budget (sample)" value={formatUsd(rowEnrichment.reduce((s, r) => s + r.loadedBudget, 0))} detail="Direct rows with burden rules applied" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">TECOP / NTR</span>
            <h3>Cost category breakdown (current budget)</h3>
          </div>
        </div>
        <div className="bar-row">
          {(Object.keys(tecop) as TecCategory[])
            .filter((key) => tecop[key] > 0)
            .map((key) => (
              <div className="bar-item" key={key}>
                <div className="bar-col">
                  <div className="bar-actual" style={{ height: `${Math.min((tecop[key] / totals.total) * 100, 100)}%` }} />
                </div>
                <small>{key}</small>
                <b>{formatUsd(tecop[key])}</b>
                <span className="muted">{tecLabels[key]}</span>
              </div>
            ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">CBS hierarchy</span>
            <h3>Direct / indirect mapping</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Parent</th>
                <th>Nature</th>
                <th>TEC</th>
                <th>Default burden %</th>
              </tr>
            </thead>
            <tbody>
              {state.cbsNodes.map((node) => (
                <tr key={node.id}>
                  <td><strong>{node.code}</strong></td>
                  <td>{node.description}</td>
                  <td>{node.parentCode ?? '—'}</td>
                  <td>
                    <select
                      value={node.costNature}
                      onChange={(event) =>
                        updateCbsNode(node.id, { costNature: event.target.value as CbsNode['costNature'] })
                      }
                    >
                      <option value="direct">Direct</option>
                      <option value="indirect">Indirect</option>
                    </select>
                  </td>
                  <td>{node.tecCategory}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={node.defaultBurdenPct}
                      onChange={(event) => updateCbsNode(node.id, { defaultBurdenPct: Number(event.target.value) })}
                      style={{ width: '5rem' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Burden rules</span>
            <h3>Indirect loading on direct cost</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Applies to TEC</th>
                <th>Burden %</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {state.burdenRules.map((rule) => (
                <tr key={rule.id}>
                  <td><strong>{rule.name}</strong></td>
                  <td>{rule.appliesToTec.join(', ')}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={rule.burdenPct}
                      onChange={(event) => updateBurdenRule(rule.id, { burdenPct: Number(event.target.value) })}
                      style={{ width: '5rem' }}
                    />
                  </td>
                  <td className="muted">{rule.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cost sheet linkage</span>
            <h3>Control accounts → CBS → loaded budget</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>CBS</th>
                <th>Nature</th>
                <th>TEC</th>
                <th>Current budget</th>
                <th>Loaded budget</th>
              </tr>
            </thead>
            <tbody>
              {rowEnrichment.map(({ row, costNature, tecCategory, baseBudget, loadedBudget }) => (
                <tr key={row.id}>
                  <td><strong>{row.wbs}</strong></td>
                  <td>{row.cbs}</td>
                  <td>{costNature}</td>
                  <td>{tecCategory}</td>
                  <td>{formatUsd(baseBudget)}</td>
                  <td>{formatUsd(loadedBudget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MetricTile({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'watch'
}) {
  return (
    <article className={tone === 'watch' ? 'metric-card watch' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
