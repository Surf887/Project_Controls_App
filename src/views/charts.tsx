import { cashFlowData, resourceData, sCurveData, type CashFlowPoint } from '../data/intelligence'

const CHART = {
  grid: '#f0eee9',
  axis: '#97938b',
  accent: '#2d5bd7',
  positive: '#1f7a4d',
  warning: '#b4690e',
  critical: '#c0392b',
} as const

const W = 760
const H = 280
const PAD = { top: 16, right: 20, bottom: 36, left: 56 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

function scaleX(index: number, total: number) {
  return PAD.left + (index / (total - 1)) * IW
}

function scaleY(value: number, max: number) {
  return PAD.top + IH - (value / max) * IH
}

function pointsToPath(points: [number, number][]) {
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
}

function YAxis({ max, steps = 5 }: { max: number; steps?: number }) {
  return (
    <>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const value = (i / steps) * max
        const y = scaleY(value, max)
        return (
          <g key={i}>
            <line x1={PAD.left} x2={PAD.left + IW} y1={y} y2={y} stroke={CHART.grid} strokeWidth={1} />
            <text x={PAD.left - 8} y={y + 4} fill={CHART.axis} fontSize={11} textAnchor="end" fontFamily="IBM Plex Mono, monospace">
              {value % 1 === 0 ? value : value.toFixed(1)}
            </text>
          </g>
        )
      })}
    </>
  )
}

export function SCurveChart({ data }: { data?: typeof sCurveData } = {}) {
  const series = data ?? sCurveData
  const n = series.length
  const max = 110

  const plannedPts: [number, number][] = series.map((d, i) => [scaleX(i, n), scaleY(d.planned, max)])
  const actualPts: [number, number][] = series
    .filter((d) => d.actual !== null)
    .map((d, i) => [scaleX(i, n), scaleY(d.actual!, max)])
  const forecastPts: [number, number][] = series
    .filter((d) => d.forecast !== null)
    .map((d) => {
      const idx = series.findIndex((x) => x === d)
      return [scaleX(idx, n), scaleY(d.forecast!, max)]
    })

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <LegendDot color={CHART.accent} label="Planned" />
        <LegendDot color={CHART.positive} label="Actual" />
        <LegendDot color={CHART.warning} dashed label="Forecast (EAC)" />
        <LegendDot color={CHART.critical} label="Overrun zone" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="Project S-curve">
        <line
          x1={PAD.left}
          x2={PAD.left + IW}
          y1={scaleY(100, max)}
          y2={scaleY(100, max)}
          stroke={CHART.critical}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text x={PAD.left + IW - 4} y={scaleY(100, max) - 4} fill={CHART.critical} fontSize={10} textAnchor="end" fontFamily="IBM Plex Mono, monospace">
          Budget limit 100%
        </text>

        <YAxis max={max} steps={5} />

        <path d={pointsToPath(plannedPts)} fill="none" stroke={CHART.accent} strokeWidth={2.5} strokeLinejoin="round" />

        {forecastPts.length > 1 && (
          <path
            d={pointsToPath(forecastPts)}
            fill="none"
            stroke={CHART.warning}
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        )}

        {actualPts.length > 1 && (
          <path d={pointsToPath(actualPts)} fill="none" stroke={CHART.positive} strokeWidth={2.5} strokeLinejoin="round" />
        )}

        {series.map((d, i) => (
          <text key={d.period} x={scaleX(i, n)} y={H - 8} fill={CHART.axis} fontSize={11} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
            {d.period}
          </text>
        ))}

        <text
          x={14}
          y={PAD.top + IH / 2}
          fill={CHART.axis}
          fontSize={11}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          transform={`rotate(-90, 14, ${PAD.top + IH / 2})`}
        >
          Cumulative %
        </text>

        {(() => {
          const todayIdx = 5
          const x = scaleX(todayIdx, n)
          return (
            <g>
              <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + IH} stroke={CHART.accent} strokeWidth={1} strokeDasharray="3 3" />
              <text x={x + 4} y={PAD.top + 12} fill={CHART.accent} fontSize={10} fontWeight="600" fontFamily="IBM Plex Mono, monospace">
                TODAY
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

export function ResourceHistogram() {
  const n = resourceData.length
  const disciplines: (keyof Omit<typeof resourceData[0], 'period'>)[] = ['civil', 'mechanical', 'piping', 'electrical']
  const colors: Record<string, string> = {
    civil: CHART.axis,
    mechanical: CHART.accent,
    piping: CHART.positive,
    electrical: CHART.warning,
  }
  const maxStack = Math.max(...resourceData.map((d) => d.mechanical + d.piping + d.electrical + d.civil))
  const barW = IW / n - 4

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        {disciplines.map((d) => (
          <LegendDot key={d} color={colors[d]} label={d.charAt(0).toUpperCase() + d.slice(1)} />
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="Resource histogram">
        <YAxis max={maxStack} steps={4} />

        {resourceData.map((bucket, i) => {
          const x = PAD.left + (i / n) * IW + 2
          let bottom = PAD.top + IH

          return (
            <g key={bucket.period}>
              {disciplines.map((disc) => {
                const val = bucket[disc]
                const barH = (val / maxStack) * IH
                bottom -= barH
                return (
                  <rect
                    key={disc}
                    x={x}
                    y={bottom}
                    width={barW}
                    height={barH}
                    fill={colors[disc]}
                  />
                )
              })}
              <text x={x + barW / 2} y={H - 8} fill={CHART.axis} fontSize={10} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
                {bucket.period}
              </text>
            </g>
          )
        })}

        <text
          x={14}
          y={PAD.top + IH / 2}
          fill={CHART.axis}
          fontSize={11}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          transform={`rotate(-90, 14, ${PAD.top + IH / 2})`}
        >
          Man-hours (×100)
        </text>
      </svg>
    </div>
  )
}

export function CashFlowChart({ data }: { data?: CashFlowPoint[] } = {}) {
  const series = data ?? cashFlowData
  const n = series.length
  const max = Math.max(...series.map((d) => Math.max(d.plannedMonthly, d.actualMonthly ?? 0, d.forecastMonthly ?? 0))) * 1.15
  const barW = IW / n / 3 - 1

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <LegendDot color={CHART.accent} label="Planned" />
        <LegendDot color={CHART.positive} label="Actual" />
        <LegendDot color={CHART.warning} label="Forecast" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="Monthly cash flow">
        <YAxis max={max} steps={4} />

        {series.map((d, i) => {
          const gx = PAD.left + (i / n) * IW
          const planned = PAD.top + IH - (d.plannedMonthly / max) * IH
          const actual = d.actualMonthly !== null ? PAD.top + IH - (d.actualMonthly / max) * IH : null
          const forecast = d.forecastMonthly !== null ? PAD.top + IH - (d.forecastMonthly / max) * IH : null

          return (
            <g key={d.period}>
              {/* planned bar */}
              <rect x={gx + 1} y={planned} width={barW} height={PAD.top + IH - planned} fill={CHART.accent} />
              {actual !== null && (
                <rect x={gx + 1 + barW + 1} y={actual} width={barW} height={PAD.top + IH - actual} fill={CHART.positive} />
              )}
              {forecast !== null && (
                <rect x={gx + 1 + (barW + 1) * 2} y={forecast} width={barW} height={PAD.top + IH - forecast} fill={CHART.warning} />
              )}
              <text x={gx + barW * 1.5} y={H - 8} fill={CHART.axis} fontSize={10} textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
                {d.period}
              </text>
            </g>
          )
        })}

        <text
          x={14}
          y={PAD.top + IH / 2}
          fill={CHART.axis}
          fontSize={11}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          transform={`rotate(-90, 14, ${PAD.top + IH / 2})`}
        >
          USD millions
        </text>
      </svg>
    </div>
  )
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="legend-dot">
      <svg width={24} height={12} aria-hidden>
        {dashed ? (
          <line x1={0} y1={6} x2={24} y2={6} stroke={color} strokeWidth={2.5} strokeDasharray="5 3" />
        ) : (
          <line x1={0} y1={6} x2={24} y2={6} stroke={color} strokeWidth={2.5} />
        )}
      </svg>
      <span>{label}</span>
    </span>
  )
}
