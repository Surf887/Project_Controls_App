import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearMemorySessionsForTest,
  isSessionActive,
  issueSession,
  revokeSession,
  revokeUserSessions,
} from './sessionStore.js'

beforeEach(() => clearMemorySessionsForTest())

describe('revocable sessions', () => {
  it('issues and immediately revokes one session', async () => {
    const session = await issueSession(
      { id: 'memory-user', name: 'Memory User', role: 'viewer' },
      3600,
    )
    expect(await isSessionActive(session.sessionId, 'memory-user')).toBe(true)
    await revokeSession(session.sessionId)
    expect(await isSessionActive(session.sessionId, 'memory-user')).toBe(false)
  })

  it('revokes every active session for a user', async () => {
    const first = await issueSession(
      { id: 'memory-user', name: 'Memory User', role: 'viewer' },
      3600,
    )
    const second = await issueSession(
      { id: 'memory-user', name: 'Memory User', role: 'viewer' },
      3600,
    )
    expect(await revokeUserSessions('memory-user')).toBe(2)
    expect(await isSessionActive(first.sessionId, 'memory-user')).toBe(false)
    expect(await isSessionActive(second.sessionId, 'memory-user')).toBe(false)
  })
})
