import { useMemo, useState } from 'react'
import { findOwningControlAccount } from '../engine/applyExtractionsCore'
import {
  buildScheduleCompletionCurve,
  controlAccountSchedulePerformance,
  latestAcceptedScheduleImport,
  scheduleSummary,
  type ScheduleCurvePoint,
} from '../engine/scheduleControl'
import { useProjectRole } from '../hooks/useProjectRole'
import { useProjectStore } from '../store/projectStore'
import {
  buildP6CsvImport,
  inspectP6Csv,
  P6_FIELD_DEFINITIONS,
  sampleP6Csv,
  type P6ColumnMap,
  type P6CsvInspection,
} from '../utils/p6CsvImport'

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPct(value: number) {
  return `${value.toFixed(1)}%`
}

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function CurveLegend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="legend-dot">
      <svg width={24} height={12} aria-hidden>
        <line
          x1={0}
          x2={24}
          y1={6}
          y2={6}
          stroke={color}
          strokeDasharray={dashed ? '5 3' : undefined}
          strokeWidth={2.5}
        />
      </svg>
      <span>{label}</span>
    </span>
  )
}

function ScheduleCurve({ data }: { data: ScheduleCurvePoint[] }) {
  if (data.length === 0) {
    return <p className="empty-state">Import a schedule to generate the baseline and forecast completion curve.</p>
  }
  const width = 760
  const height = 280
  const pad = { top: 18, right: 20, bottom: 40, left: 48 }
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const x = (index: number) =>
    pad.left + (index / Math.max(data.length - 1, 1)) * innerWidth
  const y = (value: number) => pad.top + innerHeight - (value / 100) * innerHeight
  const pathFor = (values: Array<number | null>) =>
    values
      .map((value, index) => (value == null ? null : [x(index), y(value)] as const))
      .filter((point): point is readonly [number, number] => point != null)
      .map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`)
      .join(' ')

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <CurveLegend color="#2d5bd7" label="Baseline completion" />
        <CurveLegend color="#b4690e" dashed label="Current forecast" />
        <CurveLegend color="#1f7a4d" label="Actual completions" />
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} aria-label="Schedule completion curve">
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line
              x1={pad.left}
              x2={pad.left + innerWidth}
              y1={y(value)}
              y2={y(value)}
              stroke="#f0eee9"
            />
            <text x={pad.left - 8} y={y(value) + 4} textAnchor="end" fill="#79746d" fontSize={11}>
              {value}%
            </text>
          </g>
        ))}
        <path d={pathFor(data.map((point) => point.planned))} fill="none" stroke="#2d5bd7" strokeWidth={2.5} />
        <path
          d={pathFor(data.map((point) => point.forecast))}
          fill="none"
          stroke="#b4690e"
          strokeDasharray="6 4"
          strokeWidth={2.5}
        />
        <path d={pathFor(data.map((point) => point.actual))} fill="none" stroke="#1f7a4d" strokeWidth={2.5} />
        {data.map((point, index) => (
          <text key={point.period} x={x(index)} y={height - 10} textAnchor="middle" fill="#79746d" fontSize={10}>
            {point.period}
          </text>
        ))}
      </svg>
    </div>
  )
}

interface PendingP6File {
  fileName: string
  text: string
  inspection: P6CsvInspection
}

export function ScheduleControlView() {
  const { state, dispatch, currentUser } = useProjectStore()
  const { canEdit } = useProjectRole()
  const latest = latestAcceptedScheduleImport(state.scheduleImports)
  const [pending, setPending] = useState<PendingP6File | null>(null)
  const [columnMap, setColumnMap] = useState<P6ColumnMap>({})
  const [dataDate, setDataDate] = useState(latest?.dataDate ?? new Date().toISOString().slice(0, 10))
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'critical' | 'late' | 'unmapped'>('all')
  const missingRequiredMapCount = P6_FIELD_DEFINITIONS.filter(
    (definition) => definition.required && !columnMap[definition.key],
  ).length

  const summary = useMemo(
    () =>
      scheduleSummary(
        state.scheduleActivities,
        state.scheduleRelationships,
        latest?.dataDate ?? null,
      ),
    [latest?.dataDate, state.scheduleActivities, state.scheduleRelationships],
  )
  const performance = useMemo(
    () =>
      latest
        ? controlAccountSchedulePerformance(
            state.scheduleActivities,
            state.costSheetRows,
            latest.dataDate,
          )
        : [],
    [latest, state.costSheetRows, state.scheduleActivities],
  )
  const curve = useMemo(
    () =>
      latest
        ? buildScheduleCompletionCurve(state.scheduleActivities, latest.dataDate)
        : [],
    [latest, state.scheduleActivities],
  )
  const controlAccounts = useMemo(
    () =>
      state.costSheetRows
        .filter((row) => row.parentId === null)
        .sort((a, b) => a.wbs.localeCompare(b.wbs)),
    [state.costSheetRows],
  )
  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase()
    return state.scheduleActivities.filter((activity) => {
      const matchesSearch =
        !query ||
        [activity.sourceActivityId, activity.name, activity.sourceWbs, activity.wbs]
          .join(' ')
          .toLowerCase()
          .includes(query)
      const late =
        activity.status !== 'completed' &&
        (activity.currentFinish > activity.baselineFinish ||
          Boolean(latest && activity.currentFinish < latest.dataDate))
      const matchesFilter =
        filter === 'all' ||
        (filter === 'critical' && activity.status !== 'completed' && activity.totalFloatDays <= 0) ||
        (filter === 'late' && late) ||
        (filter === 'unmapped' && activity.mappingStatus === 'unmapped')
      return matchesSearch && matchesFilter
    })
  }, [filter, latest, search, state.scheduleActivities])

  async function selectP6File(file: File) {
    if (file.size > 250 * 1024) {
      setMessage('P6 CSV exceeds the 250 KB reviewed-upload limit. Use a filtered control schedule or the future streaming API adapter.')
      return
    }
    const text = await file.text()
    const inspection = inspectP6Csv(text)
    const rememberedMap = Object.fromEntries(
      Object.entries(latest?.columnMap ?? {}).filter(([, header]) =>
        inspection.headers.includes(header),
      ),
    ) as P6ColumnMap
    const nextMap = { ...inspection.suggestedMap, ...rememberedMap }
    const missingAfterMemory = P6_FIELD_DEFINITIONS.filter(
      (definition) => definition.required && !nextMap[definition.key],
    ).length
    setPending({ fileName: file.name, text, inspection })
    setColumnMap(nextMap)
    setMessage(
      inspection.duplicateHeaders.length > 0
        ? `Resolve ${inspection.duplicateHeaders.length} duplicate CSV header(s) before importing.`
        : missingAfterMemory > 0
        ? `Map ${missingAfterMemory} required field(s) before importing.`
        : `Detected ${inspection.rowCount} P6 activity row(s). ${Object.keys(rememberedMap).length > 0 ? `Reused ${Object.keys(rememberedMap).length} saved column mappings. ` : ''}Review before import.`,
    )
  }

  function importSchedule() {
    if (!pending || !canEdit) return
    const result = buildP6CsvImport(pending.text, {
      fileName: pending.fileName,
      dataDate,
      importedBy: currentUser?.name ?? 'Planner',
      knownWbs: controlAccounts.map((row) => row.wbs),
      columnMap,
    })
    dispatch({ type: 'IMPORT_SCHEDULE', payload: result })
    if (result.batch.status === 'rejected') {
      setMessage(`Import rejected: ${result.batch.errorCount} error(s). Correct the mapping or source file and retry.`)
      return
    }
    setMessage(
      `Imported ${result.batch.activityCount} activities and ${result.batch.relationshipCount} relationships; ${result.batch.warningCount} warning(s).`,
    )
    setPending(null)
  }

  return (
    <div className="view-stack schedule-view" data-testid="schedule-control-view">
      <div className="topbar">
        <div>
          <span className="eyebrow">Integrated project controls · Primavera P6</span>
          <h1>Schedule and cost control</h1>
          <p className="muted">
            Import a statused P6 programme, map activities to project control accounts, and calculate schedule-aware
            PV, EV, SPI, CPI, and forecast finish from one governed data date.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={() => downloadText('p6-schedule-sample.csv', sampleP6Csv())}>
            Download P6 sample
          </button>
          <label className="primary-button schedule-file-button">
            Select P6 CSV
            <input
              accept=".csv,text/csv"
              disabled={!canEdit}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void selectP6File(file)
                event.target.value = ''
              }}
              type="file"
            />
          </label>
        </div>
      </div>

      {message && <section className="callout">{message}</section>}

      {pending && (
        <section className="panel" data-testid="p6-mapping-review">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Staging and mapping</span>
              <h3>{pending.fileName}</h3>
              <p className="muted">{pending.inspection.rowCount} source rows · map once before governed import</p>
            </div>
            <span className={`badge ${missingRequiredMapCount > 0 ? 'badge-risk' : 'badge-good'}`}>
              {missingRequiredMapCount > 0
                ? `${missingRequiredMapCount} required maps missing`
                : 'Required fields detected'}
            </span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Schedule data date</span>
              <input
                aria-label="Schedule data date"
                onChange={(event) => setDataDate(event.target.value)}
                type="date"
                value={dataDate}
              />
            </label>
          </div>
          <div className="p6-column-map">
            {P6_FIELD_DEFINITIONS.map((definition) => (
              <label className="field" key={definition.key}>
                <span>
                  {definition.label}
                  {definition.required ? ' *' : ''}
                </span>
                <select
                  aria-label={`Map ${definition.label}`}
                  onChange={(event) =>
                    setColumnMap((current) => ({
                      ...current,
                      [definition.key]: event.target.value || undefined,
                    }))
                  }
                  value={columnMap[definition.key] ?? ''}
                >
                  <option value="">Not mapped</option>
                  {pending.inspection.headers.map((header, index) => (
                    <option key={`${index}-${header}`} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="panel-actions">
            <button
              className="primary-button"
              disabled={missingRequiredMapCount > 0 || pending.inspection.duplicateHeaders.length > 0 || !dataDate}
              onClick={importSchedule}
              type="button"
              data-testid="import-p6-schedule"
            >
              Validate and import schedule
            </button>
            <button className="ghost-button" onClick={() => setPending(null)} type="button">
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="metric-grid schedule-metrics">
        <article className="metric-tile">
          <span>Data date</span>
          <strong>{summary.dataDate ?? 'Not imported'}</strong>
          <p>{latest?.fileName ?? 'Awaiting P6 schedule'}</p>
        </article>
        <article className="metric-tile">
          <span>Activities</span>
          <strong>{summary.activityCount}</strong>
          <p>{summary.relationshipCount} relationships</p>
        </article>
        <article className={`metric-tile ${summary.criticalCount > 0 ? 'metric-tile--watch' : ''}`}>
          <span>Critical / late</span>
          <strong>{summary.criticalCount} / {summary.lateCount}</strong>
          <p>{summary.overdueCount} overdue at data date</p>
        </article>
        <article className={`metric-tile ${summary.spi > 0 && summary.spi < 1 ? 'metric-tile--watch' : ''}`}>
          <span>Schedule SPI</span>
          <strong>{summary.spi.toFixed(2)}</strong>
          <p>{formatPct(summary.actualProgress)} actual vs {formatPct(summary.plannedProgress)} planned</p>
        </article>
        <article className={`metric-tile ${summary.unmappedCount > 0 ? 'metric-tile--watch' : ''}`}>
          <span>WBS mapping</span>
          <strong>{summary.mappedCount}/{summary.activityCount}</strong>
          <p>{summary.unmappedCount} activities need mapping</p>
        </article>
        <article className={`metric-tile ${summary.finishVarianceDays > 0 ? 'metric-tile--watch' : ''}`}>
          <span>Forecast finish</span>
          <strong>{summary.forecastFinish ?? '—'}</strong>
          <p>{summary.finishVarianceDays > 0 ? '+' : ''}{summary.finishVarianceDays} days vs baseline</p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Schedule completion S-curve</span>
            <h3>Baseline vs current forecast vs actual completions</h3>
          </div>
          <span className="badge badge-good">P6-derived</span>
        </div>
        <ScheduleCurve data={curve} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Control-account integration</span>
            <h3>Schedule progress drives cost performance</h3>
          </div>
          <span className="badge badge-good">{performance.length} linked accounts</span>
        </div>
        <div className="table-wrap">
          <table data-testid="schedule-cost-performance">
            <thead>
              <tr>
                <th>WBS / control account</th>
                <th>Activities</th>
                <th>Planned</th>
                <th>Actual</th>
                <th>PV</th>
                <th>EV</th>
                <th>AC</th>
                <th>SPI</th>
                <th>CPI</th>
                <th>Forecast finish</th>
              </tr>
            </thead>
            <tbody>
              {performance.length === 0 ? (
                <tr>
                  <td colSpan={10}><p className="empty-state">No mapped P6 activities are available yet.</p></td>
                </tr>
              ) : (
                performance.map((line) => (
                  <tr key={line.controlAccountId}>
                    <td><strong>{line.wbs}</strong><small>{line.description}</small></td>
                    <td>{line.activityCount} <small>{line.criticalCount} critical</small></td>
                    <td>{formatPct(line.plannedProgress)}</td>
                    <td>{formatPct(line.actualProgress)}</td>
                    <td>{formatUsd(line.pv)}</td>
                    <td>{formatUsd(line.ev)}</td>
                    <td>{formatUsd(line.ac)}</td>
                    <td className={line.spi < 1 ? 'metric-negative' : 'metric-positive'}>{line.spi.toFixed(2)}</td>
                    <td className={line.cpi < 1 ? 'metric-negative' : 'metric-positive'}>{line.cpi.toFixed(2)}</td>
                    <td>{line.forecastFinish}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Activity control</span>
            <h3>P6 activities, exceptions, and project WBS mapping</h3>
          </div>
          <span className="badge badge-watch">{filteredActivities.length} visible</span>
        </div>
        <div className="filter-bar">
          <label>
            <span>Search</span>
            <input
              className="filter-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Activity ID, name, source WBS…"
              type="search"
              value={search}
            />
          </label>
          <label>
            <span>Exception</span>
            <select className="select-input" onChange={(event) => setFilter(event.target.value as typeof filter)} value={filter}>
              <option value="all">All activities</option>
              <option value="critical">Critical</option>
              <option value="late">Late / overdue</option>
              <option value="unmapped">Unmapped WBS</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table data-testid="schedule-activity-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Project mapping</th>
                <th>Baseline finish</th>
                <th>Current finish</th>
                <th>Float</th>
                <th>Physical</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={7}><p className="empty-state">No schedule activities match this view.</p></td>
                </tr>
              ) : (
                filteredActivities.map((activity) => {
                  const account = findOwningControlAccount(state.costSheetRows, activity.wbs)
                  return (
                    <tr key={activity.id}>
                      <td>
                        <strong>{activity.sourceActivityId}</strong>
                        <small>{activity.name}</small>
                      </td>
                      <td>
                        <select
                          aria-label={`Control account for ${activity.sourceActivityId}`}
                          className="select-input schedule-map-select"
                          disabled={!canEdit}
                          onChange={(event) => {
                            if (!event.target.value) return
                            dispatch({
                              type: 'UPDATE_SCHEDULE_ACTIVITY_MAPPING',
                              payload: {
                                activityId: activity.id,
                                wbs: event.target.value,
                                actor: currentUser?.name ?? 'Planner',
                              },
                            })
                          }}
                          value={account?.wbs ?? ''}
                        >
                          <option value="">Needs mapping</option>
                          {controlAccounts.map((row) => (
                            <option key={row.id} value={row.wbs}>
                              {row.wbs} — {row.description}
                            </option>
                          ))}
                        </select>
                        <small>Source: {activity.sourceWbs}</small>
                      </td>
                      <td>{activity.baselineFinish}</td>
                      <td className={activity.currentFinish > activity.baselineFinish ? 'metric-negative' : ''}>
                        {activity.currentFinish}
                      </td>
                      <td className={activity.totalFloatDays <= 0 ? 'metric-negative' : ''}>{activity.totalFloatDays}d</td>
                      <td>{formatPct(activity.physicalPercentComplete)}</td>
                      <td>
                        <span className={`badge ${activity.status === 'completed' ? 'badge-good' : activity.totalFloatDays <= 0 ? 'badge-risk' : 'badge-watch'}`}>
                          {activity.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Import lineage</span>
            <h3>Schedule refresh history</h3>
          </div>
        </div>
        <div className="report-list compact">
          {state.scheduleImports.length === 0 ? (
            <p className="empty-state">No schedule import batches recorded.</p>
          ) : (
            state.scheduleImports.slice(0, 10).map((batch) => (
              <article className="report-card" key={batch.id}>
                <div>
                  <span className="eyebrow">{batch.sourceSystem}</span>
                  <h4>{batch.fileName}</h4>
                  <p>Data date {batch.dataDate} · imported by {batch.importedBy}</p>
                </div>
                <div className="report-meta">
                  <span className={`badge ${batch.status === 'rejected' ? 'badge-risk' : batch.warningCount > 0 ? 'badge-watch' : 'badge-good'}`}>
                    {batch.status.replaceAll('_', ' ')}
                  </span>
                  <strong>{batch.activityCount} activities</strong>
                  <small>{batch.warningCount} warnings · {batch.errorCount} errors</small>
                </div>
                {batch.issues.length > 0 && (
                  <ul className="schedule-issue-list">
                    {batch.issues.slice(0, 3).map((issue) => (
                      <li key={issue.id}>
                        Row {issue.row} · {issue.field}: {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
