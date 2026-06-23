import { describe, expect, it } from 'vitest'
import { assertSafeId, resolveUnderRoot } from './safePath.js'
import path from 'node:path'

describe('assertSafeId', () => {
  it('accepts normal ids', () => {
    expect(assertSafeId('proj-001')).toBe('proj-001')
    expect(assertSafeId('BL-1234567890')).toBe('BL-1234567890')
  })

  it('rejects traversal and separators', () => {
    expect(() => assertSafeId('../etc/passwd')).toThrow(/Invalid/)
    expect(() => assertSafeId('foo/bar')).toThrow(/Invalid/)
    expect(() => assertSafeId('')).toThrow(/Invalid/)
  })
})

describe('resolveUnderRoot', () => {
  it('keeps resolved paths under root', () => {
    const root = path.resolve('/tmp/audit-test-root')
    const resolved = resolveUnderRoot(root, 'project-1.jsonl')
    expect(resolved.startsWith(root)).toBe(true)
  })

  it('blocks escaping via parent segments', () => {
    const root = path.resolve('/tmp/audit-test-root')
    expect(() => resolveUnderRoot(root, '..', 'secret.txt')).toThrow(/Path traversal/)
  })
})
