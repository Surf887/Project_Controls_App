import { useEffect, useMemo, useState } from 'react'
import { fetchSnowflakeStatus, stageSnowflakeTransactions } from '../api/client'
import type { CostTransactionBatch } from '../data/costTransactions'
import { useProjectRole } from '../hooks/useProjectRole'
import { useProjectStore } from '../store/projectStore'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function SnowflakeSyncView() {
  const { state, dispatch, currentUser, backendEnabled } = useProjectStore()
  const { canEdit, canApprove } = useProjectRole()
  const [configured, setConfigured] = useState(false)
  const [authentication, setAuthentication] = useState('none')
  const profiles = state.mappingProfiles.filter(
    (profile) =>
      profile.status === 'active' &&
      profile.sourceType === 'snowflake' &&
      profile.targetDomain === 'cost_transaction',
  )
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [limit, setLimit] = useState(500)
  const [watermarkColumn, setWatermarkColumn] = useState('')
  const [afterWatermark, setAfterWatermark] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState(state.costTransactionBatches[0]?.id ?? '')

  useEffect(() => {
    if (!backendEnabled) return
    void fetchSnowflakeStatus(state.meta.id)
      .then((status) => {
        setConfigured(status.configured)
        setAuthentication(status.authentication)
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Snowflake status unavailable'))
  }, [backendEnabled, state.meta.id])

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id)
  }, [profileId, profiles])

  const selectedBatch =
    state.costTransactionBatches.find((batch) => batch.id === selectedBatchId) ??
    state.costTransactionBatches[0]
  const transactions = useMemo(
    () =>
      selectedBatch
        ? state.costTransactions.filter((transaction) => transaction.batchId === selectedBatch.id)
        : [],
    [selectedBatch, state.costTransactions],
  )
  const totals = transactions.reduce(
    (summary, transaction) => {
      summary[transaction.recordType] += transaction.amount
      return summary
    },
    { actual: 0, commitment: 0, accrual: 0, invoice: 0 },
  )
  const unresolved = transactions.filter(
    (transaction) => !transaction.duplicate && transaction.mappingStatus === 'unmapped',
  ).length
  const unsupportedCurrency = transactions.filter(
    (transaction) => !transaction.duplicate && transaction.currency !== 'USD',
  ).length

  async function stage() {
    if (!profileId || !canEdit) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await stageSnowflakeTransactions(state.meta.id, {
        profileId,
        limit,
        watermarkColumn: watermarkColumn || undefined,
        afterWatermark: afterWatermark || undefined,
      })
      dispatch({ type: 'IMPORT_COST_TRANSACTION_BATCH', payload: result })
      setSelectedBatchId(result.batch.id)
      setMessage(
        `Staged ${result.batch.rowCount} transaction(s): ${result.batch.mappedCount} mapped, ${result.batch.duplicateCount} duplicate, ${result.batch.errorCount} errors.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Snowflake staging failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="view-stack" data-testid="snowflake-sync-view">
      <div className="topbar">
        <div>
          <span className="eyebrow">SAP-derived cost data · Snowflake boundary</span>
          <h1>Snowflake cost reconciliation</h1>
          <p className="muted">
            Query a curated Snowflake view, apply the company’s dynamic mapping profile, deduplicate source IDs,
            reconcile WBS/CBS, and approve before posting actuals, commitments, invoices, or accruals.
          </p>
        </div>
        <span className={`badge ${configured ? 'badge-good' : 'badge-risk'}`}>
          {configured ? `Connected configuration · ${authentication}` : 'Snowflake not configured'}
        </span>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">Incremental staging</span><h3>Read-only Snowflake import</h3></div>
        </div>
        {!configured && (
          <p className="notice-card risk">
            Configure Snowflake account, user, warehouse, database, schema, role, and OAuth/key-pair credentials in
            the deployment secret manager.
          </p>
        )}
        <div className="form-grid">
          <label className="field">
            <span>Active cost mapping profile</span>
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
            <span>Maximum rows</span>
            <input min={1} max={1000} type="number" value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Watermark column (optional)</span>
            <input placeholder="LAST_UPDATED_AT" value={watermarkColumn} onChange={(event) => setWatermarkColumn(event.target.value)} />
          </label>
          <label className="field">
            <span>After watermark (optional)</span>
            <input placeholder="2026-08-01T00:00:00Z" value={afterWatermark} onChange={(event) => setAfterWatermark(event.target.value)} />
          </label>
        </div>
        <div className="panel-actions">
          <button className="primary-button" disabled={!configured || !profileId || !canEdit || busy} onClick={() => void stage()} type="button">
            {busy ? 'Querying Snowflake…' : 'Stage Snowflake rows'}
          </button>
        </div>
        {message && <p className="upload-message">{message}</p>}
      </section>

      <section className="metric-grid">
        <Metric label="Actuals" value={formatUsd(totals.actual)} detail="Staged journal/invoice actuals" />
        <Metric label="Commitments" value={formatUsd(totals.commitment)} detail="Staged PO commitments" />
        <Metric label="Accruals" value={formatUsd(totals.accrual)} detail="Staged month-end accruals" />
        <Metric label="Unmapped" value={String(unresolved)} detail={`${unsupportedCurrency} non-USD row(s) also blocked`} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Reconciliation batch</span>
            <h3>{selectedBatch ? `${selectedBatch.dataset} · ${selectedBatch.status}` : 'No staged batch'}</h3>
          </div>
          {selectedBatch && (
            <div className="panel-actions">
              <button
                className="primary-button"
                disabled={!canApprove || selectedBatch.status !== 'staged' || unresolved > 0 || unsupportedCurrency > 0 || selectedBatch.errorCount > 0}
                onClick={() =>
                  dispatch({
                    type: 'DECIDE_COST_TRANSACTION_BATCH',
                    payload: {
                      batchId: selectedBatch.id,
                      decision: 'approved',
                      actor: currentUser?.name ?? 'Cost approver',
                    },
                  })
                }
                type="button"
              >
                Approve batch
              </button>
              <button
                className="ghost-button"
                disabled={!canEdit || selectedBatch.status !== 'approved'}
                onClick={() =>
                  dispatch({
                    type: 'POST_COST_TRANSACTION_BATCH',
                    payload: { batchId: selectedBatch.id, actor: currentUser?.name ?? 'Cost controller' },
                  })
                }
                type="button"
              >
                Post to cost control
              </button>
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table data-testid="snowflake-transaction-table">
            <thead>
              <tr>
                <th>External ID</th><th>Type</th><th>Source WBS</th><th>Control account</th><th>Date / period</th><th>Amount</th><th>Reference</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={8}>No transactions in this batch.</td></tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td><strong>{transaction.externalId}</strong>{transaction.duplicate && <small>Duplicate — excluded</small>}</td>
                    <td>{transaction.recordType}</td>
                    <td>{transaction.sourceWbs}</td>
                    <td>
                      <select
                        className="select-input schedule-map-select"
                        disabled={!canEdit || transaction.status === 'posted' || transaction.duplicate}
                        value={transaction.mappingStatus === 'mapped' ? transaction.wbs : ''}
                        onChange={(event) => {
                          if (!event.target.value) return
                          dispatch({
                            type: 'UPDATE_COST_TRANSACTION_MAPPING',
                            payload: {
                              transactionId: transaction.id,
                              wbs: event.target.value,
                              actor: currentUser?.name ?? 'Cost controller',
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
                    <td>{transaction.postingDate}<small>{transaction.fiscalPeriod}</small></td>
                    <td>{formatUsd(transaction.amount)}<small>{transaction.currency}</small></td>
                    <td>{transaction.poNumber || transaction.vendor || '—'}</td>
                    <td>{transaction.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Batch lineage</span><h3>Snowflake import history</h3></div></div>
        <div className="report-list compact">
          {state.costTransactionBatches.length === 0 ? (
            <p className="empty-state">No Snowflake cost batches staged.</p>
          ) : (
            state.costTransactionBatches.map((batch: CostTransactionBatch) => (
              <button className="mapping-row" key={batch.id} onClick={() => setSelectedBatchId(batch.id)} type="button">
                <span><strong>{batch.dataset}</strong><small>{batch.importedAt} · profile v{batch.profileVersion} · {batch.watermark ?? 'full read'}</small></span>
                <b>{batch.rowCount} rows · {batch.status}</b>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>
}
