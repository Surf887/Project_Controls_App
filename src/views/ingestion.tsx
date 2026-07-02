import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReportDocument } from '../data/projectData'
import { pathForView } from '../routes/viewPaths'
import { useProjectStore } from '../store/projectStore'
import { buildCsvImport, sampleCsvContent } from '../utils/workflow'
import { ReportCard } from './extractionShared'

export function Ingestion() {
  const { state, dispatch, ready, backendEnabled } = useProjectStore()
  const navigate = useNavigate()
  const reports = state.reports
  const [uploadMessage, setUploadMessage] = useState('Loading project data…')

  useEffect(() => {
    if (!ready) return
    setUploadMessage(
      backendEnabled
        ? 'Connected to Project Controls API — changes persist on the server.'
        : 'Backend unavailable — using browser local storage.',
    )
  }, [ready, backendEnabled])

  function simulateUpload() {
    const nextIndex = reports.length + 1
    const report: ReportDocument = {
      id: `rpt-demo-${nextIndex}`,
      name: `Demo Contractor Cost Export ${nextIndex}.csv`,
      contractor: 'Pilot Contractor',
      packageName: 'Site Infrastructure',
      period: '2026-W24',
      sourceType: 'excel',
      receivedAt: new Date().toLocaleString(),
      status: 'received',
      confidence: 0.64,
      extractedCount: 0,
      issueCount: 0,
      sourceSystem: 'Local upload simulation',
    }

    dispatch({ type: 'SET_REPORTS', payload: [report, ...reports] })
    setUploadMessage('Demo document added to the ingestion queue.')
  }

  async function handleCsvUpload(file: File) {
    const text = await file.text()
    const result = buildCsvImport(file.name, text, reports.length)

    if (!result.report || result.error) {
      setUploadMessage(result.error ?? 'CSV import failed.')
      return
    }

    dispatch({ type: 'SET_REPORTS', payload: [result.report, ...reports] })
    dispatch({ type: 'SET_VALUES', payload: [...result.values, ...state.values] })
    if (result.values[0]) {
      dispatch({ type: 'SET_SELECTED_VALUE', payload: result.values[0].id })
    }
    navigate(pathForView('review'))
    setUploadMessage(`Imported ${result.values.length} extracted values from ${file.name}.`)
  }

  function downloadSampleCsv() {
    const blob = new Blob([sampleCsvContent()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'sample-contractor-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="view-stack">
      <section className="panel split-panel">
        <div className="upload-zone">
          <span className="eyebrow">Ingestion workspace</span>
          <h2>Upload contractor CSVs and turn rows into traceable review items.</h2>
          <p>
            This V1 local workflow parses tabular cost, progress, change, procurement, and forecast values directly in
            the browser. Each imported row gets confidence, mapping, validation status, and source lineage.
          </p>
          <div className="upload-actions">
            <label className="file-drop">
              <input
                accept=".csv,text/csv"
                className="hidden-file"
                onChange={(event) => {
                  const file = event.target.files?.[0]

                  if (file) {
                    void handleCsvUpload(file)
                    event.target.value = ''
                  }
                }}
                type="file"
              />
              <strong>Choose CSV file</strong>
              <span>Headers can include field, category, rawValue, normalizedValue, unit, wbs, cbs, confidence, owner.</span>
            </label>
            <div className="hero-actions">
              <button className="ghost-button" onClick={downloadSampleCsv} type="button">
                Download sample CSV
              </button>
              <button className="ghost-button" onClick={simulateUpload} type="button">
                Simulate document only
              </button>
            </div>
          </div>
          <p className="upload-message">{uploadMessage}</p>
        </div>
        <div className="format-card">
          <h3>Current ingestion boundary</h3>
          <ul>
            <li>CSV tabular contractor cost and progress exports</li>
            <li>Browser-side parsing; no document leaves the machine</li>
            <li>Warnings generated for low confidence, unmapped codes, and risk terms</li>
            <li>OCR, P6, ERP, CAD, and PDF extraction remain future integration work</li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Source queue</span>
            <h3>Documents waiting for classification and extraction</h3>
          </div>
          <span className="badge badge-good">{reports.length} files</span>
        </div>
        <div className="report-list">
          {reports.map((report) => (
            <ReportCard report={report} key={report.id} />
          ))}
        </div>
      </section>
    </div>
  )
}
