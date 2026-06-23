import { describe, expect, it } from 'vitest'
import {
  saveFilterSchema,
  workflowDelegationSchema,
  integrationSyncSchema,
  createBaselineSchema,
} from './schemas.js'

describe('new platform/enterprise validation schemas', () => {
  it('accepts a valid filter and rejects a missing name', () => {
    expect(saveFilterSchema.safeParse({ name: 'My View', scope: 'cost', payload: { a: 'b' } }).success).toBe(true)
    expect(saveFilterSchema.safeParse({ scope: 'cost', payload: {} }).success).toBe(false)
  })

  it('rejects a delegation with a non-ISO until and a bad sync domain', () => {
    expect(
      workflowDelegationSchema.safeParse({
        workflowId: 'w1',
        fromUserId: 'u1',
        toUserId: 'u2',
        until: 'not-a-date',
      }).success,
    ).toBe(false)
    expect(integrationSyncSchema.safeParse({ connectorId: 'sap-s4', domain: 'nope' }).success).toBe(false)
  })

  it('allows an empty baseline payload (all fields optional)', () => {
    expect(createBaselineSchema.safeParse({}).success).toBe(true)
    expect(createBaselineSchema.safeParse({ label: '', notes: 'ok' }).success).toBe(false)
  })
})
