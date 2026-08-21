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

  it('requires cost_controller for schedule imports and mappings', () => {
    expect(canPerformActionType('viewer', 'IMPORT_SCHEDULE')).toBe(false)
    expect(canPerformActionType('cost_controller', 'IMPORT_SCHEDULE')).toBe(true)
    expect(canPerformActionType('cost_controller', 'UPDATE_SCHEDULE_ACTIVITY_MAPPING')).toBe(true)
  })

  it('separates document review from forecast-driver approval', () => {
    expect(canPerformActionType('cost_controller', 'IMPORT_DOCUMENT_DRAFTS')).toBe(true)
    expect(canPerformActionType('cost_controller', 'UPDATE_FORECAST_DRIVER')).toBe(true)
    expect(canPerformActionType('cost_controller', 'DECIDE_FORECAST_DRIVER')).toBe(false)
    expect(canPerformActionType('approver', 'DECIDE_FORECAST_DRIVER')).toBe(true)
  })

  it('allows data stewards to version profiles but reserves deletion for admins', () => {
    expect(canPerformActionType('cost_controller', 'UPSERT_MAPPING_PROFILE')).toBe(true)
    expect(canPerformActionType('cost_controller', 'DELETE_MAPPING_PROFILE')).toBe(false)
    expect(canPerformActionType('admin', 'DELETE_MAPPING_PROFILE')).toBe(true)
  })

  it('separates Snowflake staging, approval, and posting duties', () => {
    expect(canPerformActionType('cost_controller', 'IMPORT_COST_TRANSACTION_BATCH')).toBe(true)
    expect(canPerformActionType('cost_controller', 'DECIDE_COST_TRANSACTION_BATCH')).toBe(false)
    expect(canPerformActionType('approver', 'DECIDE_COST_TRANSACTION_BATCH')).toBe(true)
    expect(canPerformActionType('cost_controller', 'POST_COST_TRANSACTION_BATCH')).toBe(true)
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
