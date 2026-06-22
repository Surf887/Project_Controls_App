import type { MonteCarloResult } from '../store/types'

const W = 760
const H = 220
const PAD = { top: 16, right: 20, bottom: 36, left: 56 }

function formatUsdShort(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`
  return `$${Math.round(value / 1000)}K`
}

export function HistogramChart({ samples, p10, p50, p90 }: MonteCarloResult) {
  const bins = 24
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const range = max - min || 1
  const counts = Array.from({ length: bins }, () => 0)
  samples.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor(((value - min) / range) * bins))
    counts[index] += 1
  })
  const maxCount = Math.max(...counts, 1)
  const barWidth = (760 - PAD.left - PAD.right) / bins

  return (
    <div className="chart-wrap">
      <span className="eyebrow">EAC distribution (N={samples.length})</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="Monte Carlo histogram">
        {counts.map((count, index) => {
          const height = (count / maxCount) * (H - PAD.top - PAD.bottom)
          const x = PAD.left + index * barWidth
          const y = H - PAD.bottom - height
          return <rect key={index} x={x} y={y} width={barWidth - 2} height={height} fill="#1f5eff" opacity={0.75} />
        })}
        {[p10, p50, p90].map((value, index) => {
          const x = PAD.left + ((value - min) / range) * (W - PAD.left - PAD.right)
          const colors = ['#64748b', '#0d9469', '#c73636']
          const labels = ['P10', 'P50', 'P90']
          return (
            <g key={labels[index]}>
              <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom} stroke={colors[index]} strokeDasharray="4 3" />
              <text x={x} y={PAD.top - 2} fill={colors[index]} fontSize={10} textAnchor="middle">{labels[index]}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function TornadoChart({ drivers }: MonteCarloResult) {
  const maxImpact = Math.max(...drivers.map((driver) => Math.abs(driver.impact)), 1)
  const barHeight = 24
  const chartHeight = drivers.length * (barHeight + 8) + PAD.top + PAD.bottom

  return (
    <div className="chart-wrap">
      <span className="eyebrow">Top sensitivity drivers</span>
      <svg viewBox={`0 0 ${W} ${chartHeight}`} className="chart-svg" aria-label="Tornado chart">
        {drivers.map((driver, index) => {
          const width = (Math.abs(driver.impact) / maxImpact) * (W - PAD.left - PAD.right)
          const y = PAD.top + index * (barHeight + 8)
          return (
            <g key={driver.label}>
              <text x={PAD.left} y={y + 16} fill="#334155" fontSize={11}>{driver.label}</text>
              <rect x={PAD.left + 140} y={y} width={width} height={barHeight} fill={driver.impact >= 0 ? '#c73636' : '#0d9469'} rx={4} />
              <text x={PAD.left + 150 + width} y={y + 16} fill="#334155" fontSize={11}>{formatUsdShort(driver.impact)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function CdfChart({ samples, p10, p50, p90 }: MonteCarloResult) {
  const sorted = [...samples].sort((a, b) => a - b)
  const points: [number, number][] = sorted.map((value, index) => [
    PAD.left + (index / (sorted.length - 1)) * (W - PAD.left - PAD.right),
    PAD.top + (H - PAD.top - PAD.bottom) - (index / (sorted.length - 1)) * (H - PAD.top - PAD.bottom),
  ])

  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <div className="chart-wrap">
      <span className="eyebrow">Cumulative distribution (CDF)</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="CDF curve">
        <path d={path} fill="none" stroke="#1f5eff" strokeWidth={2.5} />
        {[p10, p50, p90].map((value, index) => {
          const x = PAD.left + ((value - sorted[0]) / (sorted[sorted.length - 1] - sorted[0])) * (W - PAD.left - PAD.right)
          const labels = ['P10', 'P50', 'P90']
          return (
            <g key={labels[index]}>
              <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom} stroke="#94a3b8" strokeDasharray="3 3" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
