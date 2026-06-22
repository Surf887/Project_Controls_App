import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { evaluateMonthlyClose } from '../engine/monthlyCloseProgress'
import { defaultCollapsedGroups, navGroups, type NavView } from '../data/navigationModel'
import { isCloseFlowRoute } from '../data/monthlyCloseSteps'
import { costControlLogCount, costControlLogPath } from '../data/costControlLogs'
import { monthlyClosePath, pathForView, viewFromPath } from '../routes/viewPaths'
import type { ProjectState } from '../store/types'

const adminLinks = [
  { label: 'PMO dashboard', path: '/admin/pmo' },
  { label: 'Workflow admin', path: '/admin/workflows' },
  { label: 'Connectors', path: pathForView('integrations') },
] as const

const statusDot: Record<'live' | 'local' | 'syncing', string> = {
  live: 'sidebar-status-dot--live',
  local: 'sidebar-status-dot--local',
  syncing: 'sidebar-status-dot--syncing',
}

function stepStatusClass(status: string) {
  if (status === 'complete') return 'sidebar-step--done'
  if (status === 'in_progress' || status === 'ready') return 'sidebar-step--active'
  if (status === 'blocked') return 'sidebar-step--blocked'
  return ''
}

interface AppSidebarProps {
  state: ProjectState
  backendEnabled: boolean
  syncing: boolean
  onReconnect?: () => void
}

export function AppSidebar({ state, backendEnabled, syncing, onReconnect }: AppSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const closeFocus = isCloseFlowRoute(location.pathname)
  const activeView = viewFromPath(location.pathname)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => ({
    ...defaultCollapsedGroups,
    ...(closeFocus ? { 'Monthly control cycle': false } : {}),
  }))
  const [catalogOpen, setCatalogOpen] = useState(!closeFocus)

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

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-mark">PC</div>
          <div>
            <p>Project Controls</p>
            <span>{state.meta.name}</span>
          </div>
        </div>

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
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        <section className="sidebar-section">
          <p className="sidebar-section-label">Monthly close</p>
          <button
            type="button"
            className={isActivePath(monthlyClosePath) ? 'sidebar-link sidebar-link--primary active' : 'sidebar-link sidebar-link--primary'}
            onClick={() => navigate(monthlyClosePath)}
            data-testid="nav-monthly-close"
          >
            <span className="sidebar-link-title">Close workspace</span>
            <span className="sidebar-link-meta">{closeEval.percentComplete}% complete</span>
          </button>

          <ol className="sidebar-steps" aria-label="Close steps">
            {closeEval.steps.map((entry) => {
              const path = pathForView(entry.step.view)
              const active = isActivePath(path)
              return (
                <li key={entry.step.id}>
                  <button
                    type="button"
                    className={`sidebar-step ${stepStatusClass(entry.status)}${active ? ' active' : ''}`}
                    onClick={() => navigate(path)}
                  >
                    <span className="sidebar-step-order">{entry.step.order}</span>
                    <span className="sidebar-step-copy">
                      <span>{entry.step.title}</span>
                      {entry.status === 'blocked' && entry.blockers[0] && (
                        <small>{entry.blockers[0]}</small>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

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
        </section>

        <section className="sidebar-section">
          <button
            type="button"
            className="sidebar-catalog-toggle"
            onClick={() => setCatalogOpen((open) => !open)}
            aria-expanded={catalogOpen}
          >
            <span>{catalogOpen ? 'Hide module library' : 'Browse all modules'}</span>
            <span className="sidebar-catalog-chevron">{catalogOpen ? '▾' : '▸'}</span>
          </button>

          {catalogOpen &&
            navGroups.map((group) => (
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
        </section>

        {backendEnabled && (
          <section className="sidebar-section">
            <p className="sidebar-section-label">Administration</p>
            <ul className="sidebar-group-list">
              {adminLinks.map((link) => (
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
          </section>
        )}
      </nav>
    </aside>
  )
}
