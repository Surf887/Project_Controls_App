import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Load project-root `.env` into process.env (does not override existing vars). */
export function resolveRootEnvFile(
  cwd = process.cwd(),
  moduleUrl = import.meta.url,
): string | null {
  const moduleDir = dirname(fileURLToPath(moduleUrl))
  const candidates = [
    process.env.ENV_FILE ? resolve(cwd, process.env.ENV_FILE) : null,
    resolve(cwd, '../.env'),
    resolve(cwd, '.env'),
    resolve(moduleDir, '../../../.env'),
    resolve(moduleDir, '../../.env'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  return [...new Set(candidates)].find(existsSync) ?? null
}

export function loadRootEnvFile(cwd?: string, moduleUrl?: string): void {
  const envPath = resolveRootEnvFile(cwd, moduleUrl)
  if (!envPath) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
