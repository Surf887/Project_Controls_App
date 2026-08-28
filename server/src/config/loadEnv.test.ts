import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadRootEnvFile, resolveRootEnvFile } from './loadEnv.js'

const originalEnvFile = process.env.ENV_FILE

afterEach(() => {
  delete process.env.LOAD_ENV_TEST_VALUE
  if (originalEnvFile == null) delete process.env.ENV_FILE
  else process.env.ENV_FILE = originalEnvFile
})

describe('root environment loading', () => {
  it('finds the repository-parent .env when development runs from server/', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-env-'))
    const server = path.join(root, 'server')
    fs.mkdirSync(server)
    const envFile = path.join(root, '.env')
    fs.writeFileSync(envFile, 'LOAD_ENV_TEST_VALUE=from-root\n')

    expect(resolveRootEnvFile(server, import.meta.url)).toBe(envFile)
    loadRootEnvFile(server, import.meta.url)
    expect(process.env.LOAD_ENV_TEST_VALUE).toBe('from-root')
  })

  it('honours an explicit ENV_FILE without overriding existing variables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-env-explicit-'))
    const envFile = path.join(root, 'custom.env')
    fs.writeFileSync(envFile, 'LOAD_ENV_TEST_VALUE=from-file\n')
    process.env.ENV_FILE = envFile
    process.env.LOAD_ENV_TEST_VALUE = 'already-set'

    loadRootEnvFile(root, import.meta.url)
    expect(process.env.LOAD_ENV_TEST_VALUE).toBe('already-set')
  })
})
