import { useEffect, useMemo, useState } from 'react'
import type { ForecastDriver } from '../data/forecastDrivers'
import type { OcrProviderCapability, OcrProviderId } from '../data/documentIntelligence'
import type { SourceDocument } from '../data/documentIntelligence'
import {
  fetchOcrProviders,
  fetchSourceDocuments,
  ingestSourceDocument,
} from '../api/client'
import { buildForecastDriverLedger, driverExpectedValue } from '../engine/forecastDrivers'
import { useProjectRole } from '../hooks/useProjectRole'
import { useProjectStore } from '../store/projectStore'
import type { CostRow } from '../data/costSheet'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    signDisplay: value === 0 ? 'never' : 'auto',
  }).format(value)
}

function DriverReviewCard({
  driver,
  controlAccounts,
}: {
  driver: ForecastDriver
  controlAccounts: CostRow[]
}) {
  const { dispatch, currentUser } = useProjectStore()
  const { canEdit, canApprove } = useProjectRole()
  const [draft, setDraft] = useState(driver)

  useEffect(() => setDraft(driver), [driver])

  const validRange = draft.lowUsd <= draft.mostLikelyUsd && draft.mostLikelyUsd <= draft.highUsd
  const canDecide = canApprove && driver.status === 'in_review' && driver.wbs.length > 0

  function saveReview() {
    dispatch({
      type: 'UPDATE_FORECAST_DRIVER',
      payload: {
        ...draft,
        status: draft.status === 'draft' ? 'in_review' : draft.status,
        reviewedBy: undefined,
        reviewedAt: undefined,
      },
    })
  }

  return (
    <article className="panel driver-review-card">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Document forecast driver · {Math.round(driver.confidence * 100)}% confidence</span>
          <h3>{driver.title}</h3>
        </div>
        <span className={`badge ${driver.status === 'approved' ? 'badge-good' : driver.status === 'rejected' ? 'badge-risk' : 'badge-watch'}`}>
          {driver.status.replace('_', ' ')}
        </span>
      </div>
      {driver.evidence && (
        <blockquote className="driver-evidence">
          “{driver.evidence.excerpt}”
          <small>{driver.evidence.fileName} · page {driver.evidence.page ?? '—'}</small>
        </blockquote>
      )}
      <div className="form-grid">
        <label className="field">
          <span>Control account WBS</span>
          <select
            disabled={!canEdit || driver.status === 'approved'}
            value={draft.wbs[0] ?? ''}
            onChange={(event) => setDraft({ ...draft, wbs: event.target.value ? [event.target.value] : [] })}
          >
            <option value="">Needs mapping</option>
            {controlAccounts.map((row) => (
              <option key={row.id} value={row.wbs}>{row.wbs} — {row.description}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Treatment</span>
          <select
            disabled={!canEdit || driver.status === 'approved'}
            value={draft.treatment}
            onChange={(event) => setDraft({ ...draft, treatment: event.target.value as ForecastDriver['treatment'] })}
          >
            <option value="deterministic">Deterministic</option>
            <option value="expected_value">Expected value</option>
            <option value="triangular">Triangular range</option>
            <option value="excluded">Exclude</option>
          </select>
        </label>
        <label className="field">
          <span>Direction</span>
          <select
            disabled={!canEdit || driver.status === 'approved'}
            value={draft.impactDirection}
            onChange={(event) => setDraft({ ...draft, impactDirection: event.target.value as 'cost' | 'saving' })}
          >
            <option value="cost">Cost increase</option>
            <option value="saving">Saving</option>
          </select>
        </label>
        {(['lowUsd', 'mostLikelyUsd', 'highUsd'] as const).map((field) => (
          <label className="field" key={field}>
            <span>{field === 'lowUsd' ? 'Low USD' : field === 'mostLikelyUsd' ? 'Most likely USD' : 'High USD'}</span>
            <input
              disabled={!canEdit || driver.status === 'approved'}
              min={0}
              type="number"
              value={draft[field]}
              onChange={(event) => setDraft({ ...draft, [field]: Number(event.target.value) })}
            />
          </label>
        ))}
        <label className="field">
          <span>Probability %</span>
          <input
            disabled={!canEdit || driver.status === 'approved'}
            min={0}
            max={100}
            type="number"
            value={Math.round(draft.probability * 100)}
            onChange={(event) => setDraft({ ...draft, probability: Number(event.target.value) / 100 })}
          />
        </label>
      </div>
      {!validRange && <p className="mapping-validation">Low must be ≤ most likely ≤ high.</p>}
      <div className="panel-actions">
        <button className="ghost-button" disabled={!canEdit || !validRange || driver.status === 'approved'} onClick={saveReview} type="button">
          Save review
        </button>
        <button
          className="primary-button"
          disabled={!canDecide || driver.status === 'approved'}
          onClick={() =>
            dispatch({
              type: 'DECIDE_FORECAST_DRIVER',
              payload: {
                driverId: driver.id,
                decision: 'approved',
                actor: currentUser?.name ?? 'Forecast approver',
                comment: 'Reviewed against source evidence.',
              },
            })
          }
          type="button"
        >
          Approve forecast impact
        </button>
        <button
          className="ghost-button"
          disabled={!canApprove || driver.status === 'rejected'}
          onClick={() =>
            dispatch({
              type: 'DECIDE_FORECAST_DRIVER',
              payload: {
                driverId: driver.id,
                decision: 'rejected',
                actor: currentUser?.name ?? 'Forecast approver',
                comment: 'Rejected during document review.',
              },
            })
          }
          type="button"
        >
          Reject
        </button>
      </div>
    </article>
  )
}

export function DocumentIntelligenceView() {
  const { state, dispatch, backendEnabled, currentUser } = useProjectStore()
  const { canEdit } = useProjectRole()
  const [providers, setProviders] = useState<OcrProviderCapability[]>([])
  const [provider, setProvider] = useState<OcrProviderId>('local')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [serverDocuments, setServerDocuments] = useState<SourceDocument[]>([])

  useEffect(() => {
    if (!backendEnabled) return
    void Promise.all([fetchOcrProviders(state.meta.id), fetchSourceDocuments(state.meta.id)])
      .then(([nextProviders, documents]) => {
        setProviders(nextProviders)
        setServerDocuments(documents)
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Document service unavailable'))
  }, [backendEnabled, state.meta.id])

  const controlAccounts = useMemo(
    () => state.costSheetRows.filter((row) => row.parentId === null).sort((a, b) => a.wbs.localeCompare(b.wbs)),
    [state.costSheetRows],
  )
  const ledger = useMemo(() => buildForecastDriverLedger(state), [state])
  const documentDrivers = state.forecastDrivers.filter((driver) => driver.sourceType === 'document')
  const documents = useMemo(() => {
    const merged = new Map(serverDocuments.map((document) => [document.id, document]))
    state.sourceDocuments.forEach((document) => merged.set(document.id, document))
    return [...merged.values()]
  }, [serverDocuments, state.sourceDocuments])
  const expectedExposure = ledger.reduce((sum, driver) => sum + driverExpectedValue(driver), 0)

  async function upload(file: File) {
    if (!canEdit || !backendEnabled) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await ingestSourceDocument(state.meta.id, file, provider)
      dispatch({
        type: 'IMPORT_DOCUMENT_DRAFTS',
        payload: { document: result.document, drivers: result.drivers },
      })
      setMessage(
        result.duplicate
          ? `Reused existing extraction for ${result.document.fileName}.`
          : `Extracted ${result.drivers.length} draft forecast driver(s) from ${result.document.fileName}.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Document extraction failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="view-stack" data-testid="document-intelligence-view">
      <div className="topbar">
        <div>
          <span className="eyebrow">Document-to-forecast intelligence</span>
          <h1>Private OCR and forecast drivers</h1>
          <p className="muted">
            Extract locally by default, review every quantified impact, and preserve page-level evidence. Nothing
            changes EAC until an authorised approver accepts a mapped driver.
          </p>
        </div>
      </div>

      <section className="panel split-panel">
        <div>
          <span className="eyebrow">Secure document ingestion</span>
          <h2>Upload contractor reports, claims, and forecast packs</h2>
          <p className="muted">
            Files are malware-scanned and encrypted at rest. Local extraction keeps content inside your environment;
            cloud providers are optional and must be explicitly configured.
          </p>
          <div className="form-grid">
            <label className="field">
              <span>OCR provider</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value as OcrProviderId)}>
                {(providers.length > 0
                  ? providers
                  : [{ id: 'local' as const, label: 'Privacy-first local processing', configured: true, privacy: 'local' as const, supportedMimeTypes: [] }]
                ).map((option) => (
                  <option key={option.id} value={option.id} disabled={!option.configured}>
                    {option.label} · {option.privacy}{option.configured ? '' : ' (not configured)'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="file-drop document-file-drop">
            <input
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.txt,.csv,application/pdf,image/png,image/jpeg,image/tiff,text/plain,text/csv"
              className="hidden-file"
              disabled={!backendEnabled || !canEdit || busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
                event.target.value = ''
              }}
              type="file"
            />
            <strong>{busy ? 'Extracting securely…' : 'Choose document'}</strong>
            <span>PDF, image, TIFF, text, or CSV · maximum 10 MB</span>
          </label>
          {message && <p className="upload-message">{message}</p>}
        </div>
        <div className="format-card">
          <h3>Governance boundary</h3>
          <ul>
            <li>Local provider is the default and sends no content to cloud services</li>
            <li>Raw files are encrypted; duplicate content is detected by SHA-256</li>
            <li>Extracted amounts are drafts with confidence and source evidence</li>
            <li>Cost-controller review and approver decision are separate actions</li>
          </ul>
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="Documents" value={String(documents.length)} detail="Encrypted source records" />
        <Metric label="Draft drivers" value={String(documentDrivers.filter((driver) => driver.status === 'draft' || driver.status === 'in_review').length)} detail="Awaiting review/approval" />
        <Metric label="Approved drivers" value={String(documentDrivers.filter((driver) => driver.status === 'approved').length)} detail="Included in forecast" />
        <Metric label="Ledger expected value" value={formatUsd(expectedExposure)} detail="Governed exposure across project registers" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Unified forecast-driver ledger</span>
            <h3>Changes, risks, opportunities, issues, claims, and documents</h3>
          </div>
          <span className="badge badge-good">{ledger.length} drivers</span>
        </div>
        <div className="table-wrap">
          <table data-testid="forecast-driver-ledger">
            <thead>
              <tr>
                <th>Source</th><th>Driver</th><th>Treatment</th><th>Status</th><th>WBS</th><th>Expected impact</th><th>Links</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((driver) => (
                <tr key={driver.id}>
                  <td>{driver.sourceType}</td>
                  <td><strong>{driver.title}</strong><small>{driver.rationale}</small></td>
                  <td>{driver.treatment.replace('_', ' ')}</td>
                  <td>{driver.status.replace('_', ' ')}</td>
                  <td>{driver.wbs.join(', ') || 'Project allocation'}</td>
                  <td className={driverExpectedValue(driver) > 0 ? 'metric-negative' : 'metric-positive'}>
                    {formatUsd(driverExpectedValue(driver))}
                  </td>
                  <td>{driver.linkedEntityIds.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="view-stack">
        {documentDrivers.length === 0 ? (
          <section className="panel"><p className="empty-state">No document forecast drivers have been extracted.</p></section>
        ) : (
          documentDrivers.map((driver) => (
            <DriverReviewCard key={driver.id} driver={driver} controlAccounts={controlAccounts} />
          ))
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
