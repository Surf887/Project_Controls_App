import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createWorkflowDelegation,
  fetchWorkflowDelegations,
  fetchWorkflows,
  type WorkflowDelegation,
  type WorkflowDefinition,
} from '../api/client'
import { useProjectStore } from '../store/projectStore'
import { MonthlyCloseRedirectNote } from './monthlyClose'

export function WorkflowAdminView() {
  const { backendEnabled, state } = useProjectStore()
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [delegations, setDelegations] = useState<WorkflowDelegation[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({
    workflowId: 'forecast-approval',
    fromUserId: 'u-approver',
    toUserId: 'u-controller',
    until: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  })

  useEffect(() => {
    if (!backendEnabled) {
      return
    }
    void Promise.all([fetchWorkflows(), fetchWorkflowDelegations()])
      .then(([wf, del]) => {
        setWorkflows(wf)
        setDelegations(del)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Failed to load workflows'))
  }, [backendEnabled])

  async function submitDelegation(event: React.FormEvent) {
    event.preventDefault()
    if (!backendEnabled) {
      return
    }
    try {
      const record = await createWorkflowDelegation({
        ...form,
        projectId: state.meta.id,
      })
      setDelegations((prev) => [record, ...prev])
      setMessage('Delegation saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delegation failed')
    }
  }

  return (
    <div className="view-stack" data-testid="workflow-admin">
      <MonthlyCloseRedirectNote />
      <div className="topbar">
        <div>
          <span className="eyebrow">Enterprise workflows</span>
          <h1>Workflow administration</h1>
          <p className="muted">Review approval chains, SLAs, and temporary delegations.</p>
        </div>
        <div className="topbar-actions">
          <Link className="ghost-button" to="/admin/governance">
            Governance
          </Link>
        </div>
      </div>

      {!backendEnabled && (
        <p className="callout">Connect to the API to manage server-backed workflow delegations.</p>
      )}

      {message && <p className="callout">{message}</p>}

      <article className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Approval chains</span>
            <h3>Configured workflows</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Entity</th>
                <th>Statuses</th>
                <th>Transitions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => (
                <tr key={workflow.id}>
                  <td>{workflow.name}</td>
                  <td>{workflow.entityType}</td>
                  <td>{workflow.statuses.join(' → ')}</td>
                  <td>{workflow.transitions.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Service levels</span>
            <h3>SLA hints</h3>
          </div>
        </div>
        <ul className="plain-list">
          <li>Forecast approval: submit by T+3 business days after month-end</li>
          <li>Change board: decision within 5 business days of submission</li>
          <li>Monthly close: all gates green before forecast package submission</li>
        </ul>
      </article>

      <article className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Temporary assignments</span>
            <h3>Delegations</h3>
          </div>
        </div>
        <form onSubmit={(event) => void submitDelegation(event)}>
          <div className="form-grid">
            <label className="field">
              <span>Workflow</span>
              <select
                value={form.workflowId}
                onChange={(event) => setForm((prev) => ({ ...prev, workflowId: event.target.value }))}
              >
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>From user</span>
              <input value={form.fromUserId} onChange={(event) => setForm((prev) => ({ ...prev, fromUserId: event.target.value }))} />
            </label>
            <label className="field">
              <span>To user</span>
              <input value={form.toUserId} onChange={(event) => setForm((prev) => ({ ...prev, toUserId: event.target.value }))} />
            </label>
            <label className="field">
              <span>Until</span>
              <input type="date" value={form.until} onChange={(event) => setForm((prev) => ({ ...prev, until: event.target.value }))} />
            </label>
          </div>
          <div className="panel-actions">
            <button className="primary-button" type="submit" disabled={!backendEnabled}>
              Save delegation
            </button>
          </div>
        </form>

        {delegations.length > 0 && (
          <ul className="plain-list" style={{ marginTop: '16px' }}>
            {delegations.map((row) => (
              <li key={row.id}>
                {row.workflowId}: {row.fromUserId} → {row.toUserId} until {row.until}
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  )
}
