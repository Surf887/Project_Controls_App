import { describe, expect, it } from 'vitest'
import { createSeedState } from '@pc/store/seedState.js'
import { validateProjectAction, ActionValidationError } from '@pc/engine/actionValidation.js'
import { applyProjectAction } from '@pc/store/projectReducer.js'
import type { ExtractedValue } from '@pc/data/projectData.js'

describe('validateProjectAction', () => {
  it('blocks LOCK_REPORTING_PERIOD when approved extractions are pending apply', () => {
    const state = createSeedState()
    const values = state.values.map((value) =>
      value.id === 'val-003'
        ? ({ ...value, reviewStatus: 'approved', approvalStatus: 'approved', applied: undefined } as ExtractedValue)
        : value,
    )
    const withPending = applyProjectAction(state, { type: 'SET_VALUES', payload: values })

    expect(() =>
      validateProjectAction(withPending, {
        type: 'LOCK_REPORTING_PERIOD',
        payload: { actor: 'PM', period: withPending.settings.reportingPeriod.period },
      }),
    ).toThrow(ActionValidationError)
  })
})
