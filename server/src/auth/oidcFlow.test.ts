import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createOidcAuthorization,
  resetOidcDiscoveryForTest,
  verifyOidcFlowCookie,
} from './oidcFlow.js'

const original = { ...process.env }

beforeEach(() => {
  process.env.JWT_SECRET = 'oidc-flow-test-secret-long'
  process.env.OIDC_ISSUER = 'https://idp.example.com/'
  process.env.OIDC_CLIENT_ID = 'project-controls'
  process.env.OIDC_REDIRECT_URI = 'https://controls.example.com/api/platform/auth/oidc/callback'
  process.env.OIDC_AUTHORIZATION_ENDPOINT = 'https://idp.example.com/authorize'
  process.env.OIDC_TOKEN_ENDPOINT = 'https://idp.example.com/token'
  resetOidcDiscoveryForTest()
})

afterEach(() => {
  process.env = { ...original }
  resetOidcDiscoveryForTest()
})

describe('OIDC Authorization Code + PKCE flow', () => {
  it('creates a signed flow cookie and S256 authorization request', async () => {
    const created = await createOidcAuthorization('/schedule-control')
    const url = new URL(created.authorizationUrl)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('nonce')).toBeTruthy()

    const flow = await verifyOidcFlowCookie(
      created.flowCookie,
      url.searchParams.get('state')!,
    )
    expect(flow.returnTo).toBe('/schedule-control')
    expect(flow.verifier.length).toBeGreaterThan(40)
  })

  it('rejects callback state tampering', async () => {
    const created = await createOidcAuthorization('/')
    await expect(
      verifyOidcFlowCookie(created.flowCookie, 'attacker-state'),
    ).rejects.toThrow(/state validation/)
  })
})
