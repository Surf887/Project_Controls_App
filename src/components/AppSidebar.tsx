import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { evaluateMonthlyClose } from '../engine/monthlyCloseProgress'
import type { CloseStepProgress } from '../engine/monthlyCloseProgress'
import { defaultCollapsedGroups, navGroups, type NavView } from '../data/navigationModel'
import { isCloseFlowRoute } from '../data/monthlyCloseSteps'
import { costControlLogCount, costControlLogPath } from '../data/costControlLogs'
import { monthlyClosePath, pathForView, viewFromPath } from '../routes/viewPaths'
import type { ProjectState } from '../store/types'
import { isViewEnabled } from '../config/features'

const adminLinks = [
  { label: 'PMO dashboard', path: '/admin/pmo' },
  { label: 'Workflow admin', path: '/admin/workflows' },
  { label: 'Connectors', path: pathForView('integrations') },
] as const

const visibleNavGroups = navGroups
  .map((group) => ({ ...group, items: group.items.filter((item) => isViewEnabled(item.id)) }))
  .filter((group) => group.items.length > 0)
const visibleAdminLinks = adminLinks.filter((link) => link.path !== pathForView('integrations') || isViewEnabled('integrations'))

const statusDot: Record<'live' | 'local' | 'syncing', string> = {
  live: 'sidebar-status-dot--live',
  local: 'sidebar-status-dot--local',
  syncing: 'sidebar-status-dot--syncing',
}

const pinnedViews: { view: NavView; label: string }[] = [
  { view: 'costsheet', label: 'Cost Sheet' },
  { view: 'changes', label: 'Change Register' },
  { view: 'forecast-engine', label: 'Forecast Engine' },
  { view: 'portfolio', label: 'Portfolio Compare' },
]

function stepStatusClass(status: string) {
  if (status === 'complete') return 'sidebar-step--done'
  if (status === 'in_progress' || status === 'ready') return 'sidebar-step--active'
  if (status === 'blocked') return 'sidebar-step--blocked'
  return ''
}

// Per-step sub-label text matching the design handoff spec.
// Keys align with monthlyCloseSteps id values.
const STEP_SUBLABELS: Record<string, { done: string; active: string; pending: string }> = {
  baseline:  { done: 'Baseline locked',       active: 'Setting up baseline',  pending: 'Not started' },
  wbs:       { done: 'WBS imported',           active: 'Updating WBS',         pending: 'Awaiting baseline' },
  reconcile: { done: 'Posted & locked',        active: 'Drafting accruals',    pending: 'Awaiting period open' },
  vowd:      { done: 'EVM reviewed',           active: 'Reviewing VOWD',       pending: 'Awaiting accruals' },
  changes:   { done: 'Rev C locked',           active: 'Editing Rev C',        pending: 'Awaiting accruals' },
  forecast:  { done: 'Rev 4 run complete',     active: 'Running forecast',     pending: 'Ready to run' },
  submit:    { done: 'Approved',               active: 'Awaiting Director sign-off', pending: 'Awaiting forecast run' },
  reports:   { done: 'Reports exported',       active: 'Generating reports',   pending: 'Awaiting approval' },
}

function stepSubLabel(entry: CloseStepProgress, isActiveStep: boolean): string {
  if (entry.status === 'blocked') return entry.blockers[0] ?? 'Blocked'
  const labels = STEP_SUBLABELS[entry.step.id]
  if (!labels) {
    if (entry.status === 'complete') return 'Complete'
    if (isActiveStep) return 'In progress'
    return 'Pending'
  }
  if (entry.status === 'complete') return labels.done
  if (isActiveStep) return entry.blockers.length > 0 ? entry.blockers[0]! : labels.active
  return labels.pending
}

interface AppSidebarProps {
  state: ProjectState
  backendEnabled: boolean
  syncing: boolean
  onReconnect?: () => void
  onSearchClick?: () => void
}

export function AppSidebar({ state, backendEnabled, syncing, onReconnect, onSearchClick }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const closeFocus = isCloseFlowRoute(location.pathname)
  const activeView = viewFromPath(location.pathname)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => ({
    ...defaultCollapsedGroups,
    ...(closeFocus ? { 'Monthly control cycle': false } : {}),
  }))
  const [catalogOpen, setCatalogOpen] = useState(false)

  const closeEval = useMemo(() => evaluateMonthlyClose(state), [state])

  const connectionMode = syncing ? 'syncing' : backendEnabled ? 'live' : 'local'

  function go(view: NavView) {
    navigate(pathForView(view))
  }

  function isActivePath(path: string) {
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }))
  }

  const lastStepOrder = closeEval.steps.length

  return (
    <aside className="sidebar">

      {/* 1. Brand row */}
      <div className="brand">
        <div className="brand-mark">PC</div>
        <div>
          <p>Project Controls</p>
          <span>{state.meta.name}</span>
        </div>
      </div>

      {/* 2. Connection chip */}
      <div className="sidebar-status" data-testid="sidebar-status">
        <span className={`sidebar-status-dot ${statusDot[connectionMode]}`} aria-hidden />
        <div className="sidebar-status-copy">
          <strong>{syncing ? 'Saving…' : backendEnabled ? 'Connected to API' : 'Offline mode'}</strong>
          <span>{backendEnabled ? 'Changes persist on server' : 'Using browser storage'}</span>
        </div>
        {!backendEnabled && onReconnect && (
          <button className="sidebar-reconnect" type="button" onClick={() => void onReconnect()}>
            Reconnect
          </button>
        )}
      </div>

      {/* 3. Period progress + workflow stepper */}
      <div className="sidebar-period">
        <div className="sidebar-period-row">
          <span className="sidebar-period-label">{closeEval.periodLabel}</span>
          <span className="sidebar-period-pct">{closeEval.percentComplete}%</span>
        </div>

        <button
          type="button"
          className={isActivePath(monthlyClosePath) ? 'sidebar-close-btn sidebar-close-btn--active' : 'sidebar-close-btn'}
          onClick={() => navigate(monthlyClosePath)}
          data-testid="nav-monthly-close"
        >
          <span className="sidebar-close-btn-label">
            <span>Close workspace</span>
            <span className="sidebar-close-btn-arrow">→</span>
          </span>
          <span className="sidebar-close-track">
            <span className="sidebar-close-fill" style={{ width: `${closeEval.percentComplete}%` }} />
          </span>
        </button>

        {/* 4. Workflow stepper */}
        <ol className="sidebar-steps" aria-label="Close steps">
          {closeEval.steps.map((entry) => {
            const path = pathForView(entry.step.view)
            const routeActive = isActivePath(path)
            const isDone = entry.status === 'complete'
            const isActiveStep = entry.status === 'in_progress' || entry.status === 'ready' || routeActive
            const isGatePending = entry.step.order === lastStepOrder && !isDone && !isActiveStep && entry.status !== 'blocked'
            return (
              <li key={entry.step.id}>
                <button
                  type="button"
                  className={`sidebar-step ${stepStatusClass(entry.status)}${routeActive ? ' active' : ''}`}
                  onClick={() => navigate(path)}
                >
                  <span className={`sidebar-step-order${isGatePending ? ' sidebar-step-order--gate' : ''}`}>
                    {isDone ? '✓' : isGatePending ? '!' : entry.step.order}
                  </span>
                  <span className="sidebar-step-copy">
                    <span>{entry.step.title}</span>
                    <small>{stepSubLabel(entry, isActiveStep)}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {/* 5. Search all modules */}
      <button
        type="button"
        className="sidebar-search-btn"
        onClick={onSearchClick}
      >
        <span>Search all modules</span>
        <kbd>⌘K</kbd>
      </button>

      {/* 6. Pinned */}
      <div className="sidebar-pinned">
        <span className="sidebar-section-label">Pinned</span>
        <ul className="sidebar-pinned-list">
          {pinnedViews.map((item) => (
            <li key={item.view}>
              <button
                type="button"
                className={activeView === item.view ? 'sidebar-link active' : 'sidebar-link'}
                onClick={() => go(item.view)}
              >
                <span className="sidebar-link-title">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Module catalog (secondary, collapsed by default) */}
      <div className="sidebar-section">
        <button
          type="button"
          className="sidebar-catalog-toggle"
          onClick={() => setCatalogOpen((open) => !open)}
          aria-expanded={catalogOpen}
        >
          <span>{catalogOpen ? 'Hide module library' : 'Browse all modules'}</span>
          <span className="sidebar-catalog-chevron">{catalogOpen ? '▾' : '▸'}</span>
        </button>

        {catalogOpen && (
          <>
            <button
              type="button"
              className={isActivePath('/exports') ? 'sidebar-link active' : 'sidebar-link'}
              onClick={() => navigate('/exports')}
            >
              <span className="sidebar-link-title">Export centre</span>
              <span className="sidebar-link-meta">PDF &amp; leadership packs</span>
            </button>

            <button
              type="button"
              className={isActivePath(costControlLogPath) ? 'sidebar-link active' : 'sidebar-link'}
              onClick={() => navigate(costControlLogPath)}
              data-testid="nav-cost-control-logs"
            >
              <span className="sidebar-link-title">{costControlLogCount} control logs</span>
              <span className="sidebar-link-meta">Budget · claims · FX · lessons…</span>
            </button>

            {visibleNavGroups.map((group) => (
              <div className={`sidebar-group ${collapsedGroups[group.group] ? 'is-collapsed' : ''}`} key={group.group}>
                <button type="button" className="sidebar-group-head" onClick={() => toggleGroup(group.group)}>
                  <span>{group.group}</span>
                  <span className="sidebar-group-count">{group.items.length}</span>
                </button>
                {!collapsedGroups[group.group] && (
                  <ul className="sidebar-group-list">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={activeView === item.id ? 'sidebar-link active' : 'sidebar-link'}
                          onClick={() => go(item.id)}
                        >
                          <span className="sidebar-link-title">{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {backendEnabled && (
              <div className="sidebar-group">
                <button type="button" className="sidebar-group-head" onClick={() => toggleGroup('Administration')}>
                  <span>Administration</span>
                  <span className="sidebar-group-count">{visibleAdminLinks.length}</span>
                </button>
                {!collapsedGroups['Administration'] && (
                  <ul className="sidebar-group-list">
                    {visibleAdminLinks.map((link) => (
                      <li key={link.path}>
                        <button
                          type="button"
                          className={isActivePath(link.path) ? 'sidebar-link active' : 'sidebar-link'}
                          onClick={() => navigate(link.path)}
                        >
                          <span className="sidebar-link-title">{link.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 7. User footer */}
      <div className="sidebar-user-footer">
        <div className="sidebar-avatar">JA</div>
        <div className="sidebar-user-copy">
          <span className="sidebar-user-name">J. Adeyemi</span>
          <span className="sidebar-user-role">Cost Controller</span>
        </div>
      </div>

    </aside>
  )
}
