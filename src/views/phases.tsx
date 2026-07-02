import { syncDeliverableEarned, syncWorkFrontEarned } from '../engine/rulesOfCredit'
import {
  invoicePipeline,
  reconcilePoInvoices,
  subcontractMetrics,
  summarizeContracts,
} from '../engine/procurementReconcile'
import { useProjectStore } from '../store/projectStore'
import { CostSheetGrid } from './EditableGrid'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function expeditingBadge(level: 'green' | 'amber' | 'red') {
  if (level === 'red') return 'badge-risk'
  if (level === 'amber') return 'badge-watch'
  return 'badge-good'
}

function statusBadge(status: string) {
  switch (status) {
    case 'complete':
    case 'on_track':
    case 'handed_over':
      return 'badge-good'
    case 'at_risk':
    case 'on_hold':
    case 'in_progress':
    case 'manufacturing':
    case 'inspection':
    case 'pre_commissioning':
    case 'commissioning':
    case 'mechanical_complete':
    case 'shipped':
    case 'site_received':
    case 'awarded':
    case 'requisitioned':
    case 'engineering':
      return 'badge-watch'
    case 'late':
    case 'open':
      return 'badge-risk'
    default:
      return 'badge-watch'
  }
}

function pretty(value: string) {
  return value.replace(/_/g, ' ')
}

export function EngineeringWorkspace() {
  const { state } = useProjectStore()
  const deliverables = state.deliverables
  const totalWeight = deliverables.reduce((sum, item) => sum + item.weightPercent, 0)
  const earnedWeight = deliverables.reduce((sum, item) => {
    const earned = syncDeliverableEarned(item, state.ruleOfCreditTemplates, state.progressCredits)
    return sum + (item.weightPercent * earned) / 100
  }, 0)

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <PhaseTile label="Deliverables tracked" value={deliverables.length.toString()} detail="Drawings and specs register" />
        <PhaseTile label="Weighted progress" value={`${totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100)}%`} detail="Earned vs planned weighting" />
        <PhaseTile label="Approved IFC" value={deliverables.filter((d) => d.status === 'approved').length.toString()} detail="Released for construction" />
        <PhaseTile label="In progress" value={deliverables.filter((d) => d.status === 'in_progress').length.toString()} detail="Under development" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Deliverables register</span>
            <h3>Engineering progress by weighted deliverable</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Discipline</th>
                <th>Weight %</th>
                <th>Planned</th>
                <th>Earned</th>
                <th>Due</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deliverables.map((item) => {
                const earned = syncDeliverableEarned(item, state.ruleOfCreditTemplates, state.progressCredits)
                return (
                <tr key={item.id}>
                  <td><strong>{item.number}</strong></td>
                  <td>{item.title}</td>
                  <td>{item.discipline}</td>
                  <td>{item.weightPercent}%</td>
                  <td>{item.plannedProgress}%</td>
                  <td className={earned < item.plannedProgress ? 'metric-negative' : 'metric-positive'}>{earned.toFixed(0)}%</td>
                  <td>{item.dueDate}</td>
                  <td>{item.owner}</td>
                  <td><span className={`badge ${statusBadge(item.status)}`}>{pretty(item.status)}</span></td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Phase cost sheet</span>
            <h3>Engineering-scoped WBS rows</h3>
          </div>
        </div>
        <CostSheetGrid phaseFilter="Engineering" />
      </section>
    </div>
  )
}

export function ProcurementWorkspace() {
  const { state } = useProjectStore()
  const { purchaseOrders, expeditingMilestones, contracts, rfqBids, invoices } = state
  const totalValue = purchaseOrders.reduce((sum, po) => sum + po.poValueUsd, 0)
  const totalInvoiced = purchaseOrders.reduce((sum, po) => sum + po.invoicedUsd, 0)
  const lateCount = purchaseOrders.filter((po) => po.expediting !== 'green').length
  const contractSummaries = summarizeContracts(contracts)
  const poReconciliation = reconcilePoInvoices(purchaseOrders, invoices)
  const pipeline = invoicePipeline(invoices)
  const reconciliationIssues = poReconciliation.filter((row) => row.status !== 'matched').length

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <PhaseTile label="PO portfolio value" value={formatUsd(totalValue)} detail={`${purchaseOrders.length} POs · ${contracts.filter((c) => c.status === 'active').length} active contracts`} />
        <PhaseTile label="Invoiced to date" value={formatUsd(totalInvoiced)} detail={`${((totalInvoiced / totalValue) * 100).toFixed(0)}% of PO value`} />
        <PhaseTile label="POs at risk" value={lateCount.toString()} detail="Amber or red expediting" tone={lateCount > 0 ? 'risk' : 'default'} />
        <PhaseTile label="Recon exceptions" value={reconciliationIssues.toString()} detail="PO vs invoice register" tone={reconciliationIssues > 0 ? 'risk' : 'default'} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Vendor master</span>
            <h3>Suppliers, subcontractors, and service contractors</h3>
          </div>
          <span className="badge badge-good">{state.vendors.length} vendors</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Country</th>
                <th>Currency</th>
                <th>Active contracts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.vendors.map((vendor) => (
                <tr key={vendor.id}>
                  <td><strong>{vendor.code}</strong></td>
                  <td>{vendor.name}</td>
                  <td>{vendor.type}</td>
                  <td>{vendor.country}</td>
                  <td>{vendor.currency}</td>
                  <td>{vendor.activeContracts}</td>
                  <td><span className={`badge ${vendor.status === 'active' ? 'badge-good' : vendor.status === 'watch' ? 'badge-watch' : 'badge-risk'}`}>{vendor.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Unifier flow</span>
            <h3>RFQ → Contract → PO → Invoice</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>RFQ</th>
                <th>Package</th>
                <th>Status</th>
                <th>Bids</th>
                <th>Est. value</th>
                <th>Awarded vendor</th>
                <th>Contract</th>
              </tr>
            </thead>
            <tbody>
              {rfqBids.map((rfq) => (
                <tr key={rfq.id}>
                  <td><strong>{rfq.rfqNumber}</strong><small>{rfq.title}</small></td>
                  <td>{rfq.packageName}</td>
                  <td><span className={`badge ${statusBadge(rfq.status)}`}>{pretty(rfq.status)}</span></td>
                  <td>{rfq.bidsReceived}/{rfq.vendorsInvited}</td>
                  <td>{formatUsd(rfq.estimatedValueUsd)}</td>
                  <td>{rfq.awardedVendor ?? '—'}</td>
                  <td>{rfq.contractId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Contract register</span>
            <h3>Executed agreements and utilization</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Vendor</th>
                <th>Value</th>
                <th>Committed</th>
                <th>Invoiced</th>
                <th>Utilization</th>
                <th>POs</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contractSummaries.map(({ contract, utilizationPct, invoiceGapUsd, openPoCount }) => (
                <tr key={contract.id}>
                  <td><strong>{contract.number}</strong><small>{contract.title}</small></td>
                  <td>{contract.vendor}</td>
                  <td>{formatUsd(contract.contractValueUsd)}</td>
                  <td>{formatUsd(contract.committedUsd)}</td>
                  <td>{formatUsd(contract.invoicedUsd)}</td>
                  <td>{utilizationPct.toFixed(0)}%</td>
                  <td>{openPoCount}</td>
                  <td><span className={`badge ${statusBadge(contract.status)}`}>{pretty(contract.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Purchase orders</span>
            <h3>Commitments, invoicing, and delivery health</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PO</th>
                <th>Description / vendor</th>
                <th>Category</th>
                <th>Currency</th>
                <th>PO value</th>
                <th>Invoiced</th>
                <th>Planned site</th>
                <th>Forecast site</th>
                <th>Status</th>
                <th>Expediting</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id}>
                  <td><strong>{po.id}</strong><small>{po.packageName}</small></td>
                  <td><strong>{po.description}</strong><small>{po.vendor}</small></td>
                  <td>{po.category}</td>
                  <td>{po.currency}{po.hedgedPct < 100 ? ` (${po.hedgedPct}% hedged)` : ''}</td>
                  <td>{formatUsd(po.poValueUsd)}</td>
                  <td>{formatUsd(po.invoicedUsd)}</td>
                  <td>{po.plannedSiteDate}</td>
                  <td className={po.forecastSiteDate > po.plannedSiteDate ? 'metric-negative' : 'metric-positive'}>{po.forecastSiteDate}</td>
                  <td><span className={`badge ${statusBadge(po.status)}`}>{pretty(po.status)}</span></td>
                  <td><span className={`badge ${expeditingBadge(po.expediting)}`}>{po.expediting}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Invoice register</span>
            <h3>Commitment vs invoice reconciliation</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>PO</th>
                <th>Contract</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><strong>{inv.number}</strong></td>
                  <td>{inv.poId}</td>
                  <td>{inv.contractId}</td>
                  <td>{inv.period}</td>
                  <td>{formatUsd(inv.amountUsd)}</td>
                  <td><span className={`badge ${inv.status === 'held' || inv.status === 'rejected' ? 'badge-risk' : inv.status === 'paid' ? 'badge-good' : 'badge-watch'}`}>{inv.status}</span></td>
                  <td className="muted">{inv.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">PO reconciliation</span>
            <h3>PO invoiced amount vs invoice register</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PO</th>
                <th>PO value</th>
                <th>Invoiced (PO)</th>
                <th>Invoiced (register)</th>
                <th>Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {poReconciliation.map((row) => (
                <tr key={row.poId}>
                  <td><strong>{row.poId}</strong></td>
                  <td>{formatUsd(row.poValueUsd)}</td>
                  <td>{formatUsd(row.invoicedOnPo)}</td>
                  <td>{formatUsd(row.invoicedInRegister)}</td>
                  <td className={row.variance !== 0 ? 'metric-negative' : 'metric-positive'}>{formatUsd(row.variance)}</td>
                  <td><span className={`badge ${row.status === 'matched' ? 'badge-good' : 'badge-risk'}`}>{row.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Expediting milestones</span>
            <h3>Vendor-side critical milestones</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Milestone</th>
                <th>PO</th>
                <th>Planned</th>
                <th>Forecast</th>
                <th>Actual</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {expeditingMilestones.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.milestone}</strong></td>
                  <td>{m.poId}</td>
                  <td>{m.planned}</td>
                  <td className={m.forecast > m.planned ? 'metric-negative' : 'metric-positive'}>{m.forecast}</td>
                  <td>{m.actual ?? '—'}</td>
                  <td><span className={`badge ${statusBadge(m.status)}`}>{pretty(m.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function ConstructionWorkspace() {
  const { state } = useProjectStore()
  const { workFronts, productivityTrend, subcontracts, fieldDailyReports, fieldObservations } = state
  const scMetrics = subcontractMetrics(subcontracts)
  const openObservations = fieldObservations.filter((item) => item.status === 'open').length
  const totalEarned =
    workFronts.reduce((sum, wf) => sum + syncWorkFrontEarned(wf, state.ruleOfCreditTemplates, state.progressCredits), 0) /
    (workFronts.length || 1)
  const totalPlanned = workFronts.reduce((sum, wf) => sum + wf.plannedPercent, 0) / (workFronts.length || 1)
  const blockerCount = workFronts.reduce((sum, wf) => sum + wf.blockers.length, 0)
  const productivityIndex = productivityTrend.length === 0 ? 1 : productivityTrend[productivityTrend.length - 1].actualRate

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <PhaseTile label="Avg earned %" value={`${totalEarned.toFixed(0)}%`} detail={`Planned ${totalPlanned.toFixed(0)}% · ${workFronts.filter((wf) => wf.status === 'in_progress').length} active fronts`} tone={totalEarned < totalPlanned ? 'risk' : 'default'} />
        <PhaseTile label="Productivity index" value={productivityIndex.toFixed(2)} detail="Earned ÷ actual man-hours" tone={productivityIndex < 0.9 ? 'risk' : 'default'} />
        <PhaseTile label="Active blockers" value={blockerCount.toString()} detail={`Across all fronts · ${formatUsd(scMetrics.totalValue)} subcontract`} tone={blockerCount > 0 ? 'risk' : 'default'} />
        <PhaseTile label="Field observations" value={openObservations.toString()} detail="Open quality / safety / schedule" tone={openObservations > 0 ? 'risk' : 'default'} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Subcontract register</span>
            <h3>Construction subcontracts — earned vs invoiced</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subcontract</th>
                <th>Subcontractor</th>
                <th>Value</th>
                <th>Earned</th>
                <th>Invoiced</th>
                <th>Progress</th>
                <th>Forecast finish</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subcontracts.map((sc) => (
                <tr key={sc.id}>
                  <td><strong>{sc.number}</strong><small>{sc.title}</small></td>
                  <td>{sc.subcontractor}</td>
                  <td>{formatUsd(sc.contractValueUsd)}</td>
                  <td>{formatUsd(sc.earnedUsd)}</td>
                  <td>{formatUsd(sc.invoicedUsd)}</td>
                  <td>{sc.progressPct}%</td>
                  <td className={sc.forecastFinish > sc.finishDate ? 'metric-negative' : 'metric-positive'}>{sc.forecastFinish}</td>
                  <td><span className={`badge ${statusBadge(sc.status)}`}>{pretty(sc.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Work fronts</span>
            <h3>Discipline progress, productivity, and blockers</h3>
          </div>
        </div>
        <div className="workfront-list">
          {workFronts.map((wf) => {
            const earned = syncWorkFrontEarned(wf, state.ruleOfCreditTemplates, state.progressCredits)
            const productivity = wf.manhoursActual === 0 ? 0 : (earned / 100) / (wf.manhoursActual / wf.manhoursPlanned)
            return (
              <article className="workfront-card" key={wf.id}>
                <div className="workfront-head">
                  <div>
                    <strong>{wf.area}</strong>
                    <small>{wf.discipline} · {wf.owner} · {wf.package}</small>
                  </div>
                  <span className={`badge ${statusBadge(wf.status)}`}>{pretty(wf.status)}</span>
                </div>
                <div className="progress-row">
                  <span>Planned</span>
                  <div className="progress-track"><div className="progress-fill plan" style={{ width: `${wf.plannedPercent}%` }} /></div>
                  <b>{wf.plannedPercent}%</b>
                </div>
                <div className="progress-row">
                  <span>Earned (RoC)</span>
                  <div className="progress-track"><div className={`progress-fill ${earned < wf.plannedPercent ? 'report' : 'capture'}`} style={{ width: `${earned}%` }} /></div>
                  <b>{earned.toFixed(0)}%</b>
                </div>
                <dl className="workfront-meta">
                  <div><dt>Planned man-hours</dt><dd>{wf.manhoursPlanned.toLocaleString()}</dd></div>
                  <div><dt>Actual man-hours</dt><dd>{wf.manhoursActual.toLocaleString()}</dd></div>
                  <div><dt>Productivity</dt><dd>{productivity.toFixed(2)}</dd></div>
                  <div><dt>Forecast finish</dt><dd className={wf.forecastFinish > wf.plannedFinish ? 'metric-negative' : 'metric-positive'}>{wf.forecastFinish}</dd></div>
                </dl>
                {wf.blockers.length > 0 && (
                  <div className="blocker-list">
                    {wf.blockers.map((b) => (
                      <span key={b} className="blocker-chip">{b}</span>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Daily reports</span>
              <h3>Field daily report log</h3>
            </div>
          </div>
          <div className="workfront-list">
            {fieldDailyReports.map((report) => (
              <article key={report.id} className="workfront-card">
                <div className="workfront-head">
                  <div>
                    <strong>{report.reportDate}</strong>
                    <small>{report.area} · {report.contractor}</small>
                  </div>
                  <span className={`badge ${statusBadge(report.status)}`}>{report.status}</span>
                </div>
                <p className="muted">{report.summary}</p>
                <dl className="workfront-meta">
                  <div><dt>Man-hours</dt><dd>{report.manhours}</dd></div>
                  <div><dt>Weather</dt><dd>{report.weather}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Field observations</span>
              <h3>Quality, safety, schedule, productivity</h3>
            </div>
          </div>
          <div className="workfront-list">
            {fieldObservations.map((obs) => (
              <article key={obs.id} className="workfront-card">
                <div className="workfront-head">
                  <div>
                    <strong>{obs.category}</strong>
                    <small>{obs.observedAt} · {obs.owner}</small>
                  </div>
                  <span className={`badge ${obs.severity === 'high' ? 'badge-risk' : 'badge-watch'}`}>{obs.status}</span>
                </div>
                <p>{obs.description}</p>
                <p className="muted">{obs.actionRequired}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Productivity trend</span>
            <h3>Weekly productivity index (1.0 = on-plan)</h3>
          </div>
        </div>
        <div className="bar-row">
          {productivityTrend.map((p) => (
            <div className="bar-item" key={p.week}>
              <div className="bar-col">
                <div className="bar-plan" style={{ height: `${p.plannedRate * 100}%` }} title={`Plan ${p.plannedRate}`} />
                <div className="bar-actual" style={{ height: `${p.actualRate * 100}%` }} title={`Actual ${p.actualRate}`} />
              </div>
              <small>{p.week}</small>
              <b>{p.actualRate.toFixed(2)}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function CommissioningWorkspace() {
  const { state } = useProjectStore()
  const { commissioningSystems, punchList, turnoverChecklists } = state
  const totalLoops = commissioningSystems.reduce((sum, s) => sum + s.loopCount, 0)
  const loopsTested = commissioningSystems.reduce((sum, s) => sum + s.loopTested, 0)
  const punchA = commissioningSystems.reduce((sum, s) => sum + s.punchA, 0)
  const punchB = commissioningSystems.reduce((sum, s) => sum + s.punchB, 0)
  const checklistComplete = turnoverChecklists.filter((item) => item.status === 'complete').length

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <PhaseTile label="Systems tracked" value={commissioningSystems.length.toString()} detail="MC → handover" />
        <PhaseTile label="Loop tests complete" value={`${loopsTested}/${totalLoops}`} detail={`${totalLoops === 0 ? 0 : Math.round((loopsTested / totalLoops) * 100)}% loops tested`} />
        <PhaseTile label="Punch items" value={`${punchA}A / ${punchB}B`} detail="A = must close before handover" tone={punchA > 0 ? 'risk' : 'default'} />
        <PhaseTile label="Turnover checklist" value={`${checklistComplete}/${turnoverChecklists.length}`} detail="System handover items" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Commissioning systems</span>
            <h3>MC date integrity and loop test progress</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>System</th>
                <th>Unit</th>
                <th>Loops tested</th>
                <th>Punch A</th>
                <th>Punch B</th>
                <th>Planned MC</th>
                <th>Forecast MC</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {commissioningSystems.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><small>{s.package}</small></td>
                  <td>{s.unit}</td>
                  <td>{s.loopTested} / {s.loopCount}</td>
                  <td>{s.punchA}</td>
                  <td>{s.punchB}</td>
                  <td>{s.plannedMcDate}</td>
                  <td className={s.forecastMcDate > s.plannedMcDate ? 'metric-negative' : 'metric-positive'}>{s.forecastMcDate}</td>
                  <td><span className={`badge ${statusBadge(s.status)}`}>{pretty(s.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Turnover packages</span>
            <h3>System completion checklists</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>System</th>
                <th>Checklist item</th>
                <th>Responsible</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {turnoverChecklists.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.systemName}</strong></td>
                  <td>{item.item}</td>
                  <td>{item.responsible}</td>
                  <td>{item.dueDate}</td>
                  <td><span className={`badge ${item.status === 'complete' ? 'badge-good' : item.status === 'in_progress' ? 'badge-watch' : 'badge-watch'}`}>{pretty(item.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Punch list</span>
            <h3>Open and recently closed items</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Description</th>
                <th>System</th>
                <th>Discipline</th>
                <th>Category</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {punchList.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.id}</strong></td>
                  <td>{p.description}</td>
                  <td>{p.systemId}</td>
                  <td>{p.discipline}</td>
                  <td><span className={`badge ${p.category === 'A' ? 'badge-risk' : 'badge-watch'}`}>{p.category}</span></td>
                  <td>{p.owner}</td>
                  <td>{p.dueDate}</td>
                  <td><span className={`badge ${statusBadge(p.status)}`}>{pretty(p.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function PhaseTile({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'risk' }) {
  return (
    <article className={tone === 'risk' ? 'metric-card risk' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
