import { afterEach, describe, expect, it } from 'vitest'
import { isDemoAuthEnabled } from './rbac.js'

describe('isDemoAuthEnabled', () => {
  const original = { NODE_ENV: process.env.NODE_ENV, DEMO_AUTH: process.env.DEMO_AUTH }

  function set(nodeEnv: string | undefined, demoAuth: string | undefined) {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
    if (demoAuth === undefined) delete process.env.DEMO_AUTH
    else process.env.DEMO_AUTH = demoAuth
  }

  afterEach(() => {
    set(original.NODE_ENV, original.DEMO_AUTH)
  })

  it('is OFF in production even if DEMO_AUTH=true', () => {
    set('production', 'true')
    expect(isDemoAuthEnabled()).toBe(false)
  })

  it('is OFF in staging when DEMO_AUTH is unset', () => {
    set('staging', undefined)
    expect(isDemoAuthEnabled()).toBe(false)
  })

  it('is OFF when NODE_ENV is unset and DEMO_AUTH is unset', () => {
    set(undefined, undefined)
    expect(isDemoAuthEnabled()).toBe(false)
  })

  it('is ON in development when DEMO_AUTH is unset', () => {
    set('development', undefined)
    expect(isDemoAuthEnabled()).toBe(true)
  })

  it('honors explicit DEMO_AUTH=true outside production', () => {
    set('staging', 'true')
    expect(isDemoAuthEnabled()).toBe(true)
  })

  it('honors explicit DEMO_AUTH=false in development', () => {
    set('development', 'false')
    expect(isDemoAuthEnabled()).toBe(false)
  })
})
