import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
function resolveAuditDir(): string {
  return process.env.AUDIT_DIR ?? path.resolve(__dirname, '../../data/audit')
}

function auditPath(projectId: string): string {
  return path.join(resolveAuditDir(), `${projectId}.jsonl`)
}

function ensureAuditDir() {
  fs.mkdirSync(resolveAuditDir(), { recursive: true })
}

export interface ImmutableAuditEvent {
  seq: number
  id: string
  projectId: string
  at: string
  actor: string
  actorId: string
  team: string
  entityType: string
  entityId: string
  action: string
  summary: string
  prevHash: string
  hash: string
  payload?: Record<string, unknown>
}

function hashEntry(payload: Omit<ImmutableAuditEvent, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function readLastEvent(projectId: string): ImmutableAuditEvent | null {
  const file = auditPath(projectId)
  if (!fs.existsSync(file)) {
    return null
  }
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  if (lines.length === 0) {
    return null
  }
  return JSON.parse(lines[lines.length - 1]!) as ImmutableAuditEvent
}

export function appendImmutableAudit(
  projectId: string,
  partial: {
    actor: string
    actorId: string
    team: string
    entityType: string
    entityId: string
    action: string
    summary: string
    payload?: Record<string, unknown>
  },
): ImmutableAuditEvent {
  ensureAuditDir()
  const last = readLastEvent(projectId)
  const seq = (last?.seq ?? 0) + 1
  const prevHash = last?.hash ?? 'GENESIS'

  const withoutHash = {
    seq,
    id: `AUD-${projectId}-${seq}`,
    projectId,
    at: new Date().toISOString(),
    ...partial,
    prevHash,
  }

  const event: ImmutableAuditEvent = {
    ...withoutHash,
    hash: hashEntry(withoutHash),
  }

  fs.appendFileSync(auditPath(projectId), `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

export function listImmutableAudit(projectId: string, limit = 200): ImmutableAuditEvent[] {
  const file = auditPath(projectId)
  if (!fs.existsSync(file)) {
    return []
  }
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  return lines
    .slice(-limit)
    .map((line) => JSON.parse(line) as ImmutableAuditEvent)
    .reverse()
}

export function verifyAuditChain(projectId: string): { ok: boolean; errors: string[] } {
  const file = auditPath(projectId)
  if (!fs.existsSync(file)) {
    return { ok: true, errors: [] }
  }

  const errors: string[] = []
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  let prevHash = 'GENESIS'

  lines.forEach((line, index) => {
    const event = JSON.parse(line) as ImmutableAuditEvent
    if (event.prevHash !== prevHash) {
      errors.push(`Line ${index + 1}: prevHash mismatch`)
    }
    const { hash: _hash, ...rest } = event
    const expected = hashEntry(rest as Omit<ImmutableAuditEvent, 'hash'>)
    if (event.hash !== expected) {
      errors.push(`Line ${index + 1}: hash integrity failure`)
    }
    prevHash = event.hash
  })

  return { ok: errors.length === 0, errors }
}
