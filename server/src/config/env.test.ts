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
    delete process.env.ADMIN_PASSWORD
    delete process.env.USERS_PATH
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
})

describe('rateLimitDisabled', () => {
  it('is disabled in test', () => {
    process.env.NODE_ENV = 'test'
    expect(rateLimitDisabled()).toBe(true)
  })
})
