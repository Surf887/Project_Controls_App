import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { validateEnv, rateLimitDisabled } from './env.js'

describe('validateEnv', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'development' }
    delete process.env.DATABASE_URL
    delete process.env.DEMO_AUTH
    delete process.env.DISABLE_RATE_LIMIT
    delete process.env.OIDC_DEFAULT_ROLE
    delete process.env.OIDC_ISSUER
    delete process.env.OIDC_CLIENT_ID
    delete process.env.OIDC_REDIRECT_URI
    delete process.env.OIDC_AUTHORIZATION_ENDPOINT
    delete process.env.OIDC_TOKEN_ENDPOINT
    delete process.env.OIDC_TOKEN_AUTH_METHOD
    delete process.env.ADMIN_PASSWORD
    delete process.env.USERS_PATH
    delete process.env.AUDIT_HMAC_SECRET
    delete process.env.CREDENTIALS_KEY
    delete process.env.METRICS_TOKEN
    delete process.env.ENABLE_SIMULATED_INTEGRATIONS
    delete process.env.DOCUMENT_ENCRYPTION_KEY
    delete process.env.DOCUMENT_SCAN_ENDPOINT
    delete process.env.SNOWFLAKE_ACCOUNT
    delete process.env.SNOWFLAKE_USERNAME
    delete process.env.SNOWFLAKE_WAREHOUSE
    delete process.env.SNOWFLAKE_DATABASE
    delete process.env.SNOWFLAKE_SCHEMA
    delete process.env.SNOWFLAKE_OAUTH_TOKEN
    delete process.env.SNOWFLAKE_PRIVATE_KEY
    delete process.env.SNOWFLAKE_PASSWORD
    delete process.env.SNOWFLAKE_ALLOW_PASSWORD_AUTH
    delete process.env.PLANVIEW_BASE_URL
    delete process.env.PLANVIEW_OAUTH_TOKEN
    delete process.env.PLANVIEW_CLIENT_ID
    delete process.env.PLANVIEW_CLIENT_SECRET
    delete process.env.PLANVIEW_TOKEN_URL
    delete process.env.PLANVIEW_API_KEY
    delete process.env.APP_REPLICA_COUNT
    delete process.env.REDIS_URL
    delete process.env.INGESTION_ASYNC
  })

  afterEach(() => {
    process.env = env
  })

  it('passes in development without DATABASE_URL', () => {
    expect(() => validateEnv()).not.toThrow()
  })

  it('requires DATABASE_URL in production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => validateEnv()).toThrow(/DATABASE_URL/)
  })

  it('rejects DEMO_AUTH in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://localhost/test'
    process.env.DEMO_AUTH = 'true'
    expect(() => validateEnv()).toThrow(/DEMO_AUTH/)
  })

  it('rejects DISABLE_RATE_LIMIT in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://localhost/test'
    process.env.DISABLE_RATE_LIMIT = 'true'
    expect(() => validateEnv()).toThrow(/DISABLE_RATE_LIMIT/)
  })

  it('rejects simulated integrations in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://localhost/test'
    process.env.ENABLE_SIMULATED_INTEGRATIONS = 'true'
    expect(() => validateEnv()).toThrow(/ENABLE_SIMULATED_INTEGRATIONS/)
  })

  it('requires dedicated audit and credential secrets in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgres://localhost/test'
    expect(() => validateEnv()).toThrow(/AUDIT_HMAC_SECRET/)

    process.env.AUDIT_HMAC_SECRET = 'audit-secret-long-enough'
    expect(() => validateEnv()).toThrow(/CREDENTIALS_KEY/)

    process.env.CREDENTIALS_KEY = 'credential-secret-long-enough'
    expect(() => validateEnv()).toThrow(/DOCUMENT_ENCRYPTION_KEY/)

    process.env.DOCUMENT_ENCRYPTION_KEY = 'document-secret-long-enough'
    expect(() => validateEnv()).toThrow(/DOCUMENT_SCAN_ENDPOINT/)

    process.env.DOCUMENT_SCAN_ENDPOINT = 'http://scanner.internal/scan'
    expect(() => validateEnv()).toThrow(/INGESTION_ASYNC/)

    process.env.INGESTION_ASYNC = 'true'
    expect(() => validateEnv()).not.toThrow()
  })

  it('rejects a short metrics bearer token', () => {
    process.env.METRICS_TOKEN = 'short'
    expect(() => validateEnv()).toThrow(/METRICS_TOKEN/)
  })

  it('rejects partial Snowflake configuration', () => {
    process.env.SNOWFLAKE_ACCOUNT = 'account'
    expect(() => validateEnv()).toThrow(/SNOWFLAKE_USERNAME/)
  })

  it('rejects partial Planview configuration', () => {
    process.env.PLANVIEW_BASE_URL = 'https://example.pvcloud.com/public-api/v1'
    expect(() => validateEnv()).toThrow(/Planview requires/)
  })

  it('requires Redis for multiple replicas', () => {
    process.env.APP_REPLICA_COUNT = '2'
    expect(() => validateEnv()).toThrow(/REDIS_URL/)
  })
})

describe('rateLimitDisabled', () => {
  it('is disabled in test', () => {
    process.env.NODE_ENV = 'test'
    expect(rateLimitDisabled()).toBe(true)
  })
})
