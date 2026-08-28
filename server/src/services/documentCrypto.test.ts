import { afterEach, describe, expect, it } from 'vitest'
import { decryptDocument, encryptDocument } from './documentCrypto.js'

const originalKey = process.env.DOCUMENT_ENCRYPTION_KEY

afterEach(() => {
  if (originalKey == null) delete process.env.DOCUMENT_ENCRYPTION_KEY
  else process.env.DOCUMENT_ENCRYPTION_KEY = originalKey
})

describe('document encryption', () => {
  it('round-trips document bytes without persisting plaintext', () => {
    process.env.DOCUMENT_ENCRYPTION_KEY = 'document-test-key-long-enough'
    const plaintext = Buffer.from('contractor confidential forecast')
    const encrypted = encryptDocument(plaintext)
    expect(encrypted.includes(plaintext)).toBe(false)
    expect(decryptDocument(encrypted).equals(plaintext)).toBe(true)
  })
})
