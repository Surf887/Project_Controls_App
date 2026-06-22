import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyLike } from 'jose'
import type { Role } from './roles.js'
import {
  createUser,
  findUserByEmail,
  findUserByOidcSubject,
  type UserRecord,
} from './userStore.js'

/** OIDC is active only when both an issuer and a client id (audience) are set. */
export function isOidcEnabled(): boolean {
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID)
}

export function defaultOidcRole(): Role {
  const role = process.env.OIDC_DEFAULT_ROLE as Role | undefined
  return role ?? 'viewer'
}

let cachedJwks: JWTVerifyGetKey | null = null
function getJwks(): JWTVerifyGetKey {
  if (cachedJwks) return cachedJwks
  const issuer = process.env.OIDC_ISSUER!
  const jwksUri =
    process.env.OIDC_JWKS_URI ?? new URL('.well-known/jwks.json', issuer.endsWith('/') ? issuer : `${issuer}/`).toString()
  cachedJwks = createRemoteJWKSet(new URL(jwksUri))
  return cachedJwks
}

export interface OidcProfile {
  subject: string
  email: string
  name: string
}

/**
 * Verify an OIDC ID token against the configured provider's JWKS.
 * `keyInput` is injectable so the verification path can be unit-tested with a
 * locally generated key pair; in production it defaults to the remote JWKS.
 */
export async function verifyOidcIdToken(
  idToken: string,
  keyInput?: JWTVerifyGetKey | KeyLike | Uint8Array,
): Promise<OidcProfile | null> {
  if (!isOidcEnabled()) return null
  try {
    const key = keyInput ?? getJwks()
    const { payload } = await jwtVerify(idToken, key as Parameters<typeof jwtVerify>[1], {
      issuer: process.env.OIDC_ISSUER,
      audience: process.env.OIDC_CLIENT_ID,
    })
    if (typeof payload.sub !== 'string') return null
    const email = typeof payload.email === 'string' ? payload.email : ''
    const name = typeof payload.name === 'string' ? payload.name : email || payload.sub
    return { subject: payload.sub, email, name }
  } catch {
    return null
  }
}

/**
 * Map a verified OIDC profile to a local user, creating one on first login.
 * Linking precedence: existing OIDC subject -> existing email -> new user.
 * New users get the default (least-privileged) role; admins elevate explicitly.
 */
export async function findOrProvisionOidcUser(profile: OidcProfile): Promise<UserRecord> {
  const bySubject = await findUserByOidcSubject(profile.subject)
  if (bySubject) return bySubject

  if (profile.email) {
    const byEmail = await findUserByEmail(profile.email)
    if (byEmail) return byEmail
  }

  return createUser({
    email: profile.email || `${profile.subject}@oidc.local`,
    name: profile.name,
    role: defaultOidcRole(),
    provider: 'oidc',
    oidcSubject: profile.subject,
  })
}
