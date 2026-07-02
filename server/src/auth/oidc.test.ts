import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, type KeyLike } from 'jose'
import { randomUUID } from 'node:crypto'
import { createUser, findUserByOidcSubject } from './userStore.js'

process.env.OIDC_ISSUER = 'https://idp.example.com'
process.env.OIDC_CLIENT_ID = 'pc-app-client'

let publicKey: KeyLike
let privateKey: KeyLike
let oidc: typeof import('./oidc.js')

async function makeIdToken(
  overrides: { iss?: string; aud?: string; sub?: string; extraClaims?: Record<string, unknown> } = {},
) {
  return new SignJWT({ email: 'jane@example.com', name: 'Jane', ...overrides.extraClaims })
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

  it('ignores the email claim when the IdP marks it unverified', async () => {
    const token = await makeIdToken({ extraClaims: { email_verified: false } })
    const profile = await oidc.verifyOidcIdToken(token, publicKey)
    expect(profile?.subject).toBe('oidc-sub-123')
    expect(profile?.email).toBe('')
  })

  it('keeps the email claim when email_verified is true or absent', async () => {
    const verified = await oidc.verifyOidcIdToken(
      await makeIdToken({ extraClaims: { email_verified: true } }),
      publicKey,
    )
    expect(verified?.email).toBe('jane@example.com')
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

  it('persists the subject when linking an OIDC account that predates subject storage', async () => {
    const email = `oidc-legacy-${randomUUID()}@example.com`
    const subject = `oidc-sub-${randomUUID()}`
    const legacy = await createUser({
      email,
      name: 'Legacy OIDC User',
      role: 'viewer',
      provider: 'oidc',
      oidcSubject: null,
    })

    const linked = await oidc.findOrProvisionOidcUser({ subject, email, name: 'Legacy OIDC User' })
    expect(linked.id).toBe(legacy.id)
    expect(linked.oidcSubject).toBe(subject)

    // Future logins must match by subject, and a different subject with the
    // same email must now be rejected instead of silently reusing the account.
    expect((await findUserByOidcSubject(subject))?.id).toBe(legacy.id)
    await expect(
      oidc.findOrProvisionOidcUser({ subject: 'different-subject', email, name: 'Impostor' }),
    ).rejects.toMatchObject({ name: 'OidcAccountError' })
  })
})
