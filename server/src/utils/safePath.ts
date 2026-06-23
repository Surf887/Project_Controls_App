import path from 'node:path'

/** Reject path traversal and unexpected characters in route / file ids. */
export function assertSafeId(id: string, label = 'id'): string {
  const trimmed = id.trim()
  if (!trimmed || trimmed.length > 128) {
    throw new Error(`Invalid ${label}`)
  }
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Invalid ${label}`)
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error(`Invalid ${label}`)
  }
  return trimmed
}

/** Resolve a path and verify it stays under root (blocks traversal). */
export function resolveUnderRoot(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, ...segments)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Path traversal blocked')
  }
  return resolved
}
