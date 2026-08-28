import { randomUUID } from 'node:crypto'
import type { SessionUser } from './jwt.js'
import { signSessionToken } from './jwt.js'
import { isPostgresEnabled, query } from '../db/postgres.js'
import { findUserById } from './userStore.js'

interface MemorySession {
  id: string
  userId: string
  expiresAt: string
  revokedAt?: string
}

const memorySessions = new Map<string, MemorySession>()

export async function issueSession(
  user: SessionUser,
  expiresInSec: number,
): Promise<{ token: string; sessionId: string }> {
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString()
  const token = await signSessionToken(user, expiresInSec, sessionId)
  const persistentUser = isPostgresEnabled() ? await findUserById(user.id) : null
  if (isPostgresEnabled() && persistentUser) {
    await query(
      `INSERT INTO auth_sessions (id, user_id, expires_at)
       VALUES ($1,$2,$3)`,
      [sessionId, user.id, expiresAt],
    )
  } else {
    memorySessions.set(sessionId, { id: sessionId, userId: user.id, expiresAt })
  }
  return { token, sessionId }
}

export async function isSessionActive(sessionId: string, userId: string): Promise<boolean> {
  const memory = memorySessions.get(sessionId)
  if (memory) {
    return (
      memory.userId === userId &&
      !memory.revokedAt &&
      Date.parse(memory.expiresAt) > Date.now()
    )
  }
  if (!isPostgresEnabled()) return false
  const result = await query<{ active: boolean }>(
    `SELECT (revoked_at IS NULL AND expires_at > NOW()) AS active
     FROM auth_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  )
  return result.rows[0]?.active ?? false
}

export async function revokeSession(sessionId: string): Promise<void> {
  const memory = memorySessions.get(sessionId)
  if (memory) {
    memorySessions.set(sessionId, { ...memory, revokedAt: new Date().toISOString() })
    return
  }
  if (isPostgresEnabled()) {
    await query(
      `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = $1`,
      [sessionId],
    )
  }
}

export async function revokeUserSessions(userId: string): Promise<number> {
  let count = 0
  for (const [id, session] of memorySessions) {
    if (session.userId === userId && !session.revokedAt) {
      memorySessions.set(id, { ...session, revokedAt: new Date().toISOString() })
      count += 1
    }
  }
  if (isPostgresEnabled()) {
    const result = await query(
      `UPDATE auth_sessions SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [userId],
    )
    count += result.rowCount ?? 0
  }
  return count
}

export async function pruneExpiredSessions(): Promise<void> {
  for (const [id, session] of memorySessions) {
    if (Date.parse(session.expiresAt) <= Date.now()) memorySessions.delete(id)
  }
  if (isPostgresEnabled()) {
    await query(`DELETE FROM auth_sessions WHERE expires_at < NOW() - INTERVAL '7 days'`)
  }
}

export function clearMemorySessionsForTest(): void {
  memorySessions.clear()
}
