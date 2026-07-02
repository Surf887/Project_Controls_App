import { useMemo } from 'react'
import { BufferedNumberInput } from '../components/BufferedInput'
import {
  computeReserveSnapshots,
  totalContingencyExposure,
} from '../engine/contingency'
import { useProjectRole } from '../hooks/useProjectRole'
import { useProjectStore } from '../store/projectStore'
import type { ContingencyDrawRule } from '../store/types'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    signDisplay: value === 0 ? 'never' : 'auto',
  }).format(value)
}

export function ContingencyView() {
  const { state, dispatch } = useProjectStore()
  const { canEdit, canApprove } = useProjectRole()
  const rules = state.settings.contingencyRules

  const snapshots = useMemo(
    () => computeReserveSnapshots(state.costSheetRows, state.contingencyDraws),
    [state.contingencyDraws, state.costSheetRows],
  )

  const exposure = useMemo(
    () => totalContingencyExposure(state.contingencyDraws),
    [state.contingencyDraws],
  )

  function updateRules(patch: Partial<ContingencyDrawRule>) {
    dispatch({ type: 'SET_CONTINGENCY_RULES', payload: patch })
  }

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile
          label="Posted draws"
          value={formatUsd(exposure.posted)}
          detail="Approved changes charged to reserve WBS"
        />
        <MetricTile
          label="Pending draws"
          value={formatUsd(exposure.pending)}
          detail="Awaiting approval or posting"
          tone="watch"
        />
        <MetricTile
          label="Contingency remaining"
          value={formatUsd(
            snapshots.find((item) => item.reserveType === 'contingency')?.remaining ?? 0,
          )}
          detail="CN.00 uncommitted balance"
        />
        <MetricTile
          label="Management reserve remaining"
          value={formatUsd(
            snapshots.find((item) => item.reserveType === 'management_reserve')?.remaining ?? 0,
          )}
          detail="MR.00 uncommitted balance"
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Draw rules</span>
            <h3>Contingency engine configuration</h3>
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={!canEdit}
            title={canEdit ? undefined : 'Requires cost controller role'}
            onClick={() => dispatch({ type: 'RECONCILE_CONTINGENCY' })}
          >
            Reconcile now
          </button>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Auto-draw on approved change</span>
            <input
              type="checkbox"
              checked={rules.autoDrawOnApprovedChange}
              disabled={!canEdit}
              onChange={(event) => updateRules({ autoDrawOnApprovedChange: event.target.checked })}
            />
          </label>
          <label className="field">
            <span>Positive changes only</span>
            <input
              type="checkbox"
              checked={rules.drawPositiveChangesOnly}
              disabled={!canEdit}
              onChange={(event) => updateRules({ drawPositiveChangesOnly: event.target.checked })}
            />
          </label>
          <label className="field">
            <span>Max draw % of reserve</span>
            <BufferedNumberInput
              min={0}
              max={100}
              disabled={!canEdit}
              value={rules.maxDrawPctOfReserve}
              onCommit={(next) => updateRules({ maxDrawPctOfReserve: next })}
            />
          </label>
          <label className="field">
            <span>Route to MR above (USD)</span>
            <BufferedNumberInput
              min={0}
              step={100000}
              disabled={!canEdit}
              value={rules.requireManagementReserveForChangesOver}
              onCommit={(next) => updateRules({ requireManagementReserveForChangesOver: next })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Reserve ledger</span>
            <h3>WBS reserve balances</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WBS</th>
                <th>Reserve type</th>
                <th>Original budget</th>
                <th>Drawn</th>
                <th>Pending</th>
                <th>Remaining</th>
                <th>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((row) => (
                <tr key={row.wbs}>
                  <td><strong>{row.wbs}</strong></td>
                  <td>{row.reserveType === 'contingency' ? 'Contingency' : 'Management reserve'}</td>
                  <td>{formatUsd(row.originalBudget)}</td>
                  <td>{formatUsd(row.drawnToDate)}</td>
                  <td>{formatUsd(row.pendingDraw)}</td>
                  <td><strong>{formatUsd(row.remaining)}</strong></td>
                  <td>{row.utilizationPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Change linkage</span>
            <h3>Draw register</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Change</th>
                <th>Reserve</th>
                <th>Amount</th>
                <th>Drawn</th>
                <th>Status</th>
                <th>Target WBS</th>
                {canApprove && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {state.contingencyDraws.length === 0 && (
                <tr>
                  <td colSpan={canApprove ? 7 : 6}>No contingency draws recorded.</td>
                </tr>
              )}
              {state.contingencyDraws.map((draw) => (
                <tr key={draw.id}>
                  <td>
                    <strong>{draw.changeId}</strong>
                    <div className="muted">{draw.changeTitle}</div>
                  </td>
                  <td>{draw.reserveType === 'contingency' ? 'CN.00' : 'MR.00'}</td>
                  <td>{formatUsd(draw.amountUsd)}</td>
                  <td>{draw.drawnAt}</td>
                  <td><span className={`badge badge-${draw.status === 'posted' ? 'good' : 'watch'}`}>{draw.status}</span></td>
                  <td>{draw.wbsTarget ?? '—'}</td>
                  {canApprove && (
                    <td>
                      {draw.status === 'pending' && canEdit && (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() =>
                            dispatch({
                              type: 'SUBMIT_CONTINGENCY_DRAW',
                              payload: { drawId: draw.id, actor: 'Project Controls Manager' },
                            })
                          }
                        >
                          Submit
                        </button>
                      )}
                      {(draw.status === 'pending' || draw.status === 'submitted') && (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            dispatch({
                              type: 'APPROVE_CONTINGENCY_DRAW',
                              payload: { drawId: draw.id, actor: 'Project Director' },
                            })
                          }
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  )}
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
  tone?: 'default' | 'watch' | 'risk'
}) {
  const cls = ['metric-card', tone !== 'default' ? tone : ''].filter(Boolean).join(' ')
  return (
    <article className={cls}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
