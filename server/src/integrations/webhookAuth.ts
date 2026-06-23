import crypto from 'node:crypto'
import type { RequestHandler } from 'express'
import { param } from '../utils/params.js'

/**
 * Resolve the signing secret for a connector. A per-connector secret
 * (WEBHOOK_SECRET_<CONNECTOR>) takes precedence over the shared WEBHOOK_SECRET.
 */
function secretFor(connectorId: string): string | undefined {
  const key = `WEBHOOK_SECRET_${connectorId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
  return process.env[key] ?? process.env.WEBHOOK_SECRET
}

/**
 * Verify an inbound webhook's HMAC-SHA256 signature against the raw request body.
 * The signature is read from the `x-webhook-signature` header (`sha256=<hex>` or
 * bare hex). If no secret is configured the request is rejected in production and
 * allowed in dev/test (so local integration demos still work).
 */
export const requireWebhookSignature: RequestHandler = (req, res, next) => {
  const connectorId = param(req.params.connectorId)
  const secret = secretFor(connectorId)

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      res.status(401).json({ error: 'Webhook signing is not configured for this connector' })
      return
    }
    next()
    return
  }

  const raw = (req as unknown as { rawBody?: Buffer }).rawBody
  const header = req.headers['x-webhook-signature']?.toString() ?? ''
  if (!raw || raw.length === 0 || !header) {
    res.status(401).json({ error: 'Missing webhook signature' })
    return
  }

  const provided = header.startsWith('sha256=') ? header.slice(7) : header
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid webhook signature' })
    return
  }

  next()
}
