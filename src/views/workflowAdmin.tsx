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
    <section className="panel-stack" data-testid="workflow-admin">
      <MonthlyCloseRedirectNote />
      <header className="panel-header">
        <div>
          <p className="eyebrow">Enterprise workflows</p>
          <h1>Workflow administration</h1>
          <p className="muted">Review approval chains, SLAs, and temporary delegations.</p>
        </div>
        <Link className="ghost-button" to="/admin/governance">
          Governance
        </Link>
      </header>

      {!backendEnabled && (
        <p className="callout">Connect to the API to manage server-backed workflow delegations.</p>
      )}

      {message && <p className="callout">{message}</p>}

      <article className="panel">
        <h2>Configured workflows</h2>
        <div className="table-scroll">
          <table className="data-table">
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
        <h2>SLA hints</h2>
        <ul className="plain-list">
          <li>Forecast approval: submit by T+3 business days after month-end</li>
          <li>Change board: decision within 5 business days of submission</li>
          <li>Monthly close: all gates green before forecast package submission</li>
        </ul>
      </article>

      <article className="panel">
        <h2>Delegations</h2>
        <form className="form-grid" onSubmit={(event) => void submitDelegation(event)}>
          <label>
            Workflow
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
          <label>
            From user
            <input value={form.fromUserId} onChange={(event) => setForm((prev) => ({ ...prev, fromUserId: event.target.value }))} />
          </label>
          <label>
            To user
            <input value={form.toUserId} onChange={(event) => setForm((prev) => ({ ...prev, toUserId: event.target.value }))} />
          </label>
          <label>
            Until
            <input type="date" value={form.until} onChange={(event) => setForm((prev) => ({ ...prev, until: event.target.value }))} />
          </label>
          <button className="primary-button" type="submit" disabled={!backendEnabled}>
            Save delegation
          </button>
        </form>

        {delegations.length > 0 && (
          <ul className="plain-list">
            {delegations.map((row) => (
              <li key={row.id}>
                {row.workflowId}: {row.fromUserId} → {row.toUserId} until {row.until}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}
