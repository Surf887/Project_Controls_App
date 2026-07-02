import type { ApprovalStatus, ExtractedValue, ReportDocument, ReviewStatus } from '../data/projectData'

export const statusLabels: Record<ReviewStatus, string> = {
  pending_review: 'Pending review',
  needs_correction: 'Needs correction',
  approved: 'Approved',
}

export const approvalLabels: Record<ApprovalStatus, string> = {
  unapproved: 'Unapproved',
  approved: 'Approved',
  rejected: 'Rejected',
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatValue(value: ExtractedValue) {
  if (value.unit === 'USD') {
    return formatCurrency(value.normalizedValue)
  }

  if (value.unit === '%') {
    return `${value.normalizedValue.toFixed(1)}%`
  }

  return `${value.normalizedValue.toLocaleString()} ${value.unit}`
}

export function confidenceClass(confidence: number) {
  if (confidence >= 0.85) return 'good'
  if (confidence >= 0.72) return 'watch'
  return 'risk'
}

export function statusClass(status: ReviewStatus | ApprovalStatus | ReportDocument['status']) {
  return status.replace('_', '-')
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'risk'
}) {
  return (
    <article className={tone === 'risk' ? 'metric-card risk' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

export function ReportCard({ report }: { report: ReportDocument }) {
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
