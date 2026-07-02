import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { sumBac, sumCostSheetMetric } from '../engine/costAggregation'
import { fetchClosePack, downloadClosePackPdf } from '../api/client'
import { useProjectStore } from '../store/projectStore'
import { MonthlyCloseRedirectNote } from './monthlyClose'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Escape user/state-derived values before interpolating them into the raw HTML
 * string we hand to a new window via document.write. Without this, a project
 * name or period containing markup (e.g. `<script>`) would be executed in the
 * print window's context.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

function printHtmlPack(title: string, html: string) {
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) {
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}

export function ExportCentreView() {
  const { state, backendEnabled } = useProjectStore()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const summary = useMemo(
    () => ({
      bac: sumBac(state.costSheetRows),
      actuals: sumCostSheetMetric(state.costSheetRows, 'actualsToDate'),
      eac: sumCostSheetMetric(state.costSheetRows, 'eac'),
      period: state.meta.baselineLabel,
    }),
    [state.costSheetRows, state.meta.baselineLabel],
  )

  function exportCostSheetCsv() {
    const header = ['WBS', 'Description', 'Original', 'Approved', 'Current', 'Actuals', 'EAC']
    const lines = state.costSheetRows
      .filter((row) => row.parentId === null)
      .map((row) =>
        [row.wbs, row.description, row.originalBudget, row.approvedChanges, row.currentBudget, row.actualsToDate, row.eac]
          .map(String)
          .join(','),
      )
    downloadText(`cost-sheet-${state.meta.id}.csv`, [header.join(','), ...lines].join('\n'), 'text/csv')
  }

  async function downloadServerClosePack() {
    if (!backendEnabled) {
      setMessage('Connect to API for full leadership close pack.')
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const pack = await fetchClosePack(state.meta.id)
      pack.files.forEach((file) => downloadText(file.name, file.content, file.mimeType))
      setMessage(`Downloaded ${pack.files.length} files from server close pack.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Close pack download failed')
    } finally {
      setLoading(false)
    }
  }

  function printLeadershipSummary() {
    const html = `<!DOCTYPE html><html><head><title>Close Summary</title>
      <style>
        body { font-family: Georgia, serif; max-width: 720px; margin: 2rem auto; color: #111; }
        h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
        .meta { color: #555; margin-bottom: 1.5rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        td, th { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
        th { background: #f4f4f4; }
        footer { margin-top: 2rem; font-size: 0.85rem; color: #666; }
      </style></head><body>
      <h1>${escapeHtml(state.meta.name)} — Monthly Close Summary</h1>
      <p class="meta">Period: ${escapeHtml(summary.period)} · Generated ${escapeHtml(new Date().toLocaleString())}</p>
      <table>
        <tr><th>Metric</th><th>Value (control accounts)</th></tr>
        <tr><td>BAC</td><td>${formatUsd(summary.bac)}</td></tr>
        <tr><td>Actuals</td><td>${formatUsd(summary.actuals)}</td></tr>
        <tr><td>EAC</td><td>${formatUsd(summary.eac)}</td></tr>
        <tr><td>VAC</td><td>${formatUsd(summary.bac - summary.eac)}</td></tr>
      </table>
      <footer>Financial grain: control accounts only. Immutable audit trail on server.</footer>
      </body></html>`
    printHtmlPack('Close Summary', html)
  }

  async function downloadServerPdf() {
    if (!backendEnabled) {
      setMessage('Connect to API for server PDF export.')
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const blob = await downloadClosePackPdf(state.meta.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `close-pack-${state.meta.id}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      setMessage('Downloaded server PDF close pack.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PDF download failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="view-stack" data-testid="export-centre">
      <MonthlyCloseRedirectNote />
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Reporting</span>
            <h3>Leadership close pack</h3>
          </div>
        </div>
        <p className="muted">Trusted packs for project director sign-off — server-generated when API connected.</p>
        <div className="panel-actions">
          <button className="primary-button" type="button" onClick={() => void downloadServerClosePack()} disabled={loading} data-testid="export-close-pack">
            {loading ? 'Generating…' : 'Download full close pack'}
          </button>
          <button className="ghost-button" type="button" onClick={printLeadershipSummary} data-testid="export-close-summary">
            Print PDF summary
          </button>
          {backendEnabled && (
            <button className="ghost-button" type="button" onClick={() => void downloadServerPdf()} disabled={loading} data-testid="export-close-pdf">
              Download server PDF
            </button>
          )}
          <button className="ghost-button" type="button" onClick={exportCostSheetCsv} data-testid="export-cost-sheet">
            Cost sheet CSV
          </button>
        </div>
        {message && <p className="muted" style={{ marginTop: '10px' }}>{message}</p>}
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Package contents</span>
            <h3>Included in close pack</h3>
          </div>
        </div>
        <ul className="plain-list">
          <li>Executive summary with control-account totals</li>
          <li>Monthly cost summary, EVM snapshot, change pipeline, audit extract</li>
          <li>
            <Link to="/audit">Audit trail</Link> — append-only on server
          </li>
        </ul>
      </section>
    </div>
  )
}
