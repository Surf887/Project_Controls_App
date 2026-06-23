import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { projectIncurredTotals } from '../engine/incurredCost'
import { useProjectRole } from '../hooks/useProjectRole'
import {
  CURRENT_PERIOD_INDEX,
  PERIODS,
  buildRow,
  type CostRow,
} from '../data/costSheet'
import { syncCostSheetFromRegisters } from '../engine/costSheetSync'
import { rowCostMeta } from '../engine/costStructure'
import { resolveSccsForCostRow } from '../engine/sccs'
import { loadingMethodLabels, type LoadingMethod } from '../engine/loading'
import { useProjectStore } from '../store/projectStore'
import type { EacScenarioField } from '../engine/costSheetSync'
import type { ProjectPhase, ProjectSettings } from '../store/types'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt(value: number) {
  if (value === 0) return '–'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function parseInput(raw: string): number {
  // Accept: 1200000 | 1,200,000 | 1.2M | $1,200,000
  const s = raw.replace(/[$,\s]/g, '')
  const millions = /^([\d.]+)\s*[mM]$/.exec(s)
  if (millions) return parseFloat(millions[1]) * 1_000_000
  const thousands = /^([\d.]+)\s*[kK]$/.exec(s)
  if (thousands) return parseFloat(thousands[1]) * 1_000
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function recompute(row: CostRow): CostRow {
  const actualsToDate = row.periods.reduce((s, p) => s + p.actual, 0)
  const currentBudget = row.originalBudget + row.approvedChanges
  const ftc = row.eac - actualsToDate
  const vac = currentBudget - row.eac
  return { ...row, actualsToDate, currentBudget, ftc, vac }
}

function vacClass(vac: number) {
  if (vac < 0) return 'cs-neg'
  if (vac < 500_000) return 'cs-warn'
  return 'cs-pos'
}

// ─── Cell address ─────────────────────────────────────────────────────────────

type ColKey =
  | 'description'
  | 'cbs'
  | 'discipline'
  | 'originalBudget'
  | 'approvedChanges'
  | 'currentBudget'
  | 'commitments'
  | 'actualsToDate'
  | 'eac'
  | 'ftc'
  | 'vac'
  | { type: 'actual'; idx: number }
  | { type: 'forecast'; idx: number }
  | 'notes'

interface CellAddr {
  rowId: string
  col: ColKey
}

function colKey(col: ColKey): string {
  if (typeof col === 'string') return col
  return `${col.type}-${col.idx}`
}

function isEditable(row: CostRow, col: ColKey): boolean {
  if (typeof col === 'object') {
    if (col.type === 'actual') return !row.periods[col.idx].locked
    if (col.type === 'forecast') return col.idx >= CURRENT_PERIOD_INDEX
  }
  if (col === 'eac') return true
  if (col === 'originalBudget') return true
  if (col === 'approvedChanges') return true
  if (col === 'commitments') return true
  if (col === 'description') return true
  if (col === 'cbs') return true
  if (col === 'discipline') return true
  if (col === 'notes') return true
  return false // formula columns: currentBudget, actualsToDate, ftc, vac
}

// ─── Build flat visible rows ───────────────────────────────────────────────────

function visibleRows(rows: CostRow[]): CostRow[] {
  const expandedIds = new Set(rows.filter((r) => r.isExpanded).map((r) => r.id))

  return rows.filter((row) => {
    if (row.parentId === null) return true
    // walk up to see if all ancestors are expanded
    let pid: string | null = row.parentId
    while (pid !== null) {
      if (!expandedIds.has(pid)) return false
      const parent = rows.find((r) => r.id === pid)
      pid = parent?.parentId ?? null
    }
    return true
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CostSheetGrid({ phaseFilter }: { phaseFilter?: ProjectPhase } = {}) {
  const { state, dispatch } = useProjectStore()
  const { canEdit } = useProjectRole()
  const periodLocked = state.settings.reportingPeriod.locked
  const [rows, setRows] = useState<CostRow[]>(state.costSheetRows)
  const [active, setActive] = useState<CellAddr | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRows(state.costSheetRows)
    setDirtyIds(new Set())
    setSavedAt(null)
  }, [state.costSheetRows])

  const displayRows = useMemo(
    () => (phaseFilter ? rows.filter((row) => row.phase === phaseFilter) : rows),
    [phaseFilter, rows],
  )

  function recalculateFromRegisters() {
    const synced = syncCostSheetFromRegisters(
      rows,
      state.changes,
      state.risks,
      state.opportunities,
      {
        eacScenario: state.settings.eacScenario,
        loadingMethod: state.settings.loadingMethod,
        applyLoadingCurve: true,
        purchaseOrders: state.purchaseOrders,
        fxRates: state.fxRates,
        fxSettings: state.settings.fx,
      },
    )
    setRows(synced)
    dispatch({ type: 'SET_COST_SHEET', payload: synced })
    setSavedAt(new Date().toLocaleString())
  }

  function updateSetting<K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) {
    dispatch({ type: 'SET_SETTINGS', payload: { [key]: value } })
  }

  // All period cols + summary cols for keyboard navigation
  const allCols: ColKey[] = [
    'description', 'cbs', 'discipline',
    'originalBudget', 'approvedChanges', 'currentBudget',
    'commitments', 'actualsToDate',
    ...PERIODS.map((_, i): ColKey => ({ type: 'actual', idx: i })),
    'eac', 'ftc', 'vac',
    ...PERIODS.map((_, i): ColKey => ({ type: 'forecast', idx: i })),
    'notes',
  ]

  const visible = visibleRows(displayRows)

  // ── Focus input when edit starts ──────────────────────────────────────────
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing, active])

  // ── Commit current edit ───────────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    if (!active || !isEditing) return

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== active.rowId) return row

        const col = active.col
        let updated = { ...row, isDirty: true, lastModifiedBy: 'You', lastModifiedAt: new Date().toLocaleString() }

        if (typeof col === 'object') {
          const val = parseInput(editValue)
          const periods = updated.periods.map((p, i) => {
            if (col.type === 'actual' && i === col.idx) return { ...p, actual: val }
            if (col.type === 'forecast' && i === col.idx) return { ...p, forecast: val }
            return p
          })
          updated = recompute({ ...updated, periods })
        } else {
          switch (col) {
            case 'eac': updated = recompute({ ...updated, eac: parseInput(editValue) }); break
            case 'originalBudget': updated = recompute({ ...updated, originalBudget: parseInput(editValue) }); break
            case 'approvedChanges': updated = recompute({ ...updated, approvedChanges: parseInput(editValue) }); break
            case 'commitments': updated = recompute({ ...updated, commitments: parseInput(editValue) }); break
            case 'description': updated = { ...updated, description: editValue }; break
            case 'cbs': updated = { ...updated, cbs: editValue }; break
            case 'discipline': updated = { ...updated, discipline: editValue }; break
            case 'notes': updated = { ...updated, notes: editValue }; break
          }
        }

        return updated
      }),
    )

    setDirtyIds((prev) => new Set([...prev, active.rowId]))
    setIsEditing(false)
  }, [active, editValue, isEditing])

  // ── Navigate to adjacent editable cell ───────────────────────────────────
  const navigate = useCallback(
    (direction: 'right' | 'left' | 'down' | 'up') => {
      if (!active) return

      const rowIdx = visible.findIndex((r) => r.id === active.rowId)
      const colIdx = allCols.findIndex((c) => colKey(c) === colKey(active.col))

      let nextRow = rowIdx
      let nextCol = colIdx

      if (direction === 'right') nextCol++
      else if (direction === 'left') nextCol--
      else if (direction === 'down') nextRow++
      else nextRow--

      if (nextRow < 0 || nextRow >= visible.length) return
      if (nextCol < 0 || nextCol >= allCols.length) return

      setActive({ rowId: visible[nextRow].id, col: allCols[nextCol] })
      setIsEditing(false)
    },
    [active, allCols, visible],
  )

  // ── Keyboard handler on the grid container ────────────────────────────────
  function onGridKey(e: React.KeyboardEvent) {
    if (!active) return

    const row = rows.find((r) => r.id === active.rowId)
    if (!row) return

    if (isEditing) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); navigate('down') }
      if (e.key === 'Escape') { e.preventDefault(); setIsEditing(false) }
      if (e.key === 'Tab') { e.preventDefault(); commitEdit(); navigate(e.shiftKey ? 'left' : 'right') }
      return
    }

    if (e.key === 'Enter' || e.key === 'F2') {
      if (isEditable(row, active.col)) {
        e.preventDefault()
        startEdit(row, active.col)
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isEditable(row, active.col)) {
        e.preventDefault()
        setEditValue('')
        setIsEditing(true)
      }
    } else if (e.key === 'Tab') {
      e.preventDefault(); navigate(e.shiftKey ? 'left' : 'right')
    } else if (e.key === 'ArrowRight') { e.preventDefault(); navigate('right') }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navigate('left') }
    else if (e.key === 'ArrowDown') { e.preventDefault(); navigate('down') }
    else if (e.key === 'ArrowUp') { e.preventDefault(); navigate('up') }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      if (isEditable(row, active.col)) {
        setEditValue(e.key)
        setIsEditing(true)
      }
    }
  }

  function startEdit(row: CostRow, col: ColKey) {
    if (!isEditable(row, col)) return
    let initial = ''
    if (typeof col === 'object') {
      const p = row.periods[col.idx]
      initial = col.type === 'actual' ? String(p.actual) : String(p.forecast)
    } else {
      switch (col) {
        case 'eac': initial = String(row.eac); break
        case 'originalBudget': initial = String(row.originalBudget); break
        case 'approvedChanges': initial = String(row.approvedChanges); break
        case 'commitments': initial = String(row.commitments); break
        case 'description': initial = row.description; break
        case 'cbs': initial = row.cbs; break
        case 'discipline': initial = row.discipline; break
        case 'notes': initial = row.notes; break
      }
    }
    setActive({ rowId: row.id, col })
    setEditValue(initial)
    setIsEditing(true)
  }

  function toggleExpand(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isExpanded: !r.isExpanded } : r)))
  }

  function addRow() {
    const newId = `NEW-${Date.now()}`
    const newRow = buildRow({
      id: newId, parentId: null, level: 1,
      wbs: newId, cbs: '', description: 'New control account', discipline: '',
      costType: 'CAPEX', phase: 'Construction', currency: 'USD',
      originalBudget: 0, approvedChanges: 0,
      commitments: 0, eac: 0,
      periods: PERIODS.map((period, i) => ({ period, actual: 0, forecast: 0, locked: i < CURRENT_PERIOD_INDEX })),
      notes: '', lastModifiedBy: 'You', lastModifiedAt: new Date().toLocaleString(),
      isExpanded: false,
    })
    setRows((prev) => [...prev, { ...newRow, isDirty: true }])
    setDirtyIds((prev) => new Set([...prev, newId]))
    setActive({ rowId: newId, col: 'description' })
    setIsEditing(true)
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id && r.parentId !== id))
    setDirtyIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    if (active?.rowId === id) setActive(null)
  }

  function saveAll() {
    const cleaned = rows.map((r) => ({ ...r, isDirty: false }))
    const payload = phaseFilter
      ? state.costSheetRows.map((row) => cleaned.find((item) => item.id === row.id) ?? row)
      : cleaned
    setRows(payload)
    dispatch({ type: 'SET_COST_SHEET', payload })
    setDirtyIds(new Set())
    setSavedAt(new Date().toLocaleString())
  }

  function revertAll() {
    setRows(state.costSheetRows)
    setDirtyIds(new Set())
    setSavedAt(null)
    setActive(null)
    setIsEditing(false)
  }

  // ── Paste handler ─────────────────────────────────────────────────────────
  async function onPaste() {
    if (!active) return
    try {
      const text = await navigator.clipboard.readText()
      const values = text.split(/\t|\n/).map((v) => v.trim()).filter(Boolean)
      if (values.length === 0) return

      const colIdx = allCols.findIndex((c) => colKey(c) === colKey(active.col))
      const rowIdx = visible.findIndex((r) => r.id === active.rowId)

      const updates: { rowId: string; col: ColKey; value: string }[] = []
      values.forEach((val, i) => {
        const targetCol = allCols[colIdx + i]
        if (!targetCol || rowIdx >= visible.length) return
        const targetRow = visible[rowIdx]
        if (isEditable(targetRow, targetCol)) {
          updates.push({ rowId: targetRow.id, col: targetCol, value: val })
        }
      })

      if (updates.length === 0) return

      setRows((prev) =>
        prev.map((row) => {
          const rowUpdates = updates.filter((u) => u.rowId === row.id)
          if (rowUpdates.length === 0) return row
          let updated = { ...row, isDirty: true, lastModifiedBy: 'You', lastModifiedAt: new Date().toLocaleString() }
          rowUpdates.forEach(({ col, value }) => {
            if (typeof col === 'object') {
              const val = parseInput(value)
              updated = {
                ...updated,
                periods: updated.periods.map((p, i) => {
                  if (col.type === 'actual' && i === col.idx) return { ...p, actual: val }
                  if (col.type === 'forecast' && i === col.idx) return { ...p, forecast: val }
                  return p
                }),
              }
            } else if (col === 'eac') updated = { ...updated, eac: parseInput(value) }
            else if (col === 'description') updated = { ...updated, description: value }
            else if (col === 'notes') updated = { ...updated, notes: value }
          })
          return recompute(updated)
        }),
      )
      setDirtyIds((prev) => new Set([...prev, ...updates.map((u) => u.rowId)]))
    } catch { /* clipboard permission denied */ }
  }

  // ─── Totals row ──────────────────────────────────────────────────────────
  const topLevel = rows.filter((r) => r.parentId === null)
  const totals = {
    originalBudget: topLevel.reduce((s, r) => s + r.originalBudget, 0),
    approvedChanges: topLevel.reduce((s, r) => s + r.approvedChanges, 0),
    currentBudget: topLevel.reduce((s, r) => s + r.currentBudget, 0),
    commitments: topLevel.reduce((s, r) => s + r.commitments, 0),
    actualsToDate: topLevel.reduce((s, r) => s + r.actualsToDate, 0),
    incurred: projectIncurredTotals(rows, state.costAccruals).incurred,
    eac: topLevel.reduce((s, r) => s + r.eac, 0),
    ftc: topLevel.reduce((s, r) => s + r.ftc, 0),
    vac: topLevel.reduce((s, r) => s + r.vac, 0),
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="cs-shell">
      {/* Toolbar */}
      <div className="cs-toolbar">
        <div className="cs-toolbar-left">
          <span className="eyebrow">EcoSys-style cost sheet</span>
          <h2 className="cs-page-heading">Cost sheet</h2>
          <span className="cs-period-label">
            Open period: <strong>{state.settings.reportingPeriod.period}</strong>
            {periodLocked && <span className="badge badge-good"> Locked</span>}
          </span>
          {!canEdit && <span className="badge badge-watch">Read-only (viewer role)</span>}
          {dirtyIds.size > 0 && (
            <span className="cs-dirty-badge">{dirtyIds.size} unsaved row{dirtyIds.size > 1 ? 's' : ''}</span>
          )}
          {savedAt && <span className="cs-saved">Saved {savedAt}</span>}
        </div>
        <div className="cs-toolbar-right">
          <label className="filter-inline cs-toolbar-select">
            <span>EAC scenario</span>
            <select
              className="select-input compact-select"
              onChange={(event) => updateSetting('eacScenario', event.target.value as EacScenarioField)}
              value={state.settings.eacScenario}
            >
              <option value="eacBestCase">Best case</option>
              <option value="eacMostLikely">Most likely</option>
              <option value="eacWorstCase">Worst case</option>
            </select>
          </label>
          <label className="filter-inline cs-toolbar-select">
            <span>FTC loading</span>
            <select
              className="select-input compact-select"
              onChange={(event) => updateSetting('loadingMethod', event.target.value as LoadingMethod)}
              value={state.settings.loadingMethod}
            >
              {(Object.keys(loadingMethodLabels) as LoadingMethod[]).map((method) => (
                <option key={method} value={method}>{loadingMethodLabels[method]}</option>
              ))}
            </select>
          </label>
          <button className="ghost-button" onClick={() => dispatch({ type: 'SYNC_COMMITMENTS' })} type="button" disabled={!canEdit || periodLocked}>
            Sync commitments
          </button>
          <button className="ghost-button" onClick={recalculateFromRegisters} type="button" disabled={!canEdit || periodLocked}>Recalculate from registers</button>
          <button className="ghost-button" onClick={onPaste} type="button" title="Paste from clipboard (Tab-separated)" disabled={!canEdit || periodLocked}>Paste</button>
          <button className="ghost-button" onClick={addRow} type="button" disabled={!canEdit || periodLocked}>+ Add row</button>
          <button className="ghost-button" onClick={revertAll} type="button">Revert</button>
          <button className="primary-button" disabled={dirtyIds.size === 0} onClick={saveAll} type="button">Save changes</button>
        </div>
      </div>

      {/* Mobile note — the full grid is a desktop/tablet workbench */}
      <p className="cs-mobile-note">
        The full cost sheet is a desktop/tablet workbench. On a phone, use the <strong>Close</strong>, <strong>Changes</strong>,
        and <strong>Forecast</strong> tabs for close status, approvals, and exceptions.
      </p>

      {/* Keyboard hint */}
      <p className="cs-hint">Click a cell to select · Enter / F2 to edit · Tab / Shift+Tab to navigate · Esc to cancel · Arrow keys to move</p>

      {/* Grid */}
      <div
        className="cs-grid-wrap"
        onKeyDown={onGridKey}
        tabIndex={0}
        role="grid"
        aria-label="Cost sheet"
      >
        <table className="cs-table">
          <thead>
            {/* Group header row */}
            <tr className="cs-group-row">
              <th colSpan={6} className="cs-th-group cs-sticky-col">WBS / Description</th>
              <th colSpan={3} className="cs-th-group cs-col-budget">Budget</th>
              <th colSpan={2} className="cs-th-group cs-col-actuals">Committed / Actuals</th>
              {PERIODS.map((p, i) => (
                <th key={p} className={`cs-th-group ${i < CURRENT_PERIOD_INDEX ? 'cs-col-locked' : i === CURRENT_PERIOD_INDEX ? 'cs-col-current' : 'cs-col-future'}`}>
                  {p}
                </th>
              ))}
              <th colSpan={3} className="cs-th-group cs-col-forecast">Forecast</th>
              {PERIODS.map((p) => (
                <th key={`f-${p}`} className="cs-th-group cs-col-future">{p}</th>
              ))}
              <th className="cs-th-group">Notes</th>
              <th className="cs-th-group"></th>
            </tr>
            {/* Column header row */}
            <tr className="cs-header-row">
              <th className="cs-th cs-sticky-col cs-col-wbs">WBS</th>
              <th className="cs-th cs-sticky-col cs-col-desc">Description</th>
              <th className="cs-th">CBS</th>
              <th className="cs-th">Discipline</th>
              <th className="cs-th">Cost type</th>
              <th className="cs-th">Phase</th>
              <th className="cs-th">SCCS</th>
              <th className="cs-th">Nature</th>
              <th className="cs-th">TEC</th>
              <th className="cs-th cs-num">Orig. Budget</th>
              <th className="cs-th cs-num">Appvd Changes</th>
              <th className="cs-th cs-num">Curr. Budget</th>
              <th className="cs-th cs-num">Commitments</th>
              <th className="cs-th cs-num">ATD Actuals</th>
              {PERIODS.map((p) => <th key={p} className="cs-th cs-num cs-period-col">{p}</th>)}
              <th className="cs-th cs-num cs-eac">EAC</th>
              <th className="cs-th cs-num">FTC</th>
              <th className="cs-th cs-num">VAC</th>
              {PERIODS.map((p) => <th key={`f-${p}`} className="cs-th cs-num cs-period-col">Fcst {p}</th>)}
              <th className="cs-th cs-col-notes">Notes</th>
              <th className="cs-th"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const hasChildren = rows.some((r) => r.parentId === row.id)
              const isControlAccount = row.level === 1

              return (
                <tr
                  key={row.id}
                  className={[
                    'cs-row',
                    isControlAccount ? 'cs-row-ca' : 'cs-row-wp',
                    row.isDirty ? 'cs-row-dirty' : '',
                  ].join(' ')}
                >
                  {/* WBS */}
                  <td className="cs-td cs-sticky-col cs-col-wbs">
                    <div className="cs-wbs-cell" style={{ paddingLeft: `${(row.level - 1) * 18 + 6}px` }}>
                      {hasChildren && (
                        <button
                          className="cs-expand-btn"
                          onClick={() => toggleExpand(row.id)}
                          type="button"
                          aria-label={row.isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {row.isExpanded ? '▼' : '▶'}
                        </button>
                      )}
                      <span className="cs-wbs-code">{row.wbs}</span>
                    </div>
                  </td>

                  {/* Editable cells */}
                  {(['description', 'cbs', 'discipline'] as const).map((col) => (
                    <EditCell
                      key={col}
                      value={col === 'description' ? row.description : col === 'cbs' ? row.cbs : row.discipline}
                      isActive={active?.rowId === row.id && colKey(active.col) === col}
                      isEditing={active?.rowId === row.id && colKey(active.col) === col && isEditing}
                      editable={true}
                      editValue={editValue}
                      inputRef={active?.rowId === row.id && colKey(active.col) === col ? inputRef : null}
                      onActivate={() => { setActive({ rowId: row.id, col }); setIsEditing(false) }}
                      onDblClick={() => startEdit(row, col)}
                      onEditChange={setEditValue}
                      onCommit={commitEdit}
                      className={col === 'description' ? 'cs-sticky-col cs-col-desc' : ''}
                    />
                  ))}
                  <td className="cs-td">{row.costType}</td>
                  <td className="cs-td">{row.phase}</td>
                  <td className="cs-td cs-sccs-cell" title={resolveSccsForCostRow(row).composite}>
                    {row.parentId === null ? (
                      <code className="sccs-inline-code">{resolveSccsForCostRow(row).composite}</code>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="cs-td">{rowCostMeta(row, state.cbsNodes).costNature}</td>
                  <td className="cs-td">{rowCostMeta(row, state.cbsNodes).tecCategory}</td>

                  {/* Budget columns */}
                  <EditCell
                    value={fmt(row.originalBudget)}
                    isActive={active?.rowId === row.id && colKey(active.col) === 'originalBudget'}
                    isEditing={active?.rowId === row.id && colKey(active.col) === 'originalBudget' && isEditing}
                    editable={true}
                    editValue={editValue}
                    inputRef={active?.rowId === row.id && colKey(active.col) === 'originalBudget' ? inputRef : null}
                    onActivate={() => { setActive({ rowId: row.id, col: 'originalBudget' }); setIsEditing(false) }}
                    onDblClick={() => startEdit(row, 'originalBudget')}
                    onEditChange={setEditValue}
                    onCommit={commitEdit}
                    numeric
                  />
                  <EditCell
                    value={fmt(row.approvedChanges)}
                    isActive={active?.rowId === row.id && colKey(active.col) === 'approvedChanges'}
                    isEditing={false}
                    editable={false}
                    editValue={editValue}
                    inputRef={null}
                    onActivate={() => {}}
                    onDblClick={() => {}}
                    onEditChange={setEditValue}
                    onCommit={commitEdit}
                    numeric
                  />
                  <td className="cs-td cs-num cs-formula">{fmt(row.currentBudget)}</td>
                  <EditCell
                    value={fmt(row.commitments)}
                    isActive={active?.rowId === row.id && colKey(active.col) === 'commitments'}
                    isEditing={active?.rowId === row.id && colKey(active.col) === 'commitments' && isEditing}
                    editable={true}
                    editValue={editValue}
                    inputRef={active?.rowId === row.id && colKey(active.col) === 'commitments' ? inputRef : null}
                    onActivate={() => { setActive({ rowId: row.id, col: 'commitments' }); setIsEditing(false) }}
                    onDblClick={() => startEdit(row, 'commitments')}
                    onEditChange={setEditValue}
                    onCommit={commitEdit}
                    numeric
                  />
                  <td className="cs-td cs-num cs-formula">{fmt(row.actualsToDate)}</td>

                  {/* Period actual columns */}
                  {row.periods.map((p, i) => {
                    const col: ColKey = { type: 'actual', idx: i }
                    const ck = colKey(col)
                    const locked = p.locked
                    return (
                      <EditCell
                        key={ck}
                        value={fmt(p.actual)}
                        isActive={active?.rowId === row.id && colKey(active.col) === ck}
                        isEditing={active?.rowId === row.id && colKey(active.col) === ck && isEditing}
                        editable={!locked}
                        locked={locked}
                        editValue={editValue}
                        inputRef={active?.rowId === row.id && colKey(active.col) === ck ? inputRef : null}
                        onActivate={() => { setActive({ rowId: row.id, col }); setIsEditing(false) }}
                        onDblClick={() => !locked && startEdit(row, col)}
                        onEditChange={setEditValue}
                        onCommit={commitEdit}
                        numeric
                        isCurrent={i === CURRENT_PERIOD_INDEX}
                      />
                    )
                  })}

                  {/* EAC (editable) */}
                  <EditCell
                    value={fmt(row.eac)}
                    isActive={active?.rowId === row.id && colKey(active.col) === 'eac'}
                    isEditing={active?.rowId === row.id && colKey(active.col) === 'eac' && isEditing}
                    editable={true}
                    editValue={editValue}
                    inputRef={active?.rowId === row.id && colKey(active.col) === 'eac' ? inputRef : null}
                    onActivate={() => { setActive({ rowId: row.id, col: 'eac' }); setIsEditing(false) }}
                    onDblClick={() => startEdit(row, 'eac')}
                    onEditChange={setEditValue}
                    onCommit={commitEdit}
                    numeric
                    className="cs-eac"
                  />

                  {/* FTC / VAC (formula) */}
                  <td className="cs-td cs-num cs-formula">{fmt(row.ftc)}</td>
                  <td className={`cs-td cs-num cs-formula ${vacClass(row.vac)}`}>{fmt(row.vac)}</td>

                  {/* Period forecast columns */}
                  {row.periods.map((p, i) => {
                    const col: ColKey = { type: 'forecast', idx: i }
                    const ck = colKey(col)
                    const locked = i < CURRENT_PERIOD_INDEX
                    return (
                      <EditCell
                        key={`f-${ck}`}
                        value={fmt(p.forecast)}
                        isActive={active?.rowId === row.id && colKey(active.col) === ck}
                        isEditing={active?.rowId === row.id && colKey(active.col) === ck && isEditing}
                        editable={!locked}
                        locked={locked}
                        editValue={editValue}
                        inputRef={active?.rowId === row.id && colKey(active.col) === ck ? inputRef : null}
                        onActivate={() => { setActive({ rowId: row.id, col }); setIsEditing(false) }}
                        onDblClick={() => !locked && startEdit(row, col)}
                        onEditChange={setEditValue}
                        onCommit={commitEdit}
                        numeric
                      />
                    )
                  })}

                  {/* Notes */}
                  <EditCell
                    value={row.notes}
                    isActive={active?.rowId === row.id && colKey(active.col) === 'notes'}
                    isEditing={active?.rowId === row.id && colKey(active.col) === 'notes' && isEditing}
                    editable={true}
                    editValue={editValue}
                    inputRef={active?.rowId === row.id && colKey(active.col) === 'notes' ? inputRef : null}
                    onActivate={() => { setActive({ rowId: row.id, col: 'notes' }); setIsEditing(false) }}
                    onDblClick={() => startEdit(row, 'notes')}
                    onEditChange={setEditValue}
                    onCommit={commitEdit}
                    className="cs-col-notes"
                  />

                  {/* Delete */}
                  <td className="cs-td cs-action-col">
                    <button
                      className="cs-delete-btn"
                      onClick={() => deleteRow(row.id)}
                      type="button"
                      title="Delete row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}

            {/* Totals row */}
            <tr className="cs-totals-row">
              <td className="cs-td cs-sticky-col cs-col-wbs cs-total-label" colSpan={4}>Project total</td>
              <td className="cs-td cs-num cs-total">{fmt(totals.originalBudget)}</td>
              <td className="cs-td cs-num cs-total">{fmt(totals.approvedChanges)}</td>
              <td className="cs-td cs-num cs-total">{fmt(totals.currentBudget)}</td>
              <td className="cs-td cs-num cs-total">{fmt(totals.commitments)}</td>
              <td className="cs-td cs-num cs-total">{fmt(totals.actualsToDate)}</td>
              {PERIODS.map((p) => <td key={p} className="cs-td cs-num cs-total">–</td>)}
              <td className={`cs-td cs-num cs-total cs-eac ${vacClass(totals.vac)}`}>{fmt(totals.eac)}</td>
              <td className="cs-td cs-num cs-total">{fmt(totals.ftc)}</td>
              <td className={`cs-td cs-num cs-total ${vacClass(totals.vac)}`}>{fmt(totals.vac)}</td>
              {PERIODS.map((p) => <td key={`f-${p}`} className="cs-td cs-num cs-total">–</td>)}
              <td className="cs-td cs-col-notes cs-total"></td>
              <td className="cs-td cs-action-col"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Audit footer for selected row */}
      {active && (() => {
        const row = rows.find((r) => r.id === active.rowId)
        if (!row || !row.lastModifiedBy) return null
        return (
          <div className="cs-audit-bar">
            <span>Last edit: <strong>{row.lastModifiedBy}</strong></span>
            <span>{row.lastModifiedAt}</span>
            {row.isDirty && <span className="cs-dirty-badge">Unsaved</span>}
          </div>
        )
      })()}
    </div>
  )
}

// ─── Reusable editable cell ───────────────────────────────────────────────────

interface EditCellProps {
  value: string
  isActive: boolean
  isEditing: boolean
  editable: boolean
  locked?: boolean
  isCurrent?: boolean
  editValue: string
  inputRef: React.RefObject<HTMLInputElement | null> | null
  onActivate: () => void
  onDblClick: () => void
  onEditChange: (v: string) => void
  onCommit: () => void
  numeric?: boolean
  className?: string
}

function EditCell({
  value, isActive, isEditing, editable, locked = false, isCurrent = false,
  editValue, inputRef, onActivate, onDblClick, onEditChange, onCommit, numeric, className = '',
}: EditCellProps) {
  const classes = [
    'cs-td',
    numeric ? 'cs-num' : '',
    locked ? 'cs-locked' : editable ? 'cs-editable' : 'cs-formula',
    isCurrent ? 'cs-current-period' : '',
    isActive ? 'cs-active' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <td
      className={classes}
      onClick={onActivate}
      onDoubleClick={onDblClick}
    >
      {isEditing ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement | null>}
          className="cs-cell-input"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onCommit}
          type="text"
          autoComplete="off"
        />
      ) : (
        <span className="cs-cell-display">{value}</span>
      )}
    </td>
  )
}
