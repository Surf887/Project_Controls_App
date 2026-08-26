import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { getJwtSecret } from './jwt.js'

interface OidcDiscovery {
  authorization_endpoint: string
  token_endpoint: string
}

export interface OidcFlowState {
  state: string
  nonce: string
  verifier: string
  returnTo: string
}

let discoveryCache: OidcDiscovery | null = null

function base64Url(value: Buffer): string {
  return value.toString('base64url')
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value.slice(0, 500)
}

async function discovery(): Promise<OidcDiscovery> {
  const authorization = process.env.OIDC_AUTHORIZATION_ENDPOINT
  const token = process.env.OIDC_TOKEN_ENDPOINT
  if (authorization && token) {
    return { authorization_endpoint: authorization, token_endpoint: token }
  }
  if (discoveryCache) return discoveryCache
  const issuer = process.env.OIDC_ISSUER
  if (!issuer) throw new Error('OIDC issuer is not configured')
  const url = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : `${issuer}/`)
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`)
  const result = (await response.json()) as Partial<OidcDiscovery>
  if (!result.authorization_endpoint || !result.token_endpoint) {
    throw new Error('OIDC discovery response omitted authorization/token endpoints')
  }
  discoveryCache = result as OidcDiscovery
  return discoveryCache
}

export async function createOidcAuthorization(returnTo?: string): Promise<{
  authorizationUrl: string
  flowCookie: string
}> {
  const clientId = process.env.OIDC_CLIENT_ID
  const redirectUri = process.env.OIDC_REDIRECT_URI
  if (!clientId || !redirectUri) throw new Error('OIDC client ID and redirect URI are required')
  const state = base64Url(randomBytes(32))
  const nonce = base64Url(randomBytes(32))
  const verifier = base64Url(randomBytes(64))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const endpoints = await discovery()
  const url = new URL(endpoints.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', process.env.OIDC_SCOPES ?? 'openid profile email')
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')

  const flowCookie = await new SignJWT({
    state,
    nonce,
    verifier,
    returnTo: safeReturnTo(returnTo),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('project-controls-oidc-flow')
    .setAudience('project-controls-oidc-callback')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getJwtSecret())
  return { authorizationUrl: url.toString(), flowCookie }
}

export async function verifyOidcFlowCookie(
  cookie: string,
  returnedState: string,
): Promise<OidcFlowState> {
  const { payload } = await jwtVerify(cookie, getJwtSecret(), {
    issuer: 'project-controls-oidc-flow',
    audience: 'project-controls-oidc-callback',
  })
  if (
    typeof payload.state !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.verifier !== 'string' ||
    payload.state !== returnedState
  ) {
    throw new Error('OIDC state validation failed')
  }
  return {
    state: payload.state,
    nonce: payload.nonce,
    verifier: payload.verifier,
    returnTo: safeReturnTo(typeof payload.returnTo === 'string' ? payload.returnTo : '/'),
  }
}

export async function exchangeOidcCode(code: string, verifier: string): Promise<string> {
  const clientId = process.env.OIDC_CLIENT_ID
  const redirectUri = process.env.OIDC_REDIRECT_URI
  if (!clientId || !redirectUri) throw new Error('OIDC client ID and redirect URI are required')
  const endpoints = await discovery()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  })
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
  if (process.env.OIDC_CLIENT_SECRET) {
    if (process.env.OIDC_TOKEN_AUTH_METHOD === 'client_secret_basic') {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${process.env.OIDC_CLIENT_SECRET}`).toString('base64')}`
    } else {
      body.set('client_secret', process.env.OIDC_CLIENT_SECRET)
    }
  }
  const response = await fetch(endpoints.token_endpoint, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`OIDC token exchange failed (${response.status})`)
  const result = (await response.json()) as { id_token?: string }
  if (!result.id_token) throw new Error('OIDC token response omitted id_token')
  return result.id_token
}

export function resetOidcDiscoveryForTest(): void {
  discoveryCache = null
}
