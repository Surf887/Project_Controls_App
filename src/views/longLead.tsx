import { useMemo } from 'react'
import {
  computeLeadTimeStatus,
  criticalLliCount,
  daysToRequired,
  linkPoToLli,
  totalScheduleExposureDays,
} from '../engine/longLead'
import { useProjectStore } from '../store/projectStore'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function statusBadge(status: ReturnType<typeof computeLeadTimeStatus>) {
  switch (status) {
    case 'on_track':
      return 'badge-good'
    case 'at_risk':
      return 'badge-watch'
    default:
      return 'badge-risk'
  }
}

export function LongLeadView() {
  const { state } = useProjectStore()

  const enriched = useMemo(
    () =>
      state.longLeadItems.map((item) => ({
        item,
        status: computeLeadTimeStatus(item),
        daysRemaining: daysToRequired(item),
        ...linkPoToLli(item, state.purchaseOrders, state.expeditingMilestones),
      })),
    [state.expeditingMilestones, state.longLeadItems, state.purchaseOrders],
  )

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile label="Long-lead items" value={state.longLeadItems.length.toString()} detail="Critical path procurement" />
        <MetricTile label="Critical / late" value={criticalLliCount(state.longLeadItems).toString()} detail="Forecast slip > 14 days" tone="risk" />
        <MetricTile label="Schedule exposure" value={`${totalScheduleExposureDays(state.longLeadItems)} days`} detail="Aggregated impact on construction" tone="watch" />
        <MetricTile label="Linked POs" value={state.longLeadItems.filter((item) => item.poId).length.toString()} detail="With expediting milestones" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">LLI register</span>
            <h3>Long-lead item tracking</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tag</th>
                <th>Description</th>
                <th>Criticality</th>
                <th>Lead time</th>
                <th>Required on site</th>
                <th>Forecast</th>
                <th>Days to need</th>
                <th>PO</th>
                <th>Schedule Δ</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(({ item, status, daysRemaining, po, milestones }) => (
                <tr key={item.id}>
                  <td><strong>{item.tag}</strong><div className="muted">{item.wbs}</div></td>
                  <td>{item.description}</td>
                  <td><span className={`badge ${item.criticality === 'critical' ? 'badge-risk' : 'badge-watch'}`}>{item.criticality}</span></td>
                  <td>{item.leadTimeDays}d</td>
                  <td>{item.requiredOnSiteDate}</td>
                  <td className={item.forecastOnSiteDate > item.requiredOnSiteDate ? 'metric-negative' : 'metric-positive'}>{item.forecastOnSiteDate}</td>
                  <td>{daysRemaining}d</td>
                  <td>
                    {po ? (
                      <>
                        <strong>{po.id}</strong>
                        <div className="muted">{formatUsd(po.poValueUsd)} · {milestones.length} milestones</div>
                      </>
                    ) : '—'}
                  </td>
                  <td>{item.scheduleImpactDays > 0 ? `+${item.scheduleImpactDays}d` : '0'}</td>
                  <td><span className={`badge ${statusBadge(status)}`}>{status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Notes</span>
            <h3>Expediting commentary</h3>
          </div>
        </div>
        <div className="workfront-list">
          {enriched.map(({ item, milestones }) => (
            <article key={item.id} className="workfront-card">
              <strong>{item.tag}</strong>
              <p className="muted">{item.notes}</p>
              {milestones.length > 0 && (
                <dl className="workfront-meta">
                  {milestones.slice(0, 3).map((m) => (
                    <div key={m.id}>
                      <dt>{m.milestone}</dt>
                      <dd>{m.planned} → {m.forecast}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function MetricTile({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'watch' | 'risk'
}) {
  return (
    <article className={tone === 'risk' ? 'metric-card risk' : tone === 'watch' ? 'metric-card watch' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
