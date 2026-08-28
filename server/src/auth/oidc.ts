import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyLike } from 'jose'
import type { Role } from './roles.js'
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByOidcSubject,
  type UserRecord,
  setUserRole,
} from './userStore.js'
import { setProjectRole } from './projectRoles.js'

const VALID_OIDC_ROLES: Role[] = ['viewer', 'cost_controller', 'approver', 'admin']

/** Public: SSO login blocked when email/identity cannot be linked safely. */
export class OidcAccountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OidcAccountError'
  }
}

/** OIDC is active only when both an issuer and a client id (audience) are set. */
export function isOidcEnabled(): boolean {
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID)
}

export function defaultOidcRole(): Role {
  const role = process.env.OIDC_DEFAULT_ROLE as Role | undefined
  if (role && !VALID_OIDC_ROLES.includes(role)) {
    return 'viewer'
  }
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
  groups?: string[]
}

export async function verifyOidcIdToken(
  idToken: string,
  keyInput?: JWTVerifyGetKey | KeyLike | Uint8Array,
  expectedNonce?: string,
): Promise<OidcProfile | null> {
  if (!isOidcEnabled()) return null
  try {
    const key = keyInput ?? getJwks()
    const options = {
      issuer: process.env.OIDC_ISSUER,
      audience: process.env.OIDC_CLIENT_ID,
    }
    // jose exposes two jwtVerify overloads (static key vs. JWKS getter function);
    // branch so the union type resolves to a single overload.
    const { payload } =
      typeof key === 'function'
        ? await jwtVerify(idToken, key as JWTVerifyGetKey, options)
        : await jwtVerify(idToken, key, options)
    if (typeof payload.sub !== 'string') return null
    if (expectedNonce && payload.nonce !== expectedNonce) return null
    const email = typeof payload.email === 'string' ? payload.email : ''
    const name = typeof payload.name === 'string' ? payload.name : email || payload.sub
    const groupsClaim = process.env.OIDC_GROUPS_CLAIM ?? 'groups'
    const rawGroups = payload[groupsClaim]
    const groups = Array.isArray(rawGroups)
      ? rawGroups.filter((group): group is string => typeof group === 'string')
      : typeof rawGroups === 'string'
        ? [rawGroups]
        : []
    return { subject: payload.sub, email, name, groups }
  } catch {
    return null
  }
}

/**
 * Map a verified OIDC profile to a local user, creating one on first login.
 * Does not hijack existing password accounts by email alone.
 */
export async function findOrProvisionOidcUser(profile: OidcProfile): Promise<UserRecord> {
  const bySubject = await findUserByOidcSubject(profile.subject)
  if (bySubject) return bySubject

  if (profile.email) {
    const byEmail = await findUserByEmail(profile.email)
    if (byEmail) {
      if (byEmail.oidcSubject && byEmail.oidcSubject !== profile.subject) {
        throw new OidcAccountError('This email is linked to a different SSO identity.')
      }
      if (byEmail.provider === 'local' && !byEmail.oidcSubject) {
        throw new OidcAccountError(
          'An account with this email uses password login. Sign in with password or ask an admin to link SSO.',
        )
      }
      return byEmail
    }
  }

  return createUser({
    email: profile.email || `${profile.subject}@oidc.local`,
    name: profile.name,
    role: defaultOidcRole(),
    provider: 'oidc',
    oidcSubject: profile.subject,
  })
}

interface OidcGroupMapping {
  group: string
  globalRole?: Role
  projects?: Record<string, Role>
}

function configuredGroupMappings(): OidcGroupMapping[] {
  if (!process.env.OIDC_GROUP_MAPPINGS) return []
  const parsed = JSON.parse(process.env.OIDC_GROUP_MAPPINGS) as unknown
  if (!Array.isArray(parsed)) throw new Error('OIDC_GROUP_MAPPINGS must be a JSON array')
  return parsed.filter(
    (entry): entry is OidcGroupMapping =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          'group' in entry &&
          typeof (entry as { group?: unknown }).group === 'string',
      ),
  )
}

export async function applyOidcGroupMappings(
  user: UserRecord,
  groups: string[],
): Promise<UserRecord> {
  const groupSet = new Set(groups.map((group) => group.toLowerCase()))
  const mappings = configuredGroupMappings().filter((mapping) =>
    groupSet.has(mapping.group.toLowerCase()),
  )
  const roleRank: Record<Role, number> = {
    viewer: 1,
    cost_controller: 2,
    approver: 3,
    admin: 4,
  }
  const globalRoles = mappings
    .map((mapping) => mapping.globalRole)
    .filter((role): role is Role => Boolean(role && VALID_OIDC_ROLES.includes(role)))
    .sort((left, right) => roleRank[right] - roleRank[left])
  if (globalRoles[0] && globalRoles[0] !== user.role) {
    await setUserRole(user.id, globalRoles[0])
  }
  for (const mapping of mappings) {
    for (const [projectId, projectRole] of Object.entries(mapping.projects ?? {})) {
      if (VALID_OIDC_ROLES.includes(projectRole)) {
        await setProjectRole(user.id, projectId, projectRole)
      }
    }
  }
  return (await findUserById(user.id)) ?? user
}
