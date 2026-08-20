import type { Role } from '../auth/roles.js'

const VALID_ROLES: Role[] = ['viewer', 'cost_controller', 'approver', 'admin']

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function isTest(): boolean {
  return process.env.NODE_ENV === 'test'
}

/** Fail fast on misconfiguration before accepting traffic. Skipped in test. */
export function validateEnv(): void {
  if (isTest()) return

  if (isProduction()) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production (JSON file store is dev-only)')
    }
    if (process.env.DEMO_AUTH === 'true') {
      throw new Error('DEMO_AUTH must not be enabled in production')
    }
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      throw new Error('DISABLE_RATE_LIMIT must not be enabled in production')
    }
    if (process.env.ENABLE_SIMULATED_INTEGRATIONS === 'true') {
      throw new Error('ENABLE_SIMULATED_INTEGRATIONS must not be enabled in production')
    }
    if (process.env.USERS_PATH) {
      throw new Error('USERS_PATH must not be set in production — use Postgres users table')
    }
    for (const name of ['AUDIT_HMAC_SECRET', 'CREDENTIALS_KEY'] as const) {
      const value = process.env[name]
      if (!value || value.length < 16) {
        throw new Error(`${name} must be set to at least 16 characters in production`)
      }
    }
  }

  if (process.env.OIDC_DEFAULT_ROLE && !VALID_ROLES.includes(process.env.OIDC_DEFAULT_ROLE as Role)) {
    throw new Error(`Invalid OIDC_DEFAULT_ROLE: ${process.env.OIDC_DEFAULT_ROLE}`)
  }

  if (process.env.METRICS_TOKEN && process.env.METRICS_TOKEN.length < 16) {
    throw new Error('METRICS_TOKEN must be at least 16 characters when configured')
  }

  const oidcIssuer = process.env.OIDC_ISSUER
  const oidcClient = process.env.OIDC_CLIENT_ID
  if (oidcIssuer && !oidcClient) {
    throw new Error('OIDC_CLIENT_ID is required when OIDC_ISSUER is set')
  }
  if (oidcClient && !oidcIssuer) {
    throw new Error('OIDC_ISSUER is required when OIDC_CLIENT_ID is set')
  }

  if (isProduction() && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters in production')
  }
}

export function rateLimitDisabled(): boolean {
  if (isTest()) return true
  if (isProduction()) return false
  return process.env.DISABLE_RATE_LIMIT === 'true'
}

export function trustProxySetting(): number | boolean | undefined {
  const raw = process.env.TRUST_PROXY
  if (!raw) return undefined
  if (raw === 'true') return 1
  const hops = Number(raw)
  return Number.isFinite(hops) && hops > 0 ? hops : undefined
}
