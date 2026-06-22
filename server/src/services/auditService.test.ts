import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendImmutableAudit,
  listImmutableAudit,
  verifyAuditChain,
} from './auditService.js'

const originalAuditDir = process.env.AUDIT_DIR

afterEach(() => {
  if (originalAuditDir) {
    process.env.AUDIT_DIR = originalAuditDir
  } else {
    delete process.env.AUDIT_DIR
  }
})

describe('auditService immutability', () => {
  it('appends events with hash chain', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-audit-'))
    process.env.AUDIT_DIR = tempDir
    const projectId = `test-${Date.now()}`

    appendImmutableAudit(projectId, {
      actor: 'Tester',
      actorId: 'u-test',
      team: 'QA',
      entityType: 'project',
      entityId: projectId,
      action: 'SET_COST_SHEET',
      summary: 'Test audit entry',
    })

    const events = listImmutableAudit(projectId)
    expect(events).toHaveLength(1)
    expect(events[0]!.prevHash).toBe('GENESIS')
    expect(events[0]!.hash).toMatch(/^[a-f0-9]{64}$/)

    appendImmutableAudit(projectId, {
      actor: 'Tester',
      actorId: 'u-test',
      team: 'QA',
      entityType: 'project',
      entityId: projectId,
      action: 'SUBMIT_FORECAST',
      summary: 'Second entry',
    })

    const chain = verifyAuditChain(projectId)
    expect(chain.ok).toBe(true)
    expect(listImmutableAudit(projectId)).toHaveLength(2)
  })
})
