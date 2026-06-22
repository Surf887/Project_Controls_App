import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  decisionRecords,
  roadmapItems,
  validationRules,
  type ApprovalStatus,
  type ExtractedValue,
  type ReportDocument,
  type ReviewStatus,
} from './data/projectData'
import { useProjectStore } from './store/projectStore'
import {
  buildCsvImport,
  canApproveValue,
  clearStoredState,
  sampleCsvContent,
} from './utils/workflow'
import {
  ControlsIntelligence,
  EngineeringIntelligence,
  Governance,
  ModelIntelligence,
  PredictiveIntelligence,
  RealityIntelligence,
} from './views/intelligence'
import { SCurveChart } from './views/charts'
import { CostSheetGrid } from './views/EditableGrid'
import { ForecastWhatIf } from './views/forecast'
import { ForecastEngineView } from './views/ForecastEngine'
import { BasisOfEstimateView } from './views/basisOfEstimate'
import {
  CommissioningWorkspace,
  ConstructionWorkspace,
  EngineeringWorkspace,
  ProcurementWorkspace,
} from './views/phases'
import {
  ActionRegister,
  ChangeRegister,
  ClaimsRegister,
  DecisionRegister,
  IssueRegister,
  LessonsLearnedRegister,
  OpportunityRegister,
  RiskOpportunityRegister,
} from './views/registers'
import { buildScurveFromCostSheet } from './engine/loading'
import { ContingencyView } from './views/contingency'
import { ForexView } from './views/forex'
import { IntegrationsView } from './views/integrations'
import { AccrualsView } from './views/accruals'
import { AuditTrailView, TeamReportsView } from './views/teamReports'
import { ForecastApprovalView } from './views/forecastApproval'
import { PortfolioCompareView } from './views/portfolioCompare'
import { CostStructureView } from './views/costStructure'
import { LongLeadView } from './views/longLead'
import { RulesOfCreditView } from './views/rulesOfCredit'
import { WbsManager } from './views/wbs'
import type { NavView } from './data/navigationModel'
import { monthlyClosePath, pathForView, viewFromPath } from './routes/viewPaths'
import { CommandPalette, useCommandPalette } from './components/CommandPalette'
import { MobileNav } from './components/MobileNav'
import { AppSidebar } from './components/AppSidebar'
import { MonthlyCloseWorkspace } from './views/monthlyClose'
import { isCloseFlowRoute } from './data/monthlyCloseSteps'
import { CloseFlowBar } from './components/CloseFlowBar'
import { ExportCentreView } from './views/exports'
import { AuditDrillDownPage, ItemDetailPage } from './views/itemDetail'
import { PmoDashboardView } from './views/pmoDashboard'
import { WorkflowAdminView } from './views/workflowAdmin'
import { CostControlLogsView } from './views/costControlLogs'
import { signIn } from './api/client'
import { LoginScreen } from './views/login'

type View = NavView

// Demo role switcher / unauthenticated `x-pc-role` fallback is gated behind
// VITE_DEMO_AUTH. Production builds leave this false so the topbar never shows
// a role selector and the client requires a real JWT from /platform/auth/token.
const demoAuthEnabled = import.meta.env.VITE_DEMO_AUTH === 'true'

const statusLabels: Record<ReviewStatus, string> = {
  pending_review: 'Pending review',
  needs_correction: 'Needs correction',
  approved: 'Approved',
}

const approvalLabels: Record<ApprovalStatus, string> = {
  unapproved: 'Unapproved',
  approved: 'Approved',
  rejected: 'Rejected',
}


function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatValue(value: ExtractedValue) {
  if (value.unit === 'USD') {
    return formatCurrency(value.normalizedValue)
  }

  if (value.unit === '%') {
    return `${value.normalizedValue.toFixed(1)}%`
  }

  return `${value.normalizedValue.toLocaleString()} ${value.unit}`
}

function confidenceClass(confidence: number) {
  if (confidence >= 0.85) return 'good'
  if (confidence >= 0.72) return 'watch'
  return 'risk'
}

function statusClass(status: ReviewStatus | ApprovalStatus | ReportDocument['status']) {
  return status.replace('_', '-')
}

function App() {
  const {
    state,
    dispatch,
    resetProject,
    switchProject,
    reconnect,
    login,
    loginSso,
    logout,
    ready,
    error,
    syncing,
    backendEnabled,
    authRequired,
    currentUser,
    authConfig,
    projects,
  } = useProjectStore()
  const location = useLocation()
  const navigate = useNavigate()
  const commandPalette = useCommandPalette()
  const activeView = viewFromPath(location.pathname) ?? 'dashboard'
  const [userRole, setUserRole] = useState(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('pc-role') ?? 'cost_controller' : 'cost_controller',
  )
  const [moreOpen, setMoreOpen] = useState(false)
  const closeFocus = isCloseFlowRoute(location.pathname)

  function setActiveView(view: View) {
    navigate(pathForView(view))
  }

  const reports = state.reports
  const values = state.values
  const selectedValueId = state.selectedValueId
  const [uploadMessage, setUploadMessage] = useState('Loading project data…')

  useEffect(() => {
    if (!ready) return
    setUploadMessage(
      backendEnabled
        ? 'Connected to Project Controls API — changes persist on the server.'
        : 'Backend unavailable — using browser local storage.',
    )
  }, [ready, backendEnabled])

  const selectedValue = values.find((value) => value.id === selectedValueId) ?? values[0]

  useEffect(() => {
    if (values.length > 0 && !values.some((value) => value.id === selectedValueId)) {
      dispatch({ type: 'SET_SELECTED_VALUE', payload: values[0].id })
    }
  }, [dispatch, selectedValueId, values])

  function setReports(next: ReportDocument[] | ((current: ReportDocument[]) => ReportDocument[])) {
    dispatch({
      type: 'SET_REPORTS',
      payload: typeof next === 'function' ? next(reports) : next,
    })
  }

  function setValues(next: ExtractedValue[] | ((current: ExtractedValue[]) => ExtractedValue[])) {
    dispatch({
      type: 'SET_VALUES',
      payload: typeof next === 'function' ? next(values) : next,
    })
  }

  function setSelectedValueId(id: string) {
    dispatch({ type: 'SET_SELECTED_VALUE', payload: id })
  }

  const scurveData = useMemo(() => buildScurveFromCostSheet(state.costSheetRows), [state.costSheetRows])

  const metrics = useMemo(() => {
    const approved = values.filter((value) => value.approvalStatus === 'approved').length
    const needsCorrection = values.filter((value) => value.reviewStatus === 'needs_correction').length
    const criticalIssues = values.reduce(
      (total, value) => total + value.validationIssues.filter((issue) => issue.severity === 'critical').length,
      0,
    )
    const averageConfidence =
      values.length === 0 ? 0 : values.reduce((total, value) => total + value.confidence, 0) / values.length
    const forecastExposure = values
      .filter((value) => value.unit === 'USD')
      .reduce((total, value) => total + value.normalizedValue, 0)

    return {
      approved,
      needsCorrection,
      criticalIssues,
      averageConfidence,
      forecastExposure,
      reviewProgress: values.length === 0 ? 0 : Math.round((approved / values.length) * 100),
    }
  }, [values])

  function updateReviewState(id: string, reviewStatus: ReviewStatus, approvalStatus: ApprovalStatus) {
    setValues((current) =>
      current.map((value) =>
        value.id === id && (approvalStatus !== 'approved' || canApproveValue(value))
          ? {
              ...value,
              reviewStatus,
              approvalStatus,
              reviewer: 'You',
            }
          : value,
      ),
    )
  }

  function updateNormalizedValue(id: string, nextValue: string) {
    const parsed = Number(nextValue)

    if (Number.isNaN(parsed)) {
      return
    }

    setValues((current) =>
      current.map((value) =>
        value.id === id
          ? {
              ...value,
              normalizedValue: parsed,
              reviewStatus: 'pending_review',
              approvalStatus: 'unapproved',
            }
          : value,
      ),
    )
  }

  function recordCorrection(id: string) {
    setValues((current) =>
      current.map((value) =>
        value.id === id
          ? {
              ...value,
              reviewStatus: 'pending_review',
              approvalStatus: 'unapproved',
              reviewer: 'You',
              correctionHistory: [
                {
                  at: new Date().toLocaleString(),
                  by: 'You',
                  from: value.rawValue,
                  to: formatValue(value),
                  reason: 'Manual reviewer correction in MVP prototype.',
                },
                ...value.correctionHistory,
              ],
            }
          : value,
      ),
    )
  }


  function approveCleanValues(ids: string[]) {
    const approvedAt = new Date().toLocaleString()

    setValues((current) =>
      current.map((value) =>
        ids.includes(value.id) && canApproveValue(value) && value.validationIssues.length === 0
          ? {
              ...value,
              reviewStatus: 'approved',
              approvalStatus: 'approved',
              reviewer: 'You',
              correctionHistory: [
                {
                  at: approvedAt,
                  by: 'You',
                  from: value.rawValue,
                  to: formatValue(value),
                  reason: 'Bulk-approved clean value with no validation issues.',
                },
                ...value.correctionHistory,
              ],
            }
          : value,
      ),
    )
  }
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

    setReports((current) => [report, ...current])
    setUploadMessage('Demo document added to the ingestion queue.')
  }

  async function handleCsvUpload(file: File) {
    const text = await file.text()
    const result = buildCsvImport(file.name, text, reports.length)

    if (!result.report || result.error) {
      setUploadMessage(result.error ?? 'CSV import failed.')
      return
    }

    setReports((current) => [result.report, ...current])
    setValues((current) => [...result.values, ...current])
    setSelectedValueId(result.values[0]?.id ?? selectedValueId)
    setActiveView('review')
    setUploadMessage(`Imported ${result.values.length} extracted values from ${file.name}.`)
  }

  async function resetDemoState() {
    if (!backendEnabled) {
      clearStoredState()
    }
    await resetProject()
    setUploadMessage(backendEnabled ? 'Demo data restored on server.' : 'Demo data restored and local saved state cleared.')
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

  if (!ready) {
    return (
      <main className="shell loading-shell">
        <section className="workspace loading-panel">
          <span className="eyebrow">Project Controls Platform</span>
          <h1>Loading project workspace…</h1>
          <p className="muted">Connecting to API and hydrating control data.</p>
        </section>
      </main>
    )
  }

  if (authRequired) {
    return (
      <LoginScreen
        onLogin={login}
        onSso={loginSso}
        oidcEnabled={authConfig?.oidcEnabled}
        globalError={error}
      />
    )
  }

  return (
    <main className="shell">
      <AppSidebar
        state={state}
        backendEnabled={backendEnabled}
        syncing={syncing}
        onReconnect={reconnect}
      />

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              {state.meta.name} · {state.meta.baselineLabel}
              {syncing ? ' · saving…' : ''}
            </span>
            <h1>Project Controls Intelligence Platform</h1>
            {error && <p className="muted topbar-note">{error}</p>}
          </div>
          <div className="topbar-actions">
            <label className="filter-inline topbar-select">
              <span>Project</span>
              <select
                className="select-input compact-select"
                value={state.meta.id}
                disabled={!backendEnabled || syncing}
                onChange={(event) => void switchProject(event.target.value)}
              >
                {(projects.length > 0 ? projects : [{ id: state.meta.id, name: state.meta.name, baselineLabel: state.meta.baselineLabel, updatedAt: '' }]).map(
                  (project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="filter-inline topbar-select">
              <span>Baseline</span>
              <input className="select-input compact-select" value={state.meta.baselineLabel} readOnly aria-readonly="true" />
            </label>
            <button className="ghost-button" onClick={() => commandPalette.setOpen(true)} type="button">
              Search ⌘K
            </button>
            <button className="primary-button" onClick={() => setActiveView('review')} type="button">
              Review queue
            </button>
            <div className="topbar-menu">
              <button
                className="ghost-button topbar-menu-trigger"
                onClick={() => setMoreOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                type="button"
              >
                More ▾
              </button>
              {moreOpen && (
                <>
                  <div className="topbar-menu-backdrop" onClick={() => setMoreOpen(false)} role="presentation" />
                  <div className="topbar-menu-popover" role="menu">
                    {demoAuthEnabled && (
                      <label
                        className="topbar-menu-field"
                        title="Demo role switcher — disabled in production builds (VITE_DEMO_AUTH=false)"
                      >
                        <span>Role (demo)</span>
                        <select
                          className="select-input compact-select"
                          value={userRole}
                          onChange={(event) => {
                            const role = event.target.value
                            localStorage.setItem('pc-role', role)
                            setUserRole(role)
                            if (backendEnabled) {
                              void signIn(role).then(() => reconnect()).catch(() => undefined)
                            }
                          }}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="cost_controller">Cost controller</option>
                          <option value="approver">Approver</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                    )}
                    {currentUser && !demoAuthEnabled && (
                      <div className="topbar-menu-field" title={`Signed in as ${currentUser.email ?? currentUser.name} (${currentUser.role})`}>
                        <span>Signed in</span>
                        <button
                          className="select-input compact-select"
                          type="button"
                          onClick={() => {
                            setMoreOpen(false)
                            logout()
                          }}
                        >
                          Sign out ({currentUser.name})
                        </button>
                      </div>
                    )}
                    <button
                      className="topbar-menu-item"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setActiveView('wbs')
                        setMoreOpen(false)
                      }}
                    >
                      WBS manager
                    </button>
                    <button
                      className="topbar-menu-item"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setActiveView('lineage')
                        setMoreOpen(false)
                      }}
                    >
                      Open lineage
                    </button>
                    <button
                      className="topbar-menu-item"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        void resetDemoState()
                        setMoreOpen(false)
                      }}
                    >
                      Reset demo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {closeFocus && location.pathname !== monthlyClosePath && <CloseFlowBar />}

        {location.pathname === monthlyClosePath && <MonthlyCloseWorkspace />}

        {location.pathname === '/exports' && <ExportCentreView />}

        {location.pathname === '/logs' && <CostControlLogsView />}

        {location.pathname === '/admin/pmo' && <PmoDashboardView />}

        {location.pathname === '/admin/workflows' && <WorkflowAdminView />}

        {location.pathname.startsWith('/item/') && <ItemDetailPage />}

        {location.pathname.startsWith('/audit/') && location.pathname !== '/audit' && <AuditDrillDownPage />}

        {location.pathname !== monthlyClosePath &&
          location.pathname !== '/exports' &&
          location.pathname !== '/logs' &&
          location.pathname !== '/admin/pmo' &&
          location.pathname !== '/admin/workflows' &&
          !location.pathname.startsWith('/item/') &&
          !(location.pathname.startsWith('/audit/') && location.pathname !== '/audit') &&
          activeView === 'dashboard' && (
          <Dashboard
            metrics={metrics}
            reports={reports}
            scurveData={scurveData}
            values={values}
            onOpenReview={() => setActiveView('review')}
            onOpenValidation={() => setActiveView('validation')}
          />
        )}

        {activeView === 'portfolio' && <PortfolioCompareView />}

        {activeView === 'forecast-approval' && <ForecastApprovalView />}

        {activeView === 'team-reports' && <TeamReportsView />}

        {activeView === 'audit-trail' && <AuditTrailView />}

        {activeView === 'ingestion' && (
          <Ingestion
            reports={reports}
            uploadMessage={uploadMessage}
            onDownloadSample={downloadSampleCsv}
            onCsvUpload={handleCsvUpload}
            onSimulateUpload={simulateUpload}
          />
        )}

        {activeView === 'review' && (
          <ReviewDesk
            selectedValueId={selectedValue.id}
            values={values}
            onApprove={(id) => updateReviewState(id, 'approved', 'approved')}
            onBulkApprove={approveCleanValues}
            onChangeValue={updateNormalizedValue}
            onRecordCorrection={recordCorrection}
            onReject={(id) => updateReviewState(id, 'needs_correction', 'rejected')}
            onSelect={setSelectedValueId}
          />
        )}

        {activeView === 'validation' && <Validation values={values} onSelect={setSelectedValueId} />}

        {activeView === 'lineage' && <Lineage value={selectedValue} />}

        {activeView === 'wbs' && (
          <WbsManager onImportComplete={() => setActiveView('costsheet')} />
        )}

        {activeView === 'basis' && <BasisOfEstimateView />}

        {activeView === 'cost-structure' && <CostStructureView />}

        {activeView === 'rules-of-credit' && <RulesOfCreditView />}

        {activeView === 'long-lead' && <LongLeadView />}

        {activeView === 'engineering-phase' && <EngineeringWorkspace />}

        {activeView === 'procurement' && <ProcurementWorkspace />}

        {activeView === 'construction' && <ConstructionWorkspace />}

        {activeView === 'commissioning' && <CommissioningWorkspace />}

        {activeView === 'changes' && <ChangeRegister />}

        {activeView === 'accruals' && <AccrualsView />}

        {activeView === 'forecast-engine' && <ForecastEngineView />}

        {activeView === 'forecast-whatif' && <ForecastWhatIf />}

        {activeView === 'contingency' && <ContingencyView />}

        {activeView === 'forex' && <ForexView />}

        {activeView === 'integrations' && <IntegrationsView />}

        {activeView === 'risks' && <RiskOpportunityRegister />}

        {activeView === 'opportunities' && <OpportunityRegister />}

        {activeView === 'issues' && <IssueRegister />}

        {activeView === 'claims' && <ClaimsRegister />}

        {activeView === 'actions' && <ActionRegister />}

        {activeView === 'decisions-log' && <DecisionRegister />}

        {activeView === 'lessons' && <LessonsLearnedRegister />}

        {activeView === 'costsheet' && <CostSheetGrid />}

        {activeView === 'controls' && <ControlsIntelligence />}

        {activeView === 'predictive' && <PredictiveIntelligence />}

        {activeView === 'engineering' && <EngineeringIntelligence />}

        {activeView === 'model' && <ModelIntelligence />}

        {activeView === 'reality' && <RealityIntelligence />}

        {activeView === 'governance' && <Governance />}

        {activeView === 'decisions' && <Decisions />}
      </section>

      <MobileNav />
      <CommandPalette open={commandPalette.open} onClose={commandPalette.close} />
    </main>
  )
}

interface DashboardProps {
  metrics: {
    approved: number
    needsCorrection: number
    criticalIssues: number
    averageConfidence: number
    forecastExposure: number
    reviewProgress: number
  }
  reports: ReportDocument[]
  scurveData: ReturnType<typeof buildScurveFromCostSheet>
  values: ExtractedValue[]
  onOpenReview: () => void
  onOpenValidation: () => void
}

function Dashboard({ metrics, reports, scurveData, values, onOpenReview, onOpenValidation }: DashboardProps) {
  const pipelineStages = [
    { label: 'Received', count: reports.length, detail: 'contractor files' },
    { label: 'Extracted', count: values.length, detail: 'structured values' },
    { label: 'Reviewed', count: metrics.approved, detail: 'approved values' },
    { label: 'Exceptions', count: metrics.needsCorrection + metrics.criticalIssues, detail: 'need action' },
  ]

  return (
    <div className="view-stack">
      <section className="dashboard-hero">
        <div className="dashboard-hero-text">
          <span className="eyebrow">AI Project Controls Intelligence Platform</span>
          <h2>Every reported number — reviewable, correctable, approvable, traceable.</h2>
          <p>Owner-side contractor report ingestion · Earned value analytics · Rules-based risk signals · Source lineage on every value.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenReview} type="button">Open review queue</button>
            <button className="ghost-button" onClick={onOpenValidation} type="button">Validation rules</button>
          </div>
        </div>
        <div className="dashboard-hero-chart">
          <span className="eyebrow">Project S-curve — cost cumulative %</span>
          <SCurveChart data={scurveData} />
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard label="Forecast exposure" value={formatCurrency(metrics.forecastExposure)} detail="USD values in current queue" />
        <MetricCard label="Review progress" value={`${metrics.reviewProgress}%`} detail={`${metrics.approved} approved values`} />
        <MetricCard
          label="Avg. confidence"
          value={`${Math.round(metrics.averageConfidence * 100)}%`}
          detail="AI extraction confidence"
        />
        <MetricCard label="Critical issues" value={metrics.criticalIssues.toString()} detail="must resolve before approval" tone="risk" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Trust pipeline</span>
            <h3>Messy source to approved intelligence</h3>
          </div>
          <span className="badge badge-watch">Human-in-the-loop</span>
        </div>
        <div className="pipeline-grid">
          {pipelineStages.map((stage, index) => (
            <article className="pipeline-stage" key={stage.label}>
              <span className="stage-index">{String(index + 1).padStart(2, '0')}</span>
              <strong>{stage.label}</strong>
              <b>{stage.count}</b>
              <small>{stage.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Current queue</span>
              <h3>Reports requiring confidence review</h3>
            </div>
          </div>
          <div className="report-list compact">
            {reports.map((report) => (
              <ReportCard report={report} key={report.id} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Risk signals</span>
              <h3>Rules before predictions</h3>
            </div>
          </div>
          <div className="risk-list">
            {values
              .filter((value) => value.validationIssues.length > 0)
              .map((value) => (
                <article className="risk-item" key={value.id}>
                  <span className={`badge badge-${confidenceClass(value.confidence)}`}>
                    {Math.round(value.confidence * 100)}% confidence
                  </span>
                  <strong>{value.field}</strong>
                  <p>{value.validationIssues[0].message}</p>
                </article>
              ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'risk' }) {
  return (
    <article className={tone === 'risk' ? 'metric-card risk' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function Ingestion({
  reports,
  uploadMessage,
  onCsvUpload,
  onDownloadSample,
  onSimulateUpload,
}: {
  reports: ReportDocument[]
  uploadMessage: string
  onCsvUpload: (file: File) => void
  onDownloadSample: () => void
  onSimulateUpload: () => void
}) {
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
                    onCsvUpload(file)
                    event.target.value = ''
                  }
                }}
                type="file"
              />
              <strong>Choose CSV file</strong>
              <span>Headers can include field, category, rawValue, normalizedValue, unit, wbs, cbs, confidence, owner.</span>
            </label>
            <div className="hero-actions">
              <button className="ghost-button" onClick={onDownloadSample} type="button">
                Download sample CSV
              </button>
              <button className="ghost-button" onClick={onSimulateUpload} type="button">
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

function ReportCard({ report }: { report: ReportDocument }) {
  return (
    <article className="report-card">
      <div>
        <span className="eyebrow">{report.contractor}</span>
        <h4>{report.name}</h4>
        <p>
          {report.packageName} · {report.period} · {report.sourceSystem}
        </p>
      </div>
      <div className="report-meta">
        <span className={`badge badge-${statusClass(report.status)}`}>{report.status}</span>
        <strong>{Math.round(report.confidence * 100)}%</strong>
        <small>{report.extractedCount} values · {report.issueCount} issues</small>
      </div>
    </article>
  )
}

interface ReviewDeskProps {
  selectedValueId: string
  values: ExtractedValue[]
  onApprove: (id: string) => void
  onBulkApprove: (ids: string[]) => void
  onChangeValue: (id: string, nextValue: string) => void
  onRecordCorrection: (id: string) => void
  onReject: (id: string) => void
  onSelect: (id: string) => void
}
function ReviewDesk({
  selectedValueId,
  values,
  onApprove,
  onBulkApprove,
  onChangeValue,
  onRecordCorrection,
  onReject,
  onSelect,
}: ReviewDeskProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ExtractedValue['category'] | 'all'>('all')
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | 'all'>('all')
  const selectedValue = values.find((value) => value.id === selectedValueId) ?? values[0]
  const categories = Array.from(new Set(values.map((value) => value.category)))
  const filteredValues = useMemo(
    () =>
      values.filter((value) => {
        const haystack = [
          value.field,
          value.owner,
          value.wbs,
          value.cbs,
          value.standardMapping,
          value.source.document,
          value.period,
        ]
          .join(' ')
          .toLowerCase()
        const matchesSearch = haystack.includes(search.trim().toLowerCase())
        const matchesCategory = categoryFilter === 'all' || value.category === categoryFilter
        const matchesReview = reviewFilter === 'all' || value.reviewStatus === reviewFilter

        return matchesSearch && matchesCategory && matchesReview
      }),
    [categoryFilter, reviewFilter, search, values],
  )
  const cleanApprovalIds = filteredValues
    .filter((value) => value.validationIssues.length === 0 && value.approvalStatus !== 'approved')
    .map((value) => value.id)

  if (!selectedValue) {
    return (
      <section className="panel">
        <span className="eyebrow">Human review desk</span>
        <h3>No extracted values available</h3>
        <p className="empty-state">Upload a CSV report from the ingestion workspace to create review items.</p>
      </section>
    )
  }

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Human review desk</span>
            <h3>Correct and approve extracted project-controls values</h3>
          </div>
          <div className="hero-actions">
            <span className="badge badge-watch">{filteredValues.length} visible</span>
            <button
              className="ghost-button"
              disabled={cleanApprovalIds.length === 0}
              onClick={() => onBulkApprove(cleanApprovalIds)}
              type="button"
            >
              Bulk approve clean values
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <label>
            <span>Search</span>
            <input
              className="filter-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Field, owner, WBS, source..."
              type="search"
              value={search}
            />
          </label>
          <label>
            <span>Category</span>
            <select
              className="select-input"
              onChange={(event) => setCategoryFilter(event.target.value as ExtractedValue['category'] | 'all')}
              value={categoryFilter}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Review state</span>
            <select
              className="select-input"
              onChange={(event) => setReviewFilter(event.target.value as ReviewStatus | 'all')}
              value={reviewFilter}
            >
              <option value="all">All review states</option>
              <option value="pending_review">Pending review</option>
              <option value="needs_correction">Needs correction</option>
              <option value="approved">Approved</option>
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Normalized value</th>
                <th>Mapping</th>
                <th>Confidence</th>
                <th>Review</th>
                <th>Approval</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredValues.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="empty-state">No extracted values match the current filters.</p>
                  </td>
                </tr>
              ) : (
                filteredValues.map((value) => {
                  const approvalBlocked = !canApproveValue(value)

                  return (
                    <tr className={selectedValueId === value.id ? 'selected-row' : ''} key={value.id}>
                      <td>
                        <button className="link-button" onClick={() => onSelect(value.id)} type="button">
                          {value.field}
                        </button>
                        <small>{value.owner} · {value.category}</small>
                      </td>
                      <td>
                        <input
                          aria-label={`Normalized value for ${value.field}`}
                          className="value-input"
                          onChange={(event) => onChangeValue(value.id, event.target.value)}
                          type="number"
                          value={value.normalizedValue}
                        />
                        <small>{value.unit}</small>
                      </td>
                      <td>
                        <strong>{value.wbs}</strong>
                        <small>{value.standardMapping}</small>
                      </td>
                      <td>
                        <div className="confidence">
                          <span>{Math.round(value.confidence * 100)}%</span>
                          <div className="confidence-track">
                            <div
                              className={`confidence-fill ${confidenceClass(value.confidence)}`}
                              style={{ width: `${value.confidence * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${statusClass(value.reviewStatus)}`}>
                          {statusLabels[value.reviewStatus]}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${statusClass(value.approvalStatus)}`}>
                          {approvalLabels[value.approvalStatus]}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="small-button"
                            disabled={approvalBlocked}
                            onClick={() => onApprove(value.id)}
                            title={approvalBlocked ? 'Resolve critical validation issues before approval.' : 'Approve value'}
                            type="button"
                          >
                            Approve
                          </button>
                          <button className="small-button secondary" onClick={() => onReject(value.id)} type="button">
                            Flag
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <span className="eyebrow">Selected value</span>
          <h3>{selectedValue.field}</h3>
          <dl className="detail-list">
            <div>
              <dt>Raw value</dt>
              <dd>{selectedValue.rawValue}</dd>
            </div>
            <div>
              <dt>Normalized value</dt>
              <dd>{formatValue(selectedValue)}</dd>
            </div>
            <div>
              <dt>Mapped WBS / CBS</dt>
              <dd>{selectedValue.wbs} / {selectedValue.cbs}</dd>
            </div>
            <div>
              <dt>Reviewer</dt>
              <dd>{selectedValue.reviewer}</dd>
            </div>
          </dl>
          <button className="ghost-button" onClick={() => onRecordCorrection(selectedValue.id)} type="button">
            Record correction note
          </button>
        </div>

        <div className="panel">
          <span className="eyebrow">Validation issues</span>
          <h3>What blocks approval</h3>
          {!canApproveValue(selectedValue) && (
            <div className="notice-card risk">
              Resolve critical validation issues before this value can be approved.
            </div>
          )}
          {selectedValue.validationIssues.length === 0 ? (
            <p className="empty-state">No validation issues are attached to this value.</p>
          ) : (
            <div className="risk-list">
              {selectedValue.validationIssues.map((issue) => (
                <article className="risk-item" key={`${selectedValue.id}-${issue.message}`}>
                  <span className={`badge badge-${issue.severity === 'critical' ? 'risk' : 'watch'}`}>{issue.severity}</span>
                  <p>{issue.message}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Validation({ values, onSelect }: { values: ExtractedValue[]; onSelect: (id: string) => void }) {
  const mappedValues = values.filter((value) => value.wbs !== 'N/A').length
  const mappingCoverage = Math.round((mappedValues / values.length) * 100)

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricCard label="Mapping coverage" value={`${mappingCoverage}%`} detail="values mapped to client WBS/CBS" />
        <MetricCard
          label="Validation rules"
          value={validationRules.length.toString()}
          detail="deterministic controls before ML"
        />
        <MetricCard
          label="Open warnings"
          value={values.reduce((total, value) => total + value.validationIssues.length, 0).toString()}
          detail="requires reviewer judgement"
          tone="risk"
        />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Rules engine</span>
              <h3>Validation checks</h3>
            </div>
          </div>
          <div className="rule-list">
            {validationRules.map((rule) => (
              <article className="rule-card" key={rule.id}>
                <span className={`badge badge-${rule.result === 'fail' ? 'risk' : rule.result === 'warning' ? 'watch' : 'good'}`}>
                  {rule.result}
                </span>
                <h4>{rule.name}</h4>
                <p>{rule.description}</p>
                <small>Affects: {rule.affectedFields.join(', ')}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Mapping model</span>
              <h3>Map standards, never force them</h3>
            </div>
          </div>
          <div className="mapping-list">
            {values.map((value) => (
              <button className="mapping-row" key={value.id} onClick={() => onSelect(value.id)} type="button">
                <span>
                  <strong>{value.field}</strong>
                  <small>{value.standardMapping}</small>
                </span>
                <b>{value.wbs}</b>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function Lineage({ value }: { value: ExtractedValue }) {
  return (
    <div className="view-stack">
      <section className="panel lineage-card">
        <div>
          <span className="eyebrow">Click-to-source traceability</span>
          <h2>{value.field}</h2>
          <p>
            Every approved dashboard number keeps its source document, table location, confidence, reviewer,
            correction history, and approval status.
          </p>
        </div>
        <span className={`badge badge-${statusClass(value.approvalStatus)}`}>{approvalLabels[value.approvalStatus]}</span>
      </section>

      <section className="two-column">
        <div className="panel">
          <span className="eyebrow">Source reference</span>
          <h3>{value.source.document}</h3>
          <dl className="detail-list">
            <div>
              <dt>Sheet / page</dt>
              <dd>{value.source.sheet ?? `Page ${value.source.page ?? 'N/A'}`}</dd>
            </div>
            <div>
              <dt>Table</dt>
              <dd>{value.source.table}</dd>
            </div>
            <div>
              <dt>Row / column</dt>
              <dd>{value.source.row} / {value.source.column}</dd>
            </div>
            <div>
              <dt>Anchor</dt>
              <dd>{value.source.anchor}</dd>
            </div>
          </dl>
        </div>

        <div className="panel source-preview">
          <span className="eyebrow">Source preview</span>
          <div className="sheet-preview">
            <div className="sheet-row header">
              <span>WBS</span>
              <span>Metric</span>
              <span>Reported</span>
              <span>Reviewer</span>
            </div>
            <div className="sheet-row">
              <span>{value.wbs}</span>
              <span>{value.field}</span>
              <span className="highlight-cell">{value.rawValue}</span>
              <span>{value.reviewer}</span>
            </div>
            <div className="sheet-row muted">
              <span>Source</span>
              <span>{value.source.table}</span>
              <span>{value.source.row}</span>
              <span>{value.source.column}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Audit trail</span>
            <h3>Correction history</h3>
          </div>
          <span className="badge badge-watch">{value.correctionHistory.length} entries</span>
        </div>
        {value.correctionHistory.length === 0 ? (
          <p className="empty-state">No corrections recorded yet.</p>
        ) : (
          <div className="timeline">
            {value.correctionHistory.map((entry) => (
              <article className="timeline-item" key={`${entry.at}-${entry.reason}`}>
                <strong>{entry.by}</strong>
                <span>{entry.at}</span>
                <p>{entry.reason}</p>
                <small>
                  {entry.from} → {entry.to}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Decisions() {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Binding product strategy</span>
            <h3>Decision register for the first build</h3>
          </div>
          <span className="badge badge-good">MVP scope locked</span>
        </div>
        <div className="decision-grid">
          {decisionRecords.map((record) => (
            <article className="decision-card" key={record.id}>
              <span>{record.id}</span>
              <h4>{record.decision}</h4>
              <p>{record.choice}</p>
              <small>Rejected: {record.rejectedAlternative}</small>
              <div>
                <b>{record.evidenceTag}</b>
                <em>{record.confidence} confidence</em>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Roadmap discipline</span>
            <h3>What waits until commercial pull exists</h3>
          </div>
        </div>
        <div className="roadmap-list">
          {roadmapItems.map((item) => (
            <article className="roadmap-item" key={`${item.phase}-${item.item}`}>
              <span>{item.phase}</span>
              <div>
                <h4>{item.item}</h4>
                <p>{item.trigger}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
