import { useEffect, useMemo, useState } from 'react'
import { fetchPlanviewStatus, stagePlanviewItems } from '../api/client'
import { useProjectRole } from '../hooks/useProjectRole'
import { useProjectStore } from '../store/projectStore'

export function PlanviewSyncView() {
  const { state, dispatch, currentUser, backendEnabled } = useProjectStore()
  const { canEdit, canApprove } = useProjectRole()
  const profiles = state.mappingProfiles.filter(
    (profile) =>
      profile.status === 'active' &&
      profile.sourceType === 'api' &&
      profile.targetDomain === 'project_governance',
  )
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [configured, setConfigured] = useState(false)
  const [product, setProduct] = useState('generic')
  const [authentication, setAuthentication] = useState('none')
  const [limit, setLimit] = useState(500)
  const [cursor, setCursor] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState(state.planviewSyncBatches[0]?.id ?? '')

  useEffect(() => {
    if (!backendEnabled) return
    void fetchPlanviewStatus(state.meta.id)
      .then((status) => {
        setConfigured(status.configured)
        setProduct(status.product)
        setAuthentication(status.authentication)
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Planview status unavailable'))
  }, [backendEnabled, state.meta.id])

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id)
  }, [profileId, profiles])

  const batch =
    state.planviewSyncBatches.find((entry) => entry.id === selectedBatchId) ??
    state.planviewSyncBatches[0]
  const items = useMemo(
    () => (batch ? state.planviewItems.filter((item) => item.batchId === batch.id) : []),
    [batch, state.planviewItems],
  )
  const counts = items.reduce(
    (summary, item) => {
      summary[item.itemType] += 1
      return summary
    },
    { milestone: 0, action: 0, issue: 0, decision: 0 },
  )
  const unresolved = items.filter((item) => !item.duplicate && item.mappingStatus === 'unmapped').length

  async function stage() {
    if (!profileId || !canEdit) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await stagePlanviewItems(state.meta.id, {
        profileId,
        limit,
        cursor: cursor || undefined,
      })
      dispatch({ type: 'IMPORT_PLANVIEW_BATCH', payload: result })
      setSelectedBatchId(result.batch.id)
      if (result.batch.cursor) setCursor(result.batch.cursor)
      setMessage(
        `Staged ${result.batch.rowCount} Planview item(s): ${result.batch.mappedCount} mapped, ${result.batch.duplicateCount} duplicate, ${result.batch.errorCount} errors.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Planview staging failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="view-stack" data-testid="planview-sync-view">
      <div className="topbar">
        <div>
          <span className="eyebrow">Project governance integration</span>
          <h1>Planview milestones and controls</h1>
          <p className="muted">
            Map the selected Planview product’s API response into milestones, actions, issues, and decisions, review
            duplicates/WBS links, and approve before adding records to project controls.
          </p>
        </div>
        <span className={`badge ${configured ? 'badge-good' : 'badge-risk'}`}>
          {configured ? `${product} · ${authentication}` : 'Planview not configured'}
        </span>
      </div>

      <section className="panel">
        {!configured && (
          <p className="notice-card risk">
            Configure the Planview base URL and OAuth/API credentials. Mapping profiles handle product- and
            company-specific response fields.
          </p>
        )}
        <div className="form-grid">
          <label className="field">
            <span>Active Planview mapping profile</span>
            <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              <option value="">Select profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.organization} · {profile.name} v{profile.version} · {profile.dataset}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Maximum items</span>
            <input min={1} max={1000} type="number" value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Paging cursor / offset</span>
            <input value={cursor} onChange={(event) => setCursor(event.target.value)} />
          </label>
        </div>
        <div className="panel-actions">
          <button className="primary-button" disabled={!configured || !profileId || !canEdit || busy} onClick={() => void stage()} type="button">
            {busy ? 'Querying Planview…' : 'Stage Planview items'}
          </button>
        </div>
        {message && <p className="upload-message">{message}</p>}
      </section>

      <section className="metric-grid">
        <Metric label="Milestones" value={String(counts.milestone)} detail="Posted into integrated schedule" />
        <Metric label="Actions" value={String(counts.action)} detail="Project action register" />
        <Metric label="Issues" value={String(counts.issue)} detail="Cost/schedule issue register" />
        <Metric label="Decisions" value={String(counts.decision)} detail={`${unresolved} unresolved WBS mapping(s)`} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">Governance staging batch</span><h3>{batch ? `${batch.dataset} · ${batch.status}` : 'No staged batch'}</h3></div>
          {batch && (
            <div className="panel-actions">
              <button
                className="primary-button"
                disabled={!canApprove || batch.status !== 'staged' || unresolved > 0 || batch.errorCount > 0}
                onClick={() =>
                  dispatch({
                    type: 'DECIDE_PLANVIEW_BATCH',
                    payload: { batchId: batch.id, decision: 'approved', actor: currentUser?.name ?? 'Approver' },
                  })
                }
                type="button"
              >
                Approve batch
              </button>
              <button
                className="ghost-button"
                disabled={!canEdit || batch.status !== 'approved'}
                onClick={() =>
                  dispatch({
                    type: 'POST_PLANVIEW_BATCH',
                    payload: { batchId: batch.id, actor: currentUser?.name ?? 'Controller' },
                  })
                }
                type="button"
              >
                Post to project controls
              </button>
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table data-testid="planview-item-table">
            <thead>
              <tr><th>ID / type</th><th>Title</th><th>Owner / status</th><th>Due / progress</th><th>WBS mapping</th><th>Impact</th><th>State</th></tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7}>No items in this batch.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.externalId}</strong><small>{item.itemType}{item.duplicate ? ' · duplicate' : ''}</small></td>
                    <td>{item.title}<small>{item.description}</small></td>
                    <td>{item.owner}<small>{item.sourceStatus}</small></td>
                    <td>{item.dueDate}<small>{item.progressPercent}%</small></td>
                    <td>
                      <select
                        className="select-input schedule-map-select"
                        disabled={!canEdit || item.status === 'posted' || item.duplicate}
                        value={item.mappingStatus === 'mapped' ? item.wbs : ''}
                        onChange={(event) => {
                          if (!event.target.value) return
                          dispatch({
                            type: 'UPDATE_PLANVIEW_ITEM_MAPPING',
                            payload: {
                              itemId: item.id,
                              wbs: event.target.value,
                              actor: currentUser?.name ?? 'Controller',
                            },
                          })
                        }}
                      >
                        <option value="">Needs mapping</option>
                        {state.costSheetRows.filter((row) => row.parentId === null).map((row) => (
                          <option key={row.id} value={row.wbs}>{row.wbs} — {row.description}</option>
                        ))}
                      </select>
                    </td>
                    <td>{formatImpact(item.costImpactUsd)}<small>{item.scheduleImpactDays} days</small></td>
                    <td>{item.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Planview lineage</span><h3>Sync batches</h3></div></div>
        <div className="report-list compact">
          {state.planviewSyncBatches.length === 0 ? (
            <p className="empty-state">No Planview batches staged.</p>
          ) : (
            state.planviewSyncBatches.map((entry) => (
              <button className="mapping-row" key={entry.id} onClick={() => setSelectedBatchId(entry.id)} type="button">
                <span><strong>{entry.dataset}</strong><small>{entry.importedAt} · profile v{entry.profileVersion} · cursor {entry.cursor ?? 'start'}</small></span>
                <b>{entry.rowCount} items · {entry.status}</b>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function formatImpact(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>
}
