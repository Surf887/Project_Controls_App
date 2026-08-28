import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, type KeyLike } from 'jose'
import { randomUUID } from 'node:crypto'
import { createUser } from './userStore.js'
import { getProjectRole } from './projectRoles.js'

process.env.OIDC_ISSUER = 'https://idp.example.com'
process.env.OIDC_CLIENT_ID = 'pc-app-client'

let publicKey: KeyLike
let privateKey: KeyLike
let oidc: typeof import('./oidc.js')

async function makeIdToken(overrides: { iss?: string; aud?: string; sub?: string } = {}) {
  return new SignJWT({ email: 'jane@example.com', name: 'Jane' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(overrides.sub ?? 'oidc-sub-123')
    .setIssuer(overrides.iss ?? 'https://idp.example.com')
    .setAudience(overrides.aud ?? 'pc-app-client')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  publicKey = pair.publicKey
  privateKey = pair.privateKey
  await exportJWK(publicKey)
  oidc = await import('./oidc.js')
})

describe('OIDC verification', () => {
  it('reports enabled when issuer + client id are set', () => {
    expect(oidc.isOidcEnabled()).toBe(true)
  })

  it('verifies a correctly-signed id token', async () => {
    const token = await makeIdToken()
    const profile = await oidc.verifyOidcIdToken(token, publicKey)
    expect(profile?.subject).toBe('oidc-sub-123')
    expect(profile?.email).toBe('jane@example.com')
  })

  it('rejects a token with the wrong audience', async () => {
    const token = await makeIdToken({ aud: 'some-other-app' })
    expect(await oidc.verifyOidcIdToken(token, publicKey)).toBeNull()
  })

  it('rejects a token with the wrong issuer', async () => {
    const token = await makeIdToken({ iss: 'https://evil.example.com' })
    expect(await oidc.verifyOidcIdToken(token, publicKey)).toBeNull()
  })
})

describe('OIDC account linking', () => {
  it('does not hijack a local password account by email alone', async () => {
    const email = `local-only-${randomUUID()}@example.com`
    await createUser({
      email,
      name: 'Local User',
      role: 'viewer',
      provider: 'local',
      password: 'password-123',
    })
    await expect(
      oidc.findOrProvisionOidcUser({
        subject: 'oidc-sub-new',
        email,
        name: 'Attacker',
      }),
    ).rejects.toMatchObject({ name: 'OidcAccountError' })
  })

  it('maps IdP groups to global and project-scoped roles', async () => {
    const user = await createUser({
      email: `group-${randomUUID()}@example.com`,
      name: 'Group User',
      role: 'viewer',
      provider: 'oidc',
      oidcSubject: `group-sub-${randomUUID()}`,
    })
    process.env.OIDC_GROUP_MAPPINGS = JSON.stringify([
      {
        group: 'Project Controls Approvers',
        globalRole: 'approver',
        projects: { 'proj-demo-001': 'cost_controller' },
      },
    ])
    try {
      const updated = await oidc.applyOidcGroupMappings(user, ['Project Controls Approvers'])
      expect(updated.role).toBe('approver')
      expect(await getProjectRole(user.id, 'proj-demo-001')).toBe('cost_controller')
    } finally {
      delete process.env.OIDC_GROUP_MAPPINGS
    }
  })
})
