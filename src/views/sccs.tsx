import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useProjectRole } from '../hooks/useProjectRole'
import {
  enrichCostSheetRows,
  enrichExtractedValues,
  exportSccsCsv,
  facetTree,
  lookupLabels,
  resolveSccsForCostRow,
  rollupCostSheetBySccs,
} from '../engine/sccs'
import {
  SCCS_STANDARD,
  corCodes,
  countSccsCodes,
  pbsCodes,
  sabCodes,
  type SccsFacet,
} from '../data/sccs'
import {
  buildSccsAssignment,
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
      <div className="panel-header">
        <div>
          <span className="eyebrow">{facet.toUpperCase()}</span>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="table-wrap">
        <table>
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
  const { state, dispatch, currentUser } = useProjectStore()
  const { canEdit } = useProjectRole()
  const codeCounts = countSccsCodes()
  const controlAccounts = useMemo(
    () => state.costSheetRows.filter((row) => row.parentId === null).sort((a, b) => a.wbs.localeCompare(b.wbs)),
    [state.costSheetRows],
  )
  const [mappingSearch, setMappingSearch] = useState('')
  const [mappingFilter, setMappingFilter] = useState<'all' | 'mapped' | 'manual'>('all')
  const [selectedRowId, setSelectedRowId] = useState(() => controlAccounts[0]?.id ?? '')
  const selectedRow = controlAccounts.find((row) => row.id === selectedRowId) ?? controlAccounts[0]
  const selectedAssignment = selectedRow ? resolveSccsForCostRow(selectedRow) : null
  const [draftPbs, setDraftPbs] = useState(selectedAssignment?.pbs ?? pbsCodes[0]?.code ?? '')
  const [draftSab, setDraftSab] = useState(selectedAssignment?.sab ?? sabCodes[0]?.code ?? '')
  const [draftCor, setDraftCor] = useState(selectedAssignment?.cor ?? corCodes[0]?.code ?? '')
  const periodLocked = state.settings.reportingPeriod.locked
  const mappingDisabled = !canEdit || periodLocked

  const enrichedRows = useMemo(() => enrichCostSheetRows(state.costSheetRows), [state.costSheetRows])
  const rollup = useMemo(() => rollupCostSheetBySccs(enrichedRows), [enrichedRows])
  const mappedValues = useMemo(
    () => enrichExtractedValues(state.values).filter((value) => value.sccs),
    [state.values],
  )
  const filteredAccounts = useMemo(() => {
    const query = mappingSearch.trim().toLowerCase()
    return controlAccounts.filter((row) => {
      const source = resolveSccsForCostRow(row).source
      const matchesFilter = mappingFilter === 'all' || source === mappingFilter
      const matchesSearch =
        query.length === 0 ||
        [row.wbs, row.cbs, row.description, row.discipline, resolveSccsForCostRow(row).composite]
          .join(' ')
          .toLowerCase()
          .includes(query)
      return matchesFilter && matchesSearch
    })
  }, [controlAccounts, mappingFilter, mappingSearch])
  const manualCount = controlAccounts.filter((row) => resolveSccsForCostRow(row).source === 'manual').length
  const automaticForSelected = selectedRow
    ? buildSccsAssignment({ wbs: selectedRow.wbs, cbs: selectedRow.cbs, phase: selectedRow.phase })
    : null

  useEffect(() => {
    if (!selectedRow) return
    const assignment = resolveSccsForCostRow(selectedRow)
    setSelectedRowId(selectedRow.id)
    setDraftPbs(assignment.pbs)
    setDraftSab(assignment.sab)
    setDraftCor(assignment.cor)
  }, [selectedRow])

  function reapplyMappings() {
    dispatch({ type: 'SET_COST_SHEET', payload: enrichCostSheetRows(state.costSheetRows) })
    dispatch({ type: 'SET_VALUES', payload: enrichExtractedValues(state.values) })
  }

  function saveManualMapping() {
    if (!selectedRow || mappingDisabled) return
    const sccs = buildSccsAssignment({
      wbs: selectedRow.wbs,
      cbs: selectedRow.cbs,
      phase: selectedRow.phase,
      manual: { pbs: draftPbs, sab: draftSab, cor: draftCor },
      source: 'manual',
    })
    const now = new Date().toISOString()
    dispatch({
      type: 'SET_COST_SHEET',
      payload: state.costSheetRows.map((row) =>
        row.id === selectedRow.id
          ? { ...row, sccs, lastModifiedBy: currentUser?.name ?? 'You', lastModifiedAt: now, isDirty: true }
          : row,
      ),
    })
  }

  function restoreAutomaticMapping() {
    if (!selectedRow || mappingDisabled) return
    const sccs = buildSccsAssignment({
      wbs: selectedRow.wbs,
      cbs: selectedRow.cbs,
      phase: selectedRow.phase,
      source: 'mapped',
    })
    const now = new Date().toISOString()
    dispatch({
      type: 'SET_COST_SHEET',
      payload: state.costSheetRows.map((row) =>
        row.id === selectedRow.id
          ? { ...row, sccs, lastModifiedBy: currentUser?.name ?? 'You', lastModifiedAt: now, isDirty: true }
          : row,
      ),
    })
  }

  return (
    <div className="view-stack sccs-view" data-testid="sccs-view">
      <div className="topbar">
        <div>
          <span className="eyebrow">{SCCS_STANDARD} · Standard Cost Coding System</span>
          <h1>SCCS structure</h1>
          <p className="muted">
            Three ISO facets — PBS ({codeCounts.pbs} codes), SAB ({codeCounts.sab} codes), COR ({codeCounts.cor} codes)
            — mapped from your project WBS, CBS, and phase. Project breakdowns stay unique; SCCS enables
            cross-operator benchmarking and data exchange.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => downloadText('sccs-cost-export.csv', exportSccsCsv(enrichedRows), 'text/csv')}
            data-testid="export-sccs-csv"
          >
            Export SCCS CSV
          </button>
          <button
            className="primary-button"
            disabled={mappingDisabled}
            type="button"
            onClick={reapplyMappings}
            data-testid="reapply-sccs"
          >
            Re-apply mappings
          </button>
        </div>
      </div>

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
        <div className="panel-header">
          <div>
            <span className="eyebrow">ISO 19008 SCCS</span>
            <h3>Mapping rules (project → ISO)</h3>
          </div>
        </div>
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

      <section className="panel" data-testid="sccs-manual-mapping">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Project overrides</span>
            <h3>Manual control-account mapping</h3>
          </div>
          <span className={`badge ${manualCount > 0 ? 'badge-watch' : 'badge-good'}`}>
            {manualCount} manual · {controlAccounts.length - manualCount} automatic
          </span>
        </div>
        <p className="muted">
          Select a control account, review the automatic match, and override any ISO facet. Manual assignments are
          preserved when automatic mappings are re-applied.
        </p>

        <div className="filter-bar sccs-mapping-filter">
          <label>
            <span>Search accounts</span>
            <input
              className="filter-input"
              onChange={(event) => setMappingSearch(event.target.value)}
              placeholder="WBS, CBS, description, SCCS…"
              type="search"
              value={mappingSearch}
            />
          </label>
          <label>
            <span>Mapping source</span>
            <select
              className="select-input"
              onChange={(event) => setMappingFilter(event.target.value as 'all' | 'mapped' | 'manual')}
              value={mappingFilter}
            >
              <option value="all">All mappings</option>
              <option value="mapped">Automatic</option>
              <option value="manual">Manual overrides</option>
            </select>
          </label>
        </div>

        <div className="sccs-override-layout">
          <div className="table-wrap">
            <table data-testid="sccs-mapping-accounts">
              <thead>
                <tr>
                  <th>Control account</th>
                  <th>CBS</th>
                  <th>SCCS</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <p className="empty-state">No control accounts match these filters.</p>
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((row) => {
                    const assignment = resolveSccsForCostRow(row)
                    return (
                      <tr className={selectedRow?.id === row.id ? 'selected-row' : ''} key={row.id}>
                        <td>
                          <strong>{row.wbs}</strong>
                          <small>{row.description}</small>
                        </td>
                        <td>{row.cbs}</td>
                        <td>
                          <code>{assignment.composite}</code>
                        </td>
                        <td>
                          <span className={`badge ${assignment.source === 'manual' ? 'badge-watch' : 'badge-good'}`}>
                            {assignment.source === 'manual' ? 'Manual' : 'Automatic'}
                          </span>
                        </td>
                        <td>
                          <button className="small-button secondary" onClick={() => setSelectedRowId(row.id)} type="button">
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {selectedRow && selectedAssignment && automaticForSelected && (
            <form
              className="sccs-override-editor"
              onSubmit={(event) => {
                event.preventDefault()
                saveManualMapping()
              }}
            >
              <div>
                <span className="eyebrow">Selected account</span>
                <h4>{selectedRow.wbs} · {selectedRow.description}</h4>
                <p className="muted">
                  Automatic suggestion: <code>{automaticForSelected.composite}</code>
                </p>
              </div>

              <label className="field">
                <span>PBS · Physical breakdown</span>
                <select
                  aria-label="Manual PBS code"
                  disabled={mappingDisabled}
                  onChange={(event) => setDraftPbs(event.target.value)}
                  value={draftPbs}
                >
                  {pbsCodes.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.code} — {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>SAB · Activity breakdown</span>
                <select
                  aria-label="Manual SAB code"
                  disabled={mappingDisabled}
                  onChange={(event) => setDraftSab(event.target.value)}
                  value={draftSab}
                >
                  {sabCodes.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.code} — {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>COR · Resource code</span>
                <select
                  aria-label="Manual COR code"
                  disabled={mappingDisabled}
                  onChange={(event) => setDraftCor(event.target.value)}
                  value={draftCor}
                >
                  {corCodes.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.code} — {entry.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mapping-preview">
                <span>Manual preview</span>
                <code>{draftPbs}.{draftSab}.{draftCor}</code>
                <small>Saved on this control account only.</small>
              </div>

              {mappingDisabled && (
                <p className="notice-card risk">
                  {periodLocked ? 'Unlock the reporting period before changing mappings.' : 'Your current role is read-only.'}
                </p>
              )}

              <div className="panel-actions">
                <button
                  className="primary-button"
                  disabled={mappingDisabled}
                  type="submit"
                  data-testid="save-manual-sccs"
                >
                  Save manual override
                </button>
                <button
                  className="ghost-button"
                  disabled={mappingDisabled || selectedAssignment.source !== 'manual'}
                  onClick={restoreAutomaticMapping}
                  type="button"
                >
                  Restore automatic
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Live rollup</span>
            <h3>Cost sheet by SCCS composite</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table data-testid="sccs-rollup-table">
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
        <div className="panel-header">
          <div>
            <span className="eyebrow">Control accounts</span>
            <h3>Cost sheet rows — resolved SCCS codes</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>CBS</th>
                <th>Phase</th>
                <th>Composite</th>
                <th>Source</th>
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
                      <td>{sccs.source === 'manual' ? 'Manual override' : 'Automatic'}</td>
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
          <div className="panel-header">
            <div>
              <span className="eyebrow">Ingestion queue</span>
              <h3>Extracted values with SCCS codes</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
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
