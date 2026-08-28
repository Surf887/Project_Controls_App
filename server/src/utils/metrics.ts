interface MetricBucket {
  count: number
  durationMs: number
}

const requests = new Map<string, MetricBucket>()
let activeRequests = 0

function routeLabel(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/(?:proj|rpt|bl|job|aud)-[a-z0-9._-]+/gi, '/:id')
    .replace(/[^a-zA-Z0-9_/:.-]/g, '_')
    .slice(0, 160)
}

export function beginRequestMetric(method: string, path: string): (status: number) => void {
  activeRequests += 1
  const startedAt = performance.now()
  const keyPrefix = `${method.toUpperCase()}|${routeLabel(path)}`
  let finished = false
  return (status: number) => {
    if (finished) return
    finished = true
    activeRequests = Math.max(0, activeRequests - 1)
    const key = `${keyPrefix}|${status}`
    const current = requests.get(key) ?? { count: 0, durationMs: 0 }
    current.count += 1
    current.durationMs += performance.now() - startedAt
    requests.set(key, current)
  }
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

export function renderPrometheusMetrics(): string {
  const lines = [
    '# HELP project_controls_http_requests_total Total HTTP requests.',
    '# TYPE project_controls_http_requests_total counter',
  ]
  for (const [key, value] of requests) {
    const [method, route, status] = key.split('|')
    const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"`
    lines.push(`project_controls_http_requests_total{${labels}} ${value.count}`)
  }
  lines.push(
    '# HELP project_controls_http_request_duration_ms_total Cumulative HTTP request duration in milliseconds.',
    '# TYPE project_controls_http_request_duration_ms_total counter',
  )
  for (const [key, value] of requests) {
    const [method, route, status] = key.split('|')
    const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"`
    lines.push(`project_controls_http_request_duration_ms_total{${labels}} ${value.durationMs.toFixed(3)}`)
  }
  lines.push(
    '# HELP project_controls_http_requests_active Requests currently being processed.',
    '# TYPE project_controls_http_requests_active gauge',
    `project_controls_http_requests_active ${activeRequests}`,
  )
  return `${lines.join('\n')}\n`
}

export function resetMetricsForTest(): void {
  requests.clear()
  activeRequests = 0
}
