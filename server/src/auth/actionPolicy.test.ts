import { describe, expect, it } from 'vitest'
import {
  canPerformActionType,
  isBlockedClientAction,
  minimumRoleForAction,
} from './actionPolicy.js'

describe('actionPolicy', () => {
  it('blocks client-only audit injection', () => {
    expect(isBlockedClientAction('ADD_AUDIT')).toBe(true)
    expect(canPerformActionType('cost_controller', 'ADD_AUDIT')).toBe(false)
  })

  it('requires approver for forecast approval', () => {
    expect(minimumRoleForAction('APPROVE_FORECAST')).toBe('approver')
    expect(canPerformActionType('cost_controller', 'APPROVE_FORECAST')).toBe(false)
    expect(canPerformActionType('approver', 'APPROVE_FORECAST')).toBe(true)
  })

  it('requires cost_controller for cost sheet edits', () => {
    expect(canPerformActionType('viewer', 'SET_COST_SHEET')).toBe(false)
    expect(canPerformActionType('cost_controller', 'SET_COST_SHEET')).toBe(true)
  })

  it('maps SUBMIT_FORECAST not legacy DRAFT names', () => {
    expect(minimumRoleForAction('SUBMIT_FORECAST')).toBe('cost_controller')
    expect(canPerformActionType('cost_controller', 'SUBMIT_FORECAST')).toBe(true)
  })

  it('rejects unknown action types', () => {
    expect(minimumRoleForAction('NOT_A_REAL_ACTION')).toBeNull()
    expect(canPerformActionType('admin', 'NOT_A_REAL_ACTION')).toBe(false)
  })
})
