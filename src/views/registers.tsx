import { useMemo, useState } from 'react'
import {
  changeMechanismMeta,
  riskBand,
  riskScore,
  type ChangeMechanism,
  type ChangeStatus,
  type CostClass,
  type Impact,
  type Likelihood,
  type Phase,
  type RiskItem,
} from '../data/registers'
import { createChangeRequest } from '../engine/governance'
import { useProjectStore } from '../store/projectStore'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    signDisplay: value === 0 ? 'never' : 'auto',
  }).format(value)
}

function bandClass(band: 'low' | 'medium' | 'high' | 'critical') {
  switch (band) {
    case 'critical':
    case 'high':
      return 'badge-risk'
    case 'medium':
      return 'badge-watch'
    default:
      return 'badge-good'
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'approved':
    case 'closed':
    case 'realised':
      return 'badge-good'
    case 'rejected':
    case 'critical':
      return 'badge-risk'
    case 'open':
    case 'pending':
    case 'submitted':
    case 'under_review':
    case 'in_progress':
    case 'mitigating':
    case 'on_hold':
      return 'badge-watch'
    default:
      return 'badge-watch'
  }
}

function statusLabel(value: string) {
  return value.replace(/_/g, ' ')
}

// 5x5 risk heatmap with optional pre/post mitigation overlays.
function RiskHeatmap({ risks }: { risks: RiskItem[] }) {
  const cells: { likelihood: Likelihood; impact: Impact; pre: number; post: number }[] = []
  for (let likelihood = 5; likelihood >= 1; likelihood--) {
    for (let impact = 1; impact <= 5; impact++) {
      const pre = risks.filter((r) => r.preMitigationLikelihood === likelihood && r.preMitigationImpact === impact).length
      const post = risks.filter((r) => r.postMitigationLikelihood === likelihood && r.postMitigationImpact === impact).length
      cells.push({ likelihood: likelihood as Likelihood, impact: impact as Impact, pre, post })
    }
  }

  return (
    <div className="risk-heatmap">
      <div className="risk-heatmap-yaxis"><span>Likelihood</span></div>
      <div className="risk-heatmap-grid">
        {cells.map((cell) => {
          const score = riskScore(cell.likelihood, cell.impact)
          const band = riskBand(score)
          return (
            <div key={`${cell.likelihood}-${cell.impact}`} className={`heat-cell band-${band}`}>
              <small>{cell.likelihood}×{cell.impact}</small>
              <div className="heat-counts">
                <span title="Pre-mitigation count">{cell.pre}</span>
                <em title="Post-mitigation count">→ {cell.post}</em>
              </div>
            </div>
          )
        })}
      </div>
      <div className="risk-heatmap-xaxis"><span>Impact →</span></div>
    </div>
  )
}

const phases: Phase[] = ['Engineering', 'Procurement', 'Construction', 'Commissioning', 'Cross-phase']

function PhaseFilter({ value, onChange }: { value: Phase | 'all'; onChange: (next: Phase | 'all') => void }) {
  return (
    <label className="filter-inline">
      <span>Phase</span>
      <select className="select-input" value={value} onChange={(e) => onChange(e.target.value as Phase | 'all')}>
        <option value="all">All phases</option>
        {phases.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  )
}

export function RiskOpportunityRegister() {
  const { state } = useProjectStore()
  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all')
  const filteredRisks = useMemo(
    () => state.risks.filter((r) => phaseFilter === 'all' || r.phase === phaseFilter),
    [phaseFilter, state.risks],
  )
  const filteredOpps = useMemo(
    () => state.opportunities.filter((o) => phaseFilter === 'all' || o.phase === phaseFilter),
    [phaseFilter, state.opportunities],
  )

  const totalRiskExposure = filteredRisks.reduce((sum, r) => sum + r.costExposureUsd, 0)
  const totalOppValue = filteredOpps.reduce((sum, o) => sum + o.costSavingUsd, 0)
  const scheduleExposureDays = filteredRisks.reduce((sum, r) => sum + r.scheduleExposureDays, 0)
  const scheduleSavingDays = filteredOpps.reduce((sum, o) => sum + o.scheduleSavingDays, 0)

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <RegisterTile label="Risk cost exposure" value={formatUsd(totalRiskExposure)} detail={`${filteredRisks.length} active risks`} tone="risk" />
        <RegisterTile label="Opportunity value" value={formatUsd(totalOppValue)} detail={`${filteredOpps.length} opportunities`} />
        <RegisterTile label="Schedule exposure" value={`+${scheduleExposureDays} d`} detail="aggregated worst-case days" tone="risk" />
        <RegisterTile label="Schedule saving potential" value={`-${scheduleSavingDays} d`} detail="aggregated recovery days" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">5×5 risk heatmap (pre → post mitigation)</span>
            <h3>ISO 31000 risk matrix</h3>
          </div>
          <PhaseFilter value={phaseFilter} onChange={setPhaseFilter} />
        </div>
        <RiskHeatmap risks={state.risks} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Risk register</span>
            <h3>Threats with mitigation, contingency, and exposure</h3>
          </div>
          <span className="badge badge-risk">{filteredRisks.length} risks</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title / cause</th>
                <th>Phase</th>
                <th>Pre score</th>
                <th>Post score</th>
                <th>Cost exposure</th>
                <th>Days</th>
                <th>Response / KRI</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRisks.map((r) => {
                const pre = riskScore(r.preMitigationLikelihood, r.preMitigationImpact)
                const post = riskScore(r.postMitigationLikelihood, r.postMitigationImpact)
                return (
                  <tr key={r.id}>
                    <td><strong>{r.id}</strong></td>
                    <td><strong>{r.title}</strong><small>{r.cause}</small></td>
                    <td>{r.phase}</td>
                    <td><span className={`badge ${bandClass(riskBand(pre))}`}>{pre}</span></td>
                    <td><span className={`badge ${bandClass(riskBand(post))}`}>{post}</span></td>
                    <td>{formatUsd(r.costExposureUsd)}</td>
                    <td>{r.scheduleExposureDays}</td>
                    <td>{r.mitigation}<small>{r.responseStrategy} · KRI: {r.kri}</small></td>
                    <td>{r.owner}</td>
                    <td><span className={`badge ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Opportunity register</span>
            <h3>Beneficial outcomes to enable</h3>
          </div>
          <span className="badge badge-good">{filteredOpps.length} opportunities</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Phase</th>
                <th>Score</th>
                <th>Cost saving</th>
                <th>Schedule saving</th>
                <th>Enhancement</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredOpps.map((o) => {
                const score = riskScore(o.likelihood, o.impact)
                return (
                  <tr key={o.id}>
                    <td><strong>{o.id}</strong></td>
                    <td><strong>{o.title}</strong><small>{o.benefit}</small></td>
                    <td>{o.phase}</td>
                    <td><span className={`badge ${bandClass(riskBand(score))}`}>{score}</span></td>
                    <td>{formatUsd(o.costSavingUsd)}</td>
                    <td>-{o.scheduleSavingDays} d</td>
                    <td>{o.enhancement}</td>
                    <td>{o.owner}</td>
                    <td><span className={`badge ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function OpportunityRegister() {
  const { state } = useProjectStore()
  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all')
  const filteredOpps = useMemo(
    () => state.opportunities.filter((o) => phaseFilter === 'all' || o.phase === phaseFilter),
    [phaseFilter, state.opportunities],
  )

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Opportunities log</span>
            <h3>Upside actions with realisation status</h3>
          </div>
          <PhaseFilter value={phaseFilter} onChange={setPhaseFilter} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Phase</th>
                <th>Score</th>
                <th>Cost saving</th>
                <th>Schedule saving</th>
                <th>Enhancement</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredOpps.map((o) => {
                const score = riskScore(o.likelihood, o.impact)
                return (
                  <tr key={o.id}>
                    <td><strong>{o.id}</strong></td>
                    <td><strong>{o.title}</strong><small>{o.benefit}</small></td>
                    <td>{o.phase}</td>
                    <td><span className={`badge ${bandClass(riskBand(score))}`}>{score}</span></td>
                    <td>{formatUsd(o.costSavingUsd)}</td>
                    <td>-{o.scheduleSavingDays} d</td>
                    <td>{o.enhancement}</td>
                    <td>{o.owner}</td>
                    <td><span className={`badge ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function IssueRegister() {
  const { state } = useProjectStore()
  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all')
  const filtered = useMemo(
    () => state.issues.filter((i) => phaseFilter === 'all' || i.phase === phaseFilter),
    [phaseFilter, state.issues],
  )

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Issue register</span>
            <h3>Active problems with cost / schedule impact</h3>
          </div>
          <PhaseFilter value={phaseFilter} onChange={setPhaseFilter} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title / resolution</th>
                <th>Phase</th>
                <th>Severity</th>
                <th>Cost impact</th>
                <th>Days</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.id}</strong></td>
                  <td><strong>{i.title}</strong><small>{i.resolution}</small></td>
                  <td>{i.phase}</td>
                  <td><span className={`badge ${statusBadge(i.severity)}`}>{i.severity}</span></td>
                  <td>{formatUsd(i.costImpactUsd)}</td>
                  <td>{i.scheduleImpactDays}</td>
                  <td>{i.owner}</td>
                  <td>{i.dueDate}</td>
                  <td><span className={`badge ${statusBadge(i.status)}`}>{statusLabel(i.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function ChangeRegister() {
  const { state, dispatch } = useProjectStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    phase: 'Construction' as Phase,
    mechanism: 'scope_change' as ChangeMechanism,
    costImpactUsd: 0,
    scheduleImpactDays: 0,
    affectedWbs: 'A.02',
    approver: 'Project Director',
    contractor: 'Owner Direct',
  })

  const filtered = useMemo(
    () => state.changes.filter((c) => statusFilter === 'all' || c.status === statusFilter),
    [statusFilter, state.changes],
  )

  const selected = state.changes.find((c) => c.id === selectedId)

  const totals = state.changes.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + c.costImpactUsd
      return acc
    },
    {} as Record<string, number>,
  )

  function createChange() {
    const change = createChangeRequest(
      {
        title: draft.title,
        phase: draft.phase,
        type: 'Scope',
        mechanism: draft.mechanism,
        costClass: 'CapEx' as CostClass,
        description: draft.description,
        raisedBy: 'You',
        costImpactUsd: draft.costImpactUsd,
        scheduleImpactDays: draft.scheduleImpactDays,
        probability: 0.5,
        affectedWbs: [draft.affectedWbs],
        rationale: draft.description,
        approver: draft.approver,
        contractor: draft.contractor,
      },
      'You',
    )
    dispatch({ type: 'CREATE_CHANGE', payload: change })
    setShowForm(false)
    setSelectedId(change.id)
    setDraft({ title: '', description: '', phase: 'Construction', mechanism: 'scope_change', costImpactUsd: 0, scheduleImpactDays: 0, affectedWbs: 'A.02', approver: 'Project Director', contractor: 'Owner Direct' })
  }

  return (
    <div className="view-stack">
      <div className="topbar">
        <div>
          <span className="eyebrow">Change governance</span>
          <h1>Change register</h1>
        </div>
      </div>
      <section className="metric-grid">
        <RegisterTile label="Approved" value={formatUsd(totals.approved ?? 0)} detail="Locked in forecast" />
        <RegisterTile label="Pending" value={formatUsd(totals.pending ?? 0)} detail="Awaiting decision" tone="risk" />
        <RegisterTile label="Under review" value={formatUsd(totals.under_review ?? 0)} detail="In change board" />
        <RegisterTile label="Rejected" value={formatUsd(totals.rejected ?? 0)} detail="Excluded from forecast" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Change mechanism</span>
            <h3>Budget vs forecast-only — fixes EcoSys conflation</h3>
          </div>
        </div>
        <p className="muted">
          Scope and budget changes move the current budget when approved. Forecast variance records monthly performance
          trends without altering the approved budget baseline.
        </p>
        <div className="workfront-list">
          {(Object.keys(changeMechanismMeta) as ChangeMechanism[]).map((key) => (
            <article key={key} className="workfront-card">
              <div className="workfront-head">
                <div>
                  <strong>{changeMechanismMeta[key].label}</strong>
                  <small>{changeMechanismMeta[key].affectsBudget ? 'Moves current budget' : 'Forecast only'} · {changeMechanismMeta[key].affectsForecast ? 'Affects EAC' : 'No EAC impact'}</small>
                </div>
              </div>
              <p className="muted">{changeMechanismMeta[key].guidance}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">New change request</span>
            <h3>Raise and submit for approval</h3>
          </div>
          <button type="button" className="ghost-button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New change request'}
          </button>
        </div>
        {showForm && (
          <div className="form-grid">
            <label className="field field-wide"><span>Title</span><input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label className="field field-wide"><span>Description</span><input type="text" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <label className="field"><span>Phase</span><select value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value as Phase })}><option>Engineering</option><option>Procurement</option><option>Construction</option><option>Commissioning</option></select></label>
            <label className="field"><span>Mechanism</span><select value={draft.mechanism} onChange={(e) => setDraft({ ...draft, mechanism: e.target.value as ChangeMechanism })}>{(Object.keys(changeMechanismMeta) as ChangeMechanism[]).map((key) => (<option key={key} value={key}>{changeMechanismMeta[key].label}</option>))}</select></label>
            <label className="field field-wide"><span>{changeMechanismMeta[draft.mechanism].guidance}</span></label>
            <label className="field"><span>Cost impact USD</span><input type="number" value={draft.costImpactUsd} onChange={(e) => setDraft({ ...draft, costImpactUsd: Number(e.target.value) })} /></label>
            <label className="field"><span>Schedule days</span><input type="number" value={draft.scheduleImpactDays} onChange={(e) => setDraft({ ...draft, scheduleImpactDays: Number(e.target.value) })} /></label>
            <label className="field"><span>Affected WBS</span><input type="text" value={draft.affectedWbs} onChange={(e) => setDraft({ ...draft, affectedWbs: e.target.value })} /></label>
            <label className="field"><span>Approver</span><input type="text" value={draft.approver} onChange={(e) => setDraft({ ...draft, approver: e.target.value })} /></label>
            <div className="panel-actions">
              <button type="button" className="primary-button" disabled={!draft.title.trim()} onClick={createChange}>Create draft</button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Change register</span>
            <h3>Approval workflow tracking</h3>
          </div>
          <label className="filter-inline">
            <span>Status</span>
            <select className="select-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under review</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Mechanism</th>
                <th>Title / rationale</th>
                <th>Cost</th>
                <th>Approver</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setSelectedId(c.id)} className={selectedId === c.id ? 'row-active' : ''}>
                  <td><strong>{c.id}</strong></td>
                  <td><span className="badge badge-received">{changeMechanismMeta[c.mechanism ?? 'scope_change'].label}</span></td>
                  <td><strong>{c.title}</strong><small>{c.rationale}</small></td>
                  <td className={c.costImpactUsd < 0 ? 'metric-positive' : 'metric-negative'}>{formatUsd(c.costImpactUsd)}</td>
                  <td>{c.approver}</td>
                  <td><span className={`badge ${statusBadge(c.status)}`}>{statusLabel(c.status)}</span></td>
                  <td>
                    <div className="panel-actions">
                      {['draft', 'submitted', 'under_review', 'pending'].includes(c.status) && (
                        <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SUBMIT_CHANGE', payload: { changeId: c.id, actor: 'You', role: 'Change control' } }) }}>Submit</button>
                      )}
                      {['submitted', 'under_review', 'pending'].includes(c.status) && (
                        <>
                          <button type="button" className="primary-button" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DECIDE_CHANGE', payload: { changeId: c.id, decision: 'approved', actor: c.approver, role: 'Approver' } }) }}>Approve</button>
                          <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DECIDE_CHANGE', payload: { changeId: c.id, decision: 'rejected', actor: c.approver, role: 'Approver' } }) }}>Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Approval trail</span>
              <h3>{selected.id} — {selected.title}</h3>
              <p className="muted">{changeMechanismMeta[selected.mechanism ?? 'scope_change'].guidance}</p>
            </div>
          </div>
          <div className="workfront-list">
            {(selected.approvalHistory ?? []).length === 0 && <p className="muted">No approval steps recorded.</p>}
            {(selected.approvalHistory ?? []).map((step) => (
              <article key={step.id} className="workfront-card">
                <div className="workfront-head">
                  <div>
                    <strong>{step.action}</strong>
                    <small>{step.at} · {step.actor} ({step.role})</small>
                  </div>
                </div>
                {step.comment && <p className="muted">{step.comment}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function ActionRegister() {
  const { state } = useProjectStore()
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Action register</span>
            <h3>Open actions across the trust pipeline</h3>
          </div>
          <span className="badge badge-watch">{state.actions.length} actions</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Action</th>
                <th>Phase</th>
                <th>Owner</th>
                <th>Source</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.actions.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.id}</strong></td>
                  <td><strong>{a.title}</strong><small>{a.description}</small></td>
                  <td>{a.phase}</td>
                  <td>{a.owner}</td>
                  <td>{a.source}</td>
                  <td><span className={`badge ${statusBadge(a.priority)}`}>{a.priority}</span></td>
                  <td>{a.dueDate}</td>
                  <td><span className={`badge ${statusBadge(a.status)}`}>{statusLabel(a.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function DecisionRegister() {
  const { state } = useProjectStore()
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Decision log</span>
            <h3>Recorded project decisions and rationale</h3>
          </div>
          <span className="badge badge-good">{state.decisions.length} decisions</span>
        </div>
        <div className="decision-grid">
          {state.decisions.map((d) => (
            <article className="decision-card" key={d.id}>
              <span>{d.id} · {d.phase}</span>
              <h4>{d.title}</h4>
              <p>{d.decision} — {d.description}</p>
              <small>{d.rationale}</small>
              <div>
                <b>{d.decidedBy}</b>
                <em>{d.decidedAt}</em>
              </div>
              <div>
                <span className={`badge ${statusBadge(d.status)}`}>{statusLabel(d.status)}</span>
                <small>{formatUsd(d.cost)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export function ClaimsRegister() {
  const { state } = useProjectStore()
  const openClaims = state.claims.filter(
    (claim) => claim.status !== 'settled' && claim.status !== 'rejected',
  )
  const exposure = openClaims.reduce((sum, claim) => sum + claim.costExposureUsd, 0)

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <RegisterTile label="Open claims" value={String(openClaims.length)} detail="Contractor disputes in progress" />
        <RegisterTile label="Commercial exposure" value={formatUsd(exposure)} detail="Sum of open claim values" tone={exposure > 1_000_000 ? 'risk' : 'default'} />
        <RegisterTile label="Negotiating" value={String(state.claims.filter((c) => c.status === 'negotiating').length)} detail="Active settlement discussions" />
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Contract claims log</span>
            <h3>Contractor claims, disputes, entitlement, commercial exposure</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Contractor</th>
                <th>Contract</th>
                <th>WBS</th>
                <th>Exposure</th>
                <th>Entitlement</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.claims.map((claim) => (
                <tr key={claim.id}>
                  <td><strong>{claim.id}</strong></td>
                  <td><strong>{claim.title}</strong><small>{claim.description}</small></td>
                  <td>{claim.contractor}</td>
                  <td>{claim.contractRef}</td>
                  <td>{claim.wbs}</td>
                  <td>{formatUsd(claim.costExposureUsd)}</td>
                  <td>{claim.entitlementBasis}</td>
                  <td>{claim.owner}</td>
                  <td><span className={`badge ${statusBadge(claim.status)}`}>{statusLabel(claim.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function LessonsLearnedRegister() {
  const { state } = useProjectStore()
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Lessons learned</span>
            <h3>Captured for project, programme, and enterprise reuse</h3>
          </div>
          <span className="badge badge-watch">{state.lessons.length} entries</span>
        </div>
        <div className="lessons-grid">
          {state.lessons.map((l) => (
            <article className="lesson-card" key={l.id}>
              <div className="lesson-head">
                <span className={`badge ${l.category === 'What went wrong' ? 'badge-risk' : l.category === 'What went well' ? 'badge-good' : 'badge-watch'}`}>
                  {l.category}
                </span>
                <small>{l.phase} · {l.applicability}</small>
              </div>
              <h4>{l.title}</h4>
              <p>{l.description}</p>
              <strong>Recommendation:</strong>
              <p>{l.recommendation}</p>
              <small>{l.capturedBy} · {l.capturedAt} · {l.status}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function RegisterTile({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'risk' }) {
  return (
    <article className={tone === 'risk' ? 'metric-card risk' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
