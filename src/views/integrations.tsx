import { useState } from 'react'
import {
  connectorLabels,
  runConnectorSync,
  testConnectorConnection,
  type ConnectorConfig,
  type SyncTarget,
} from '../integrations/connectors'
import { useProjectStore } from '../store/projectStore'

const syncTargetLabels: Record<SyncTarget, string> = {
  wbs: 'WBS structure',
  changes: 'Change register',
  cost_sheet: 'Cost sheet actuals',
  reports: 'Contractor reports',
}

export function IntegrationsView() {
  const { state, dispatch } = useProjectStore()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function updateConnector(id: string, patch: Partial<ConnectorConfig>) {
    const current = state.connectors.find((item) => item.id === id)
    if (!current) {
      return
    }

    dispatch({ type: 'UPDATE_CONNECTOR', payload: { ...current, ...patch } })
  }

  function toggleSyncTarget(id: string, target: SyncTarget) {
    const current = state.connectors.find((item) => item.id === id)
    if (!current) {
      return
    }

    const syncTargets = current.syncTargets.includes(target)
      ? current.syncTargets.filter((item) => item !== target)
      : [...current.syncTargets, target]

    updateConnector(id, { syncTargets })
  }

  async function handleTest(config: ConnectorConfig) {
    setBusyId(config.id)
    setMessage(null)
    const result = await testConnectorConnection(config)
    setMessage(result.message)
    setBusyId(null)
  }

  async function handleSync(config: ConnectorConfig) {
    setBusyId(config.id)
    setMessage(null)

    try {
      const { job, patch } = await runConnectorSync(config, state)
      dispatch({ type: 'ADD_SYNC_JOB', payload: job })
      if (patch.reports) {
        dispatch({ type: 'SET_REPORTS', payload: patch.reports })
      }
      dispatch({
        type: 'UPDATE_CONNECTOR',
        payload: {
          ...config,
          lastSyncAt: job.completedAt,
          lastSyncStatus: 'success',
          lastSyncMessage: job.message,
        },
      })
      setMessage(job.message)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Sync failed'
      dispatch({
        type: 'UPDATE_CONNECTOR',
        payload: {
          ...config,
          lastSyncStatus: 'failed',
          lastSyncMessage: text,
        },
      })
      setMessage(text)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="view-stack">
      {message && (
        <section className="panel">
          <p>{message}</p>
        </section>
      )}

      {state.connectors.map((connector) => (
        <section key={connector.id} className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">{connectorLabels[connector.type]}</span>
              <h3>{connector.name}</h3>
            </div>
            <span className={`badge badge-${connector.lastSyncStatus === 'success' ? 'good' : connector.lastSyncStatus === 'failed' ? 'risk' : 'watch'}`}>
              {connector.lastSyncStatus ?? 'never'}
            </span>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={connector.enabled}
                onChange={(event) => updateConnector(connector.id, { enabled: event.target.checked })}
              />
            </label>
            <label className="field">
              <span>Auth method</span>
              <select
                value={connector.authMethod}
                onChange={(event) =>
                  updateConnector(connector.id, {
                    authMethod: event.target.value as ConnectorConfig['authMethod'],
                  })
                }
              >
                <option value="oauth2">OAuth 2.0</option>
                <option value="api_key">API key</option>
                <option value="connection_string">Connection string</option>
              </select>
            </label>
            <label className="field field-wide">
              <span>Endpoint</span>
              <input
                type="text"
                value={connector.endpoint}
                onChange={(event) => updateConnector(connector.id, { endpoint: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Tenant / account ID</span>
              <input
                type="text"
                value={connector.tenantId}
                onChange={(event) => updateConnector(connector.id, { tenantId: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Client / user ID</span>
              <input
                type="text"
                value={connector.clientId}
                onChange={(event) => updateConnector(connector.id, { clientId: event.target.value })}
              />
            </label>
          </div>

          <div className="panel-subheader">
            <span className="eyebrow">Sync targets</span>
          </div>
          <div className="chip-row">
            {(Object.keys(syncTargetLabels) as SyncTarget[]).map((target) => (
              <label key={target} className="chip-toggle">
                <input
                  type="checkbox"
                  checked={connector.syncTargets.includes(target)}
                  onChange={() => toggleSyncTarget(connector.id, target)}
                />
                {syncTargetLabels[target]}
              </label>
            ))}
          </div>

          <div className="panel-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={busyId === connector.id}
              onClick={() => handleTest(connector)}
            >
              Test connection
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busyId === connector.id}
              onClick={() => handleSync(connector)}
            >
              Run sync
            </button>
          </div>

          <p className="muted">
            Last sync: {connector.lastSyncAt ?? 'Never'} — {connector.lastSyncMessage ?? 'No message'}
          </p>
        </section>
      ))}

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Sync history</span>
            <h3>Recent jobs</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Connector</th>
                <th>Status</th>
                <th>Records</th>
                <th>Completed</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {state.syncJobs.length === 0 && (
                <tr>
                  <td colSpan={6}>No sync jobs yet.</td>
                </tr>
              )}
              {state.syncJobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{state.connectors.find((item) => item.id === job.connectorId)?.name ?? job.connectorId}</td>
                  <td><span className={`badge badge-${job.status === 'success' ? 'good' : 'risk'}`}>{job.status}</span></td>
                  <td>{job.recordsImported}</td>
                  <td>{new Date(job.completedAt).toLocaleString()}</td>
                  <td>{job.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
