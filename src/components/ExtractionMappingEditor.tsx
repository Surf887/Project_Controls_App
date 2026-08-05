import { useEffect, useMemo, useState } from 'react'
import type { CostRow } from '../data/costSheet'
import type { ExtractedValue } from '../data/projectData'
import { corCodes, pbsCodes, sabCodes } from '../data/sccs'
import type { SccsAssignment } from '../data/sccs'
import { buildSccsAssignment } from '../data/sccsMappings'
import { findOwningControlAccount } from '../engine/applyExtractionsCore'
import { resolveSccsForExtraction } from '../engine/sccs'

export interface ExtractionMappingDraft {
  targetWbs: string
  targetCbs: string
  manualSccs?: Pick<SccsAssignment, 'pbs' | 'sab' | 'cor'>
  applyToMatching: boolean
}

interface ExtractionMappingEditorProps {
  value: ExtractedValue
  costSheetRows: CostRow[]
  matchingCount: number
  disabled?: boolean
  disabledReason?: string
  onSave: (draft: ExtractionMappingDraft) => void
}

export function ExtractionMappingEditor({
  value,
  costSheetRows,
  matchingCount,
  disabled = false,
  disabledReason,
  onSave,
}: ExtractionMappingEditorProps) {
  const resolved = resolveSccsForExtraction(value)
  const [targetWbs, setTargetWbs] = useState(value.wbs)
  const [targetCbs, setTargetCbs] = useState(value.cbs)
  const [manualMode, setManualMode] = useState(value.sccs?.source === 'manual' || value.sccs?.source === 'import')
  const [pbs, setPbs] = useState(resolved.pbs)
  const [sab, setSab] = useState(resolved.sab)
  const [cor, setCor] = useState(resolved.cor)
  const [applyToMatching, setApplyToMatching] = useState(false)

  useEffect(() => {
    const next = resolveSccsForExtraction(value)
    setTargetWbs(value.wbs)
    setTargetCbs(value.cbs)
    setManualMode(value.sccs?.source === 'manual' || value.sccs?.source === 'import')
    setPbs(next.pbs)
    setSab(next.sab)
    setCor(next.cor)
    setApplyToMatching(false)
  }, [value])

  const controlAccounts = useMemo(
    () => costSheetRows.filter((row) => row.parentId === null).sort((a, b) => a.wbs.localeCompare(b.wbs)),
    [costSheetRows],
  )
  const targetAccount = findOwningControlAccount(costSheetRows, targetWbs.trim())
  const automatic = buildSccsAssignment({
    wbs: targetWbs.trim(),
    cbs: targetCbs.trim(),
    category: value.category,
  })
  const preview = manualMode ? `${pbs}.${sab}.${cor}` : automatic.composite
  const invalidMapping =
    !targetAccount ||
    targetCbs.trim().length === 0 ||
    /UNMAPPED/i.test(`${targetWbs} ${targetCbs}`)

  function changeTargetWbs(nextWbs: string) {
    setTargetWbs(nextWbs)
    const exact = controlAccounts.find((row) => row.wbs === nextWbs)
    if (exact) {
      setTargetCbs(exact.cbs)
    }
  }

  function enableManualMode(checked: boolean) {
    setManualMode(checked)
    if (checked) {
      setPbs(automatic.pbs)
      setSab(automatic.sab)
      setCor(automatic.cor)
    }
  }

  return (
    <form
      className="mapping-editor"
      data-testid="extraction-mapping-editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled || invalidMapping) return
        onSave({
          targetWbs: targetWbs.trim(),
          targetCbs: targetCbs.trim(),
          manualSccs: manualMode ? { pbs, sab, cor } : undefined,
          applyToMatching,
        })
      }}
    >
      <div className="mapping-editor-heading">
        <div>
          <span className="eyebrow">Manual mapping</span>
          <h3>Map source data to the control model</h3>
        </div>
        <span className={`badge ${manualMode ? 'badge-watch' : 'badge-good'}`}>
          {manualMode ? 'Manual SCCS' : 'Automatic SCCS'}
        </span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Target WBS</span>
          <input
            aria-label="Target WBS"
            disabled={disabled}
            list={`mapping-wbs-${value.id}`}
            onChange={(event) => changeTargetWbs(event.target.value)}
            type="text"
            value={targetWbs}
          />
          <datalist id={`mapping-wbs-${value.id}`}>
            {controlAccounts.map((row) => (
              <option key={row.id} value={row.wbs}>
                {row.description}
              </option>
            ))}
          </datalist>
          <small>{targetAccount ? targetAccount.description : 'Choose a WBS that resolves to a control account.'}</small>
        </label>

        <label className="field">
          <span>Target CBS</span>
          <input
            aria-label="Target CBS"
            disabled={disabled}
            list={`mapping-cbs-${value.id}`}
            onChange={(event) => setTargetCbs(event.target.value)}
            type="text"
            value={targetCbs}
          />
          <datalist id={`mapping-cbs-${value.id}`}>
            {[...new Set(controlAccounts.map((row) => row.cbs))].sort().map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
          <small>Defaults to the selected control account; a project-specific code can be entered.</small>
        </label>
      </div>

      <label className="mapping-mode-toggle">
        <input
          checked={manualMode}
          disabled={disabled}
          onChange={(event) => enableManualMode(event.target.checked)}
          type="checkbox"
        />
        <span>Override the automatically resolved ISO 19008 facets</span>
      </label>

      {manualMode && (
        <div className="form-grid mapping-facet-fields">
          <label className="field">
            <span>PBS · Physical</span>
            <select aria-label="PBS code" disabled={disabled} onChange={(event) => setPbs(event.target.value)} value={pbs}>
              {pbsCodes.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.code} — {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>SAB · Activity</span>
            <select aria-label="SAB code" disabled={disabled} onChange={(event) => setSab(event.target.value)} value={sab}>
              {sabCodes.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.code} — {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>COR · Resource</span>
            <select aria-label="COR code" disabled={disabled} onChange={(event) => setCor(event.target.value)} value={cor}>
              {corCodes.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.code} — {entry.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mapping-preview">
        <span>Resolved SCCS</span>
        <code>{preview}</code>
        <small>{manualMode ? 'Stored as a protected manual override.' : 'Updates automatically from WBS, CBS, and category.'}</small>
      </div>

      {matchingCount > 1 && (
        <label className="mapping-mode-toggle">
          <input
            checked={applyToMatching}
            disabled={disabled}
            onChange={(event) => setApplyToMatching(event.target.checked)}
            type="checkbox"
          />
          <span>Reuse this mapping for all {matchingCount} rows with the same source WBS/CBS in this report</span>
        </label>
      )}

      {disabled && disabledReason && <p className="notice-card risk">{disabledReason}</p>}
      {!disabled && invalidMapping && (
        <p className="mapping-validation" role="alert">
          Select a WBS that belongs to an existing control account and provide a valid CBS.
        </p>
      )}

      <div className="panel-actions">
        <button className="primary-button" disabled={disabled || invalidMapping} type="submit">
          Save {applyToMatching && matchingCount > 1 ? `${matchingCount} mappings` : 'mapping'}
        </button>
      </div>
    </form>
  )
}
