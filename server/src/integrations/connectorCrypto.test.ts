import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// Exercises at-rest encryption of connector OAuth tokens (JSON-file store path).
const KEY_ENV = 'CREDENTIALS_KEY'
const originalKey = process.env[KEY_ENV]
const originalNodeEnv = process.env.NODE_ENV

const credsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/connector_credentials.json')

afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV]
  else process.env[KEY_ENV] = originalKey
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

describe('connector OAuth token encryption', () => {
  it('round-trips tokens with AES-256-GCM and never persists plaintext', async () => {
    process.env[KEY_ENV] = 'unit-test-credentials-key'
    process.env.NODE_ENV = 'test'
    const { saveConnectorOAuth, getConnectorOAuth } = await import('./connectorRegistry.js')
    const tokens = { access_token: 'secret-abc', refresh_token: 'secret-xyz' }
    await saveConnectorOAuth('sap-s4', tokens)

    const read = await getConnectorOAuth('sap-s4')
    expect(read).toEqual(tokens)

    const raw = fs.readFileSync(credsPath, 'utf8')
    expect(raw).toContain('enc:v1:')
    expect(raw).not.toContain('secret-abc')
  })
})
