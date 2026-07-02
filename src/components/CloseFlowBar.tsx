import { Link, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { evaluateMonthlyClose } from '../engine/monthlyCloseProgress'
import { monthlyClosePath, pathForView } from '../routes/viewPaths'
import { useProjectStore } from '../store/projectStore'

export function CloseFlowBar() {
  const { state } = useProjectStore()
  const navigate = useNavigate()
  const close = useMemo(() => evaluateMonthlyClose(state), [state])

  const currentProgress = close.steps.find((step) => step.step.id === close.currentStep.id)
  const currentPath = pathForView(close.currentStep.view)

  return (
    <div className="close-flow-bar" data-testid="close-flow-bar">
      <div className="close-flow-bar-inner">
        <Link className="close-flow-back" to={monthlyClosePath}>
          ← Monthly close
        </Link>
        <div className="close-flow-status">
          <span className="close-flow-step-eyebrow">
            Step {close.currentStep.order} of {close.totalSteps}
          </span>
          <span className="close-flow-step-label">{close.currentStep.title}</span>
          <div className="close-flow-progress-track" aria-hidden>
            <div className="close-flow-progress-fill" style={{ width: `${close.percentComplete}%` }} />
          </div>
        </div>
        {currentProgress && currentProgress.blockers.length > 0 && (
          <span className="close-flow-blocker">{currentProgress.blockers[0]}</span>
        )}
        <button
          className="primary-button close-flow-continue"
          type="button"
          onClick={() => navigate(currentPath)}
          data-testid="close-flow-continue"
        >
          {close.percentComplete === 100 ? 'Review close hub' : 'Continue close →'}
        </button>
      </div>
    </div>
  )
}
