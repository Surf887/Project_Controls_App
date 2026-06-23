import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

function deriveKey(): Buffer {
  const secret = process.env.CREDENTIALS_KEY ?? process.env.JWT_SECRET
  if (!secret) {
    throw new Error('CREDENTIALS_KEY or JWT_SECRET is required to encrypt connector credentials')
  }
  return scryptSync(secret, 'pc-connector-v1', 32)
}

/** AES-256-GCM envelope for connector OAuth tokens at rest (JSON file store). */
export function encryptConnectorTokens(tokens: Record<string, string>): string {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = JSON.stringify(tokens)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptConnectorTokens(payload: string): Record<string, string> {
  if (!payload.startsWith('enc:v1:')) {
    return JSON.parse(payload) as Record<string, string>
  }
  const key = deriveKey()
  const parts = payload.split(':')
  const iv = Buffer.from(parts[2]!, 'base64url')
  const tag = Buffer.from(parts[3]!, 'base64url')
  const data = Buffer.from(parts[4]!, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString('utf8')) as Record<string, string>
}
