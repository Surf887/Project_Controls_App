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
const originalHmacSecret = process.env.AUDIT_HMAC_SECRET

afterEach(() => {
  if (originalAuditDir) {
    process.env.AUDIT_DIR = originalAuditDir
  } else {
    delete process.env.AUDIT_DIR
  }
  if (originalHmacSecret) {
    process.env.AUDIT_HMAC_SECRET = originalHmacSecret
  } else {
    delete process.env.AUDIT_HMAC_SECRET
  }
})

function useTempAuditDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-audit-'))
  process.env.AUDIT_DIR = tempDir
  return tempDir
}

function appendTestEvent(projectId: string, summary: string) {
  return appendImmutableAudit(projectId, {
    actor: 'Tester',
    actorId: 'u-test',
    team: 'QA',
    entityType: 'project',
    entityId: projectId,
    action: 'SET_COST_SHEET',
    summary,
  })
}

describe('auditService immutability', () => {
  it('appends events with hash chain', () => {
    useTempAuditDir()
    delete process.env.AUDIT_HMAC_SECRET
    const projectId = `test-${Date.now()}`

    appendTestEvent(projectId, 'Test audit entry')

    const events = listImmutableAudit(projectId)
    expect(events).toHaveLength(1)
    expect(events[0]!.prevHash).toBe('GENESIS')
    expect(events[0]!.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(events[0]!.alg).toBe('sha256')

    appendTestEvent(projectId, 'Second entry')

    const chain = verifyAuditChain(projectId)
    expect(chain.ok).toBe(true)
    expect(listImmutableAudit(projectId)).toHaveLength(2)
  })

  it('writes HMAC-keyed events when AUDIT_HMAC_SECRET is configured', () => {
    useTempAuditDir()
    process.env.AUDIT_HMAC_SECRET = 'test-audit-secret'
    const projectId = `keyed-${Date.now()}`

    appendTestEvent(projectId, 'Keyed entry')
    appendTestEvent(projectId, 'Second keyed entry')

    const events = listImmutableAudit(projectId)
    expect(events.every((event) => event.alg === 'hmac-sha256')).toBe(true)
    expect(verifyAuditChain(projectId).ok).toBe(true)
  })

  it('fails verification when a keyed event is recomputed with the wrong secret', () => {
    useTempAuditDir()
    process.env.AUDIT_HMAC_SECRET = 'correct-secret'
    const projectId = `tamper-${Date.now()}`
    appendTestEvent(projectId, 'Keyed entry')

    process.env.AUDIT_HMAC_SECRET = 'wrong-secret'
    const chain = verifyAuditChain(projectId)
    expect(chain.ok).toBe(false)
    expect(chain.errors.some((error) => error.includes('hash integrity failure'))).toBe(true)
  })

  it('detects tampered payloads in a keyed chain', () => {
    const tempDir = useTempAuditDir()
    process.env.AUDIT_HMAC_SECRET = 'test-audit-secret'
    const projectId = `edit-${Date.now()}`
    appendTestEvent(projectId, 'Original summary')

    const file = path.join(tempDir, `${projectId}.jsonl`)
    const tampered = fs
      .readFileSync(file, 'utf8')
      .replace('Original summary', 'Rewritten summary')
    fs.writeFileSync(file, tampered, 'utf8')

    const chain = verifyAuditChain(projectId)
    expect(chain.ok).toBe(false)
  })

  it('flags unkeyed events found in a keyed chain', () => {
    useTempAuditDir()
    delete process.env.AUDIT_HMAC_SECRET
    const projectId = `mixed-${Date.now()}`
    appendTestEvent(projectId, 'Legacy unkeyed entry')

    process.env.AUDIT_HMAC_SECRET = 'now-keyed'
    const chain = verifyAuditChain(projectId)
    expect(chain.ok).toBe(false)
    expect(chain.errors.some((error) => error.includes('unkeyed (sha256) event'))).toBe(true)
  })
})
