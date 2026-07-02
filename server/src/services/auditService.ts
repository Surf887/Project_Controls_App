import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSafeId, resolveUnderRoot } from '../utils/safePath.js'

export type AuditHashAlg = 'hmac-sha256' | 'sha256'

/** Read lazily so .env loading and per-test overrides are honoured. */
function auditHmacSecret(): string | undefined {
  const secret = process.env.AUDIT_HMAC_SECRET
  return secret && secret.length > 0 ? secret : undefined
}

export function auditChainIsKeyed(): boolean {
  return auditHmacSecret() != null
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
function resolveAuditDir(): string {
  return process.env.AUDIT_DIR ?? path.resolve(__dirname, '../../data/audit')
}

function auditPath(projectId: string): string {
  const safeId = assertSafeId(projectId, 'projectId')
  return resolveUnderRoot(resolveAuditDir(), `${safeId}.jsonl`)
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
  /** Hash algorithm used for this event; absent on legacy events (sha256). */
  alg?: AuditHashAlg
  payload?: Record<string, unknown>
}

/**
 * Keyed (HMAC-SHA256) when AUDIT_HMAC_SECRET is configured, so an attacker with
 * filesystem access cannot rewrite history and recompute a valid chain. Falls
 * back to an unkeyed SHA-256 chain (tamper-evident against casual edits only)
 * when no secret is set — production deployments should always set the secret.
 */
function hashEntry(payload: Omit<ImmutableAuditEvent, 'hash'>, alg: AuditHashAlg): string {
  const serialized = JSON.stringify(payload)
  if (alg === 'hmac-sha256') {
    const secret = auditHmacSecret()
    if (!secret) {
      throw new Error('AUDIT_HMAC_SECRET is not configured — cannot compute keyed audit hash')
    }
    return createHmac('sha256', secret).update(serialized).digest('hex')
  }
  return createHash('sha256').update(serialized).digest('hex')
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
  // A corrupt/partially-written trailing line must not throw here: this runs
  // inside the audit hook, which fires after the project write has already been
  // committed. Throwing would surface a false 500 and prompt the client to
  // retry an action that actually succeeded. Walk back to the last valid line.
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]!) as ImmutableAuditEvent
    } catch {
      // skip corrupt line and try the previous one
    }
  }
  return null
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
  const alg: AuditHashAlg = auditChainIsKeyed() ? 'hmac-sha256' : 'sha256'

  const withoutHash = {
    seq,
    id: `AUD-${projectId}-${seq}`,
    projectId,
    at: new Date().toISOString(),
    ...partial,
    prevHash,
    alg,
  }

  const event: ImmutableAuditEvent = {
    ...withoutHash,
    hash: hashEntry(withoutHash, alg),
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
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ImmutableAuditEvent]
      } catch {
        return []
      }
    })
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
    let event: ImmutableAuditEvent
    try {
      event = JSON.parse(line) as ImmutableAuditEvent
    } catch {
      errors.push(`Line ${index + 1}: unparseable audit record`)
      return
    }
    if (event.prevHash !== prevHash) {
      errors.push(`Line ${index + 1}: prevHash mismatch`)
    }

    // Legacy events (written before alg existed) are unkeyed SHA-256.
    const alg: AuditHashAlg = event.alg ?? 'sha256'
    if (alg === 'hmac-sha256' && !auditChainIsKeyed()) {
      errors.push(`Line ${index + 1}: keyed event but AUDIT_HMAC_SECRET is not configured`)
      prevHash = event.hash
      return
    }
    // When a secret is configured, an unkeyed event in the chain is a tamper
    // vector (an attacker could rewrite history as sha256 records) — flag it.
    if (alg === 'sha256' && auditChainIsKeyed()) {
      errors.push(`Line ${index + 1}: unkeyed (sha256) event in a keyed audit chain`)
    }

    const { hash: _hash, ...rest } = event
    const expected = hashEntry(rest as Omit<ImmutableAuditEvent, 'hash'>, alg)
    if (event.hash !== expected) {
      errors.push(`Line ${index + 1}: hash integrity failure`)
    }
    prevHash = event.hash
  })

  return { ok: errors.length === 0, errors }
}
