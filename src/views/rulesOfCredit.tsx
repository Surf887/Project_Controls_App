import { useMemo } from 'react'
import {
  computeEarnedPercent,
  findProgressEntry,
  findTemplate,
  stepsCreditTotal,
  toggleStepCompletion,
} from '../engine/rulesOfCredit'
import { useProjectStore } from '../store/projectStore'
import type { ProgressCreditEntry, RuleOfCreditTemplate } from '../store/types'

export function RulesOfCreditView() {
  const { state, dispatch } = useProjectStore()

  const assignments = useMemo(() => {
    return state.progressCredits.map((entry) => {
      const template = findTemplate(state.ruleOfCreditTemplates, entry.templateId)
      const earned = template ? computeEarnedPercent(template, entry) : 0
      const label =
        entry.targetType === 'deliverable'
          ? state.deliverables.find((item) => item.id === entry.targetId)?.number ?? entry.targetId
          : entry.targetType === 'work_front'
            ? state.workFronts.find((item) => item.id === entry.targetId)?.area ?? entry.targetId
            : entry.targetId

      return { entry, template, earned, label }
    })
  }, [state.deliverables, state.progressCredits, state.ruleOfCreditTemplates, state.workFronts])

  function handleToggle(entry: ProgressCreditEntry, stepId: string) {
    dispatch({ type: 'UPDATE_PROGRESS_CREDIT', payload: toggleStepCompletion(entry, stepId) })
  }

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <MetricTile label="Templates" value={state.ruleOfCreditTemplates.length.toString()} detail="Configured rule sets" />
        <MetricTile label="Assignments" value={state.progressCredits.length.toString()} detail="WBS, deliverables, work fronts" />
        <MetricTile
          label="Avg earned (assigned)"
          value={`${assignments.length === 0 ? 0 : Math.round(assignments.reduce((s, a) => s + a.earned, 0) / assignments.length)}%`}
          detail="From completed credit steps"
        />
        <MetricTile label="EVM linked WBS" value={state.progressCredits.filter((e) => e.targetType === 'wbs').length.toString()} detail="Drives earned value on EVM Controls" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Template library</span>
            <h3>Rules of credit definitions</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Discipline</th>
                <th>Phase</th>
                <th>Steps</th>
                <th>Total credit</th>
              </tr>
            </thead>
            <tbody>
              {state.ruleOfCreditTemplates.map((template) => (
                <tr key={template.id}>
                  <td><strong>{template.name}</strong></td>
                  <td>{template.discipline}</td>
                  <td>{template.appliesTo}</td>
                  <td>{template.steps.length}</td>
                  <td>{stepsCreditTotal(template)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {state.ruleOfCreditTemplates.map((template) => (
        <TemplateDetail
          key={template.id}
          template={template}
          assignments={assignments.filter((item) => item.template?.id === template.id)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  )
}

function TemplateDetail({
  template,
  assignments,
  onToggle,
}: {
  template: RuleOfCreditTemplate
  assignments: Array<{ entry: ProgressCreditEntry; earned: number; label: string }>
  onToggle: (entry: ProgressCreditEntry, stepId: string) => void
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">{template.appliesTo}</span>
          <h3>{template.name}</h3>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Credit %</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {template.steps.map((step) => (
              <tr key={step.id}>
                <td>{step.sequence}. {step.name}</td>
                <td>{step.creditPercent}%</td>
                <td className="muted">{step.evidenceRequired ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assignments.length > 0 && (
        <>
          <div className="panel-subheader">
            <span className="eyebrow">Active assignments</span>
          </div>
          {assignments.map(({ entry, earned, label }) => (
            <article key={entry.id} className="roc-assignment">
              <div className="roc-assignment-head">
                <strong>{label}</strong>
                <span className="badge badge-good">{earned.toFixed(0)}% earned</span>
              </div>
              <div className="chip-row">
                {template.steps.map((step) => {
                  const done = entry.completedStepIds.includes(step.id)
                  return (
                    <button
                      key={step.id}
                      type="button"
                      className={`chip-toggle ${done ? 'active' : ''}`}
                      onClick={() => onToggle(entry, step.id)}
                    >
                      {done ? '✓' : '○'} {step.name} ({step.creditPercent}%)
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  )
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
