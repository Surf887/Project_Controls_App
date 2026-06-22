import { cashFlowData, resourceData, sCurveData, type CashFlowPoint } from '../data/intelligence'

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
            <line x1={PAD.left} x2={PAD.left + IW} y1={y} y2={y} stroke="#e2ecf4" strokeWidth={1} />
            <text x={PAD.left - 8} y={y + 4} fill="#8aa2b8" fontSize={11} textAnchor="end">
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

  // data area fill under planned line
  const plannedArea =
    pointsToPath(plannedPts) +
    ` L${plannedPts[plannedPts.length - 1][0].toFixed(1)},${(PAD.top + IH).toFixed(1)}` +
    ` L${PAD.left.toFixed(1)},${(PAD.top + IH).toFixed(1)} Z`

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <LegendDot color="#1f5eff" label="Planned" />
        <LegendDot color="#0d9469" label="Actual" />
        <LegendDot color="#f07d00" dashed label="Forecast (EAC)" />
        <LegendDot color="#c73636" label="Overrun zone" fill="rgba(199,54,54,0.12)" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="Project S-curve">
        {/* overrun zone above 100 */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={IW}
          height={scaleY(100, max) - PAD.top}
          fill="rgba(199,54,54,0.07)"
        />
        <text x={PAD.left + IW - 4} y={scaleY(100, max) - 4} fill="#c73636" fontSize={10} textAnchor="end">
          Budget limit 100%
        </text>

        <YAxis max={max} steps={5} />

        {/* planned fill */}
        <path d={plannedArea} fill="rgba(31,94,255,0.07)" />

        {/* planned line */}
        <path d={pointsToPath(plannedPts)} fill="none" stroke="#1f5eff" strokeWidth={2.5} strokeLinejoin="round" />

        {/* forecast line (dashed) */}
        {forecastPts.length > 1 && (
          <path
            d={pointsToPath(forecastPts)}
            fill="none"
            stroke="#f07d00"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        )}

        {/* actual line */}
        {actualPts.length > 1 && (
          <path d={pointsToPath(actualPts)} fill="none" stroke="#0d9469" strokeWidth={2.5} strokeLinejoin="round" />
        )}

        {/* x-axis labels */}
        {series.map((d, i) => (
          <text key={d.period} x={scaleX(i, n)} y={H - 8} fill="#8aa2b8" fontSize={11} textAnchor="middle">
            {d.period}
          </text>
        ))}

        {/* y-axis title */}
        <text
          x={14}
          y={PAD.top + IH / 2}
          fill="#8aa2b8"
          fontSize={11}
          textAnchor="middle"
          transform={`rotate(-90, 14, ${PAD.top + IH / 2})`}
        >
          Cumulative %
        </text>

        {/* today marker */}
        {(() => {
          const todayIdx = 5
          const x = scaleX(todayIdx, n)
          return (
            <g>
              <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + IH} stroke="#1f5eff" strokeWidth={1} strokeDasharray="3 3" />
              <text x={x + 4} y={PAD.top + 12} fill="#1f5eff" fontSize={10} fontWeight="bold">
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
    civil: '#8aa2b8',
    mechanical: '#1f5eff',
    piping: '#0d9469',
    electrical: '#f07d00',
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
                    opacity={0.88}
                  />
                )
              })}
              <text x={x + barW / 2} y={H - 8} fill="#8aa2b8" fontSize={10} textAnchor="middle">
                {bucket.period}
              </text>
            </g>
          )
        })}

        <text
          x={14}
          y={PAD.top + IH / 2}
          fill="#8aa2b8"
          fontSize={11}
          textAnchor="middle"
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
        <LegendDot color="#1f5eff" label="Planned" />
        <LegendDot color="#0d9469" label="Actual" />
        <LegendDot color="#f07d00" label="Forecast" />
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
              <rect x={gx + 1} y={planned} width={barW} height={PAD.top + IH - planned} fill="#1f5eff" opacity={0.8} />
              {/* actual bar */}
              {actual !== null && (
                <rect x={gx + 1 + barW + 1} y={actual} width={barW} height={PAD.top + IH - actual} fill="#0d9469" opacity={0.85} />
              )}
              {/* forecast bar */}
              {forecast !== null && (
                <rect x={gx + 1 + (barW + 1) * 2} y={forecast} width={barW} height={PAD.top + IH - forecast} fill="#f07d00" opacity={0.8} />
              )}
              <text x={gx + barW * 1.5} y={H - 8} fill="#8aa2b8" fontSize={10} textAnchor="middle">
                {d.period}
              </text>
            </g>
          )
        })}

        <text
          x={14}
          y={PAD.top + IH / 2}
          fill="#8aa2b8"
          fontSize={11}
          textAnchor="middle"
          transform={`rotate(-90, 14, ${PAD.top + IH / 2})`}
        >
          USD millions
        </text>
      </svg>
    </div>
  )
}

function LegendDot({ color, label, dashed, fill }: { color: string; label: string; dashed?: boolean; fill?: string }) {
  return (
    <span className="legend-dot">
      <svg width={24} height={12}>
        {fill ? (
          <rect x={0} y={2} width={24} height={8} fill={fill} rx={2} />
        ) : dashed ? (
          <line x1={0} y1={6} x2={24} y2={6} stroke={color} strokeWidth={2.5} strokeDasharray="5 3" />
        ) : (
          <line x1={0} y1={6} x2={24} y2={6} stroke={color} strokeWidth={2.5} />
        )}
      </svg>
      <span>{label}</span>
    </span>
  )
}
