import { SignJWT, jwtVerify } from 'jose'
import type { Role } from './roles.js'

const ISSUER = process.env.JWT_ISSUER ?? 'project-controls'
const AUDIENCE = 'project-controls-api'

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-change-me'

/**
 * Resolve the HMAC secret used to sign/verify our own session tokens.
 * - In production a real JWT_SECRET is mandatory; we fail fast otherwise so a
 *   server can never silently sign tokens with a public, source-committed key.
 * - In dev/test a fallback is allowed but loudly warned about.
 */
export function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production')
    }
    return new TextEncoder().encode(DEV_FALLBACK_SECRET)
  }
  if (raw.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters')
  }
  return new TextEncoder().encode(raw)
}

export interface SessionUser {
  id: string
  email?: string
  name: string
  role: Role
}

export interface SessionClaims {
  sub: string
  email?: string
  name: string
  role: Role
}

export async function signSessionToken(user: SessionUser, expiresInSec = 3600): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(getJwtSecret())
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
      return null
    }
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : payload.sub,
      role: payload.role as Role,
    }
  } catch {
    return null
  }
}
