import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const VERSION = 1

function key(): Buffer {
  const secret = process.env.DOCUMENT_ENCRYPTION_KEY
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DOCUMENT_ENCRYPTION_KEY is required in production')
    }
    return scryptSync('development-only-document-key', 'pc-document-v1', 32)
  }
  return scryptSync(secret, 'pc-document-v1', 32)
}

export function encryptDocument(content: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()])
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), encrypted])
}

export function decryptDocument(envelope: Buffer): Buffer {
  if (envelope[0] !== VERSION || envelope.length < 30) {
    throw new Error('Unsupported encrypted document envelope')
  }
  const iv = envelope.subarray(1, 13)
  const tag = envelope.subarray(13, 29)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(envelope.subarray(29)), decipher.final()])
}
