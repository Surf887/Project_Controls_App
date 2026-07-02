import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProjectStore } from './store/projectStore'
import { clearStoredState } from './utils/workflow'
import type { NavView } from './data/navigationModel'
import { monthlyClosePath, pathForView, viewFromPath } from './routes/viewPaths'
// Core shell stays eagerly loaded for instant first paint.
import { CommandPalette, useCommandPalette } from './components/CommandPalette'
import { MobileNav } from './components/MobileNav'
import { AppSidebar } from './components/AppSidebar'
import { isCloseFlowRoute } from './data/monthlyCloseSteps'
import { CloseFlowBar } from './components/CloseFlowBar'
import { signIn } from './api/client'
import { LoginScreen } from './views/login'

// Route-level code splitting: each routed view is loaded on demand so the
// initial bundle stays small. Named exports are adapted to the default export
// that React.lazy expects via `.then(m => ({ default: m.Export }))`.
const ControlsIntelligence = lazy(() =>
  import('./views/intelligence').then((m) => ({ default: m.ControlsIntelligence })),
)
const EngineeringIntelligence = lazy(() =>
  import('./views/intelligence').then((m) => ({ default: m.EngineeringIntelligence })),
)
const Governance = lazy(() => import('./views/intelligence').then((m) => ({ default: m.Governance })))
const ModelIntelligence = lazy(() =>
  import('./views/intelligence').then((m) => ({ default: m.ModelIntelligence })),
)
const PredictiveIntelligence = lazy(() =>
  import('./views/intelligence').then((m) => ({ default: m.PredictiveIntelligence })),
)
const RealityIntelligence = lazy(() =>
  import('./views/intelligence').then((m) => ({ default: m.RealityIntelligence })),
)
const CostSheetGrid = lazy(() =>
  import('./views/EditableGrid').then((m) => ({ default: m.CostSheetGrid })),
)
const ForecastWhatIf = lazy(() => import('./views/forecast').then((m) => ({ default: m.ForecastWhatIf })))
const ForecastEngineView = lazy(() =>
  import('./views/ForecastEngine').then((m) => ({ default: m.ForecastEngineView })),
)
const BasisOfEstimateView = lazy(() =>
  import('./views/basisOfEstimate').then((m) => ({ default: m.BasisOfEstimateView })),
)
const CommissioningWorkspace = lazy(() =>
  import('./views/phases').then((m) => ({ default: m.CommissioningWorkspace })),
)
const ConstructionWorkspace = lazy(() =>
  import('./views/phases').then((m) => ({ default: m.ConstructionWorkspace })),
)
const EngineeringWorkspace = lazy(() =>
  import('./views/phases').then((m) => ({ default: m.EngineeringWorkspace })),
)
const ProcurementWorkspace = lazy(() =>
  import('./views/phases').then((m) => ({ default: m.ProcurementWorkspace })),
)
const ActionRegister = lazy(() => import('./views/registers').then((m) => ({ default: m.ActionRegister })))
const ChangeRegister = lazy(() => import('./views/registers').then((m) => ({ default: m.ChangeRegister })))
const ClaimsRegister = lazy(() => import('./views/registers').then((m) => ({ default: m.ClaimsRegister })))
const DecisionRegister = lazy(() =>
  import('./views/registers').then((m) => ({ default: m.DecisionRegister })),
)
const IssueRegister = lazy(() => import('./views/registers').then((m) => ({ default: m.IssueRegister })))
const LessonsLearnedRegister = lazy(() =>
  import('./views/registers').then((m) => ({ default: m.LessonsLearnedRegister })),
)
const OpportunityRegister = lazy(() =>
  import('./views/registers').then((m) => ({ default: m.OpportunityRegister })),
)
const RiskOpportunityRegister = lazy(() =>
  import('./views/registers').then((m) => ({ default: m.RiskOpportunityRegister })),
)
const ContingencyView = lazy(() =>
  import('./views/contingency').then((m) => ({ default: m.ContingencyView })),
)
const ForexView = lazy(() => import('./views/forex').then((m) => ({ default: m.ForexView })))
const IntegrationsView = lazy(() =>
  import('./views/integrations').then((m) => ({ default: m.IntegrationsView })),
)
const AccrualsView = lazy(() => import('./views/accruals').then((m) => ({ default: m.AccrualsView })))
const AuditTrailView = lazy(() =>
  import('./views/teamReports').then((m) => ({ default: m.AuditTrailView })),
)
const TeamReportsView = lazy(() =>
  import('./views/teamReports').then((m) => ({ default: m.TeamReportsView })),
)
const ForecastApprovalView = lazy(() =>
  import('./views/forecastApproval').then((m) => ({ default: m.ForecastApprovalView })),
)
const PortfolioCompareView = lazy(() =>
  import('./views/portfolioCompare').then((m) => ({ default: m.PortfolioCompareView })),
)
const CostStructureView = lazy(() =>
  import('./views/costStructure').then((m) => ({ default: m.CostStructureView })),
)
const SccsView = lazy(() => import('./views/sccs').then((m) => ({ default: m.SccsView })))
const LongLeadView = lazy(() => import('./views/longLead').then((m) => ({ default: m.LongLeadView })))
const RulesOfCreditView = lazy(() =>
  import('./views/rulesOfCredit').then((m) => ({ default: m.RulesOfCreditView })),
)
const WbsManager = lazy(() => import('./views/wbs').then((m) => ({ default: m.WbsManager })))
const MonthlyCloseWorkspace = lazy(() =>
  import('./views/monthlyClose').then((m) => ({ default: m.MonthlyCloseWorkspace })),
)
const ExportCentreView = lazy(() =>
  import('./views/exports').then((m) => ({ default: m.ExportCentreView })),
)
const AuditDrillDownPage = lazy(() =>
  import('./views/itemDetail').then((m) => ({ default: m.AuditDrillDownPage })),
)
const ItemDetailPage = lazy(() =>
  import('./views/itemDetail').then((m) => ({ default: m.ItemDetailPage })),
)
const PmoDashboardView = lazy(() =>
  import('./views/pmoDashboard').then((m) => ({ default: m.PmoDashboardView })),
)
const WorkflowAdminView = lazy(() =>
  import('./views/workflowAdmin').then((m) => ({ default: m.WorkflowAdminView })),
)
const CostControlLogsView = lazy(() =>
  import('./views/costControlLogs').then((m) => ({ default: m.CostControlLogsView })),
)
const Dashboard = lazy(() => import('./views/dashboard').then((m) => ({ default: m.Dashboard })))
const Ingestion = lazy(() => import('./views/ingestion').then((m) => ({ default: m.Ingestion })))
const ReviewDesk = lazy(() => import('./views/reviewDesk').then((m) => ({ default: m.ReviewDesk })))
const Validation = lazy(() => import('./views/validation').then((m) => ({ default: m.Validation })))
const Lineage = lazy(() => import('./views/lineage').then((m) => ({ default: m.Lineage })))
const Decisions = lazy(() => import('./views/decisions').then((m) => ({ default: m.Decisions })))

type View = NavView

function App() {
  const {
    state,
    dispatch,
    resetProject,
    switchProject,
    reconnect,
    login,
    loginSso,
    loginDemo,
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
  const [errorDismissed, setErrorDismissed] = useState(false)
  const closeFocus = isCloseFlowRoute(location.pathname)

  useEffect(() => {
    if (error) setErrorDismissed(false)
  }, [error])
  // Demo login/role UI follows the server's auth config (the source of truth).
  // Deciding client-side (e.g. via import.meta.env.DEV) showed a demo button
  // that failed with a 404 whenever the server had demo auth disabled.
  const demoAuthAvailable = authConfig?.demoAuthEnabled === true

  function setActiveView(view: View) {
    navigate(pathForView(view))
  }

  const values = state.values
  const selectedValueId = state.selectedValueId

  // Selection repair: if the selected extraction disappears (CSV re-import,
  // reset), point at the first available value so detail panes stay populated.
  useEffect(() => {
    if (values.length > 0 && !values.some((value) => value.id === selectedValueId)) {
      dispatch({ type: 'SET_SELECTED_VALUE', payload: values[0].id })
    }
  }, [dispatch, selectedValueId, values])

  async function resetDemoState() {
    if (!backendEnabled) {
      clearStoredState()
    }
    await resetProject()
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
        onDemoLogin={loginDemo}
        oidcEnabled={authConfig?.oidcEnabled}
        demoAuthEnabled={demoAuthAvailable}
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
        onSearchClick={() => commandPalette.setOpen(true)}
      />

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-identity">
            <span className="eyebrow">
              {state.meta.name} · {state.meta.baselineLabel}
              {syncing ? ' · saving…' : ''}
            </span>
            <h1>Project Controls Intelligence Platform</h1>
          </div>
          <div className="topbar-actions">
            <div className="topbar-group">
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
            </div>
            <div className="topbar-sep" aria-hidden="true" />
            <div className="topbar-group">
              <button className="ghost-button" onClick={() => commandPalette.setOpen(true)} type="button">
                Search ⌘K
              </button>
              <button className="primary-button" onClick={() => setActiveView('review')} type="button">
                Review queue
              </button>
            </div>
            {demoAuthAvailable && (
              <>
                <div className="topbar-sep" aria-hidden="true" />
                <div className="topbar-group">
                  <label className="filter-inline topbar-select" title="Switch demo role (local demo only)">
                    <span>Demo role</span>
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
                </div>
              </>
            )}
            <div className="topbar-sep" aria-hidden="true" />
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
                    {currentUser && !demoAuthAvailable && (
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

        {error && !errorDismissed && (
          <div className="error-banner" role="alert">
            <span className="error-banner-icon" aria-hidden="true">⚠</span>
            <span className="error-banner-message">{error}</span>
            <button
              className="error-banner-dismiss"
              type="button"
              aria-label="Dismiss error"
              onClick={() => setErrorDismissed(true)}
            >
              ✕
            </button>
          </div>
        )}

        {closeFocus && location.pathname !== monthlyClosePath && <CloseFlowBar />}

        {/* Routed views are code-split; show a lightweight fallback while a
            view chunk loads. */}
        <Suspense fallback={<p className="muted" style={{ padding: '1.5rem' }}>Loading view…</p>}>

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
          activeView === 'dashboard' && <Dashboard />}

        {activeView === 'portfolio' && <PortfolioCompareView />}

        {activeView === 'forecast-approval' && <ForecastApprovalView />}

        {activeView === 'team-reports' && <TeamReportsView />}

        {activeView === 'audit-trail' && <AuditTrailView />}

        {activeView === 'ingestion' && <Ingestion />}

        {activeView === 'review' && <ReviewDesk />}

        {activeView === 'validation' && <Validation />}

        {activeView === 'lineage' && <Lineage />}

        {activeView === 'wbs' && (
          <WbsManager onImportComplete={() => setActiveView('costsheet')} />
        )}

        {activeView === 'basis' && <BasisOfEstimateView />}

        {activeView === 'cost-structure' && <CostStructureView />}

        {activeView === 'sccs' && <SccsView />}

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
        </Suspense>
      </section>

      <MobileNav />
      <CommandPalette open={commandPalette.open} onClose={commandPalette.close} />
    </main>
  )
}

export default App
