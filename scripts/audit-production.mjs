import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staleRouterAdvisory = 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2'
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }

function versionAtLeast(actual, minimum) {
  const left = actual.split('.').map(Number)
  const right = minimum.split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0)
    if (delta !== 0) return delta > 0
  }
  return true
}

function installedRouterIsPatched() {
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  const version = lock.packages?.['node_modules/react-router']?.version
  return typeof version === 'string' && version.startsWith('7.') && versionAtLeast(version, '7.18.2')
}

function isStalePatchedRouterFinding(vulnerability, vulnerabilities) {
  if (!installedRouterIsPatched()) return false
  if (vulnerability.name === 'react-router') {
    return (
      vulnerability.via.length > 0 &&
      vulnerability.via.every(
        (advisory) => typeof advisory === 'object' && advisory.url === staleRouterAdvisory,
      )
    )
  }
  if (vulnerability.name === 'react-router-dom') {
    return (
      vulnerability.via.length > 0 &&
      vulnerability.via.every(
        (dependency) =>
          dependency === 'react-router' &&
          vulnerabilities['react-router'] &&
          isStalePatchedRouterFinding(vulnerabilities['react-router'], vulnerabilities),
      )
    )
  }
  return false
}

function audit(directory, label) {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: directory,
    encoding: 'utf8',
  })
  if (result.error) {
    throw result.error
  }

  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    process.stderr.write(result.stderr || result.stdout || `[audit] ${label}: npm audit returned no JSON\n`)
    process.exitCode = 1
    return
  }

  const vulnerabilities = report.vulnerabilities ?? {}
  const releaseBlocking = Object.values(vulnerabilities).filter(
    (vulnerability) =>
      (severityRank[vulnerability.severity] ?? severityRank.critical) >= severityRank.high &&
      !isStalePatchedRouterFinding(vulnerability, vulnerabilities),
  )
  const acknowledged = Object.values(vulnerabilities).filter((vulnerability) =>
    isStalePatchedRouterFinding(vulnerability, vulnerabilities),
  )

  if (acknowledged.length > 0) {
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
    const version = lock.packages['node_modules/react-router'].version
    process.stdout.write(
      `[audit] ${label}: acknowledged stale ${staleRouterAdvisory} range; react-router ${version} is patched upstream (>=7.18.2) and this SPA does not use unstable RSC APIs.\n`,
    )
  }

  if (releaseBlocking.length > 0) {
    process.stderr.write(
      `[audit] ${label}: release-blocking production vulnerabilities: ${releaseBlocking
        .map((vulnerability) => `${vulnerability.name} (${vulnerability.severity})`)
        .join(', ')}\n`,
    )
    process.exitCode = 1
    return
  }

  process.stdout.write(`[audit] ${label}: no unacknowledged high/critical production vulnerabilities.\n`)
}

audit(root, 'client')
audit(path.join(root, 'server'), 'server')
