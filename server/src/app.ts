import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rateLimitDisabled, trustProxySetting } from './config/env.js'
import { computeRouter, projectsRouter } from './routes/projects.js'
import { enterpriseRouter } from './routes/enterprise.js'
import { platformRouter } from './routes/platform.js'
import { authRouter } from './routes/auth.js'
import { attachUser } from './middleware/auth.js'
import { logger } from './utils/logger.js'

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string
  }
}

/**
 * Assign a request id (honouring a well-formed inbound `x-request-id` so ids
 * correlate across proxies), echo it on the response, and emit one structured
 * log line per completed request.
 */
const requestLogging: express.RequestHandler = (req, res, next) => {
  const inbound = req.headers['x-request-id']?.toString() ?? ''
  const requestId = /^[A-Za-z0-9_-]{8,64}$/.test(inbound) ? inbound : randomUUID()
  req.requestId = requestId
  res.setHeader('x-request-id', requestId)

  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    logger.info('request', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      userId: req.user?.id,
    })
  })
  next()
}

/**
 * CORS origins come from CORS_ORIGIN (comma-separated allowlist). In production
 * an explicit allowlist is required; without it we deny cross-origin requests
 * rather than reflecting any origin. In dev we reflect the request origin.
 */
function corsOptions(): cors.CorsOptions {
  const configured = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean)
  if (configured && configured.length > 0) {
    return { origin: configured, credentials: true }
  }
  if (process.env.NODE_ENV === 'production') {
    return { origin: false }
  }
  return { origin: true }
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  const trustProxy = trustProxySetting()
  if (trustProxy != null) {
    app.set('trust proxy', trustProxy)
  }

  app.use(requestLogging)
  app.use(helmet())
  app.use(cors(corsOptions()))
  app.use(
    express.json({
      limit: process.env.JSON_LIMIT ?? '1mb',
      verify: (req, _res, buf) => {
        ;(req as unknown as { rawBody?: Buffer }).rawBody = buf
      },
    }),
  )

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_LIMIT_PER_MIN ?? 300),
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => rateLimitDisabled(),
    }),
  )

  app.use(attachUser)

  app.get('/api/health/live', (_req, res) => {
    res.json({ ok: true, service: 'project-controls-api' })
  })

  app.get('/api/health/ready', async (_req, res) => {
    try {
      const { isUsingPostgres, pingDatabase } = await import('./db/database.js')
      if (isUsingPostgres()) {
        await pingDatabase()
      }
      res.json({ ok: true, postgres: isUsingPostgres() })
    } catch (error) {
      logger.error('health/ready check failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      res.status(503).json({ ok: false, error: 'Not ready' })
    }
  })

  app.get('/api/health', async (_req, res) => {
    const { isUsingPostgres, pingDatabase } = await import('./db/database.js')
    try {
      if (isUsingPostgres()) {
        await pingDatabase()
      }
      res.json({ ok: true, version: '1.0.0', service: 'project-controls-api', postgres: isUsingPostgres() })
    } catch {
      res.status(503).json({ ok: false, version: '1.0.0', service: 'project-controls-api', postgres: isUsingPostgres() })
    }
  })

  app.use('/api/platform/auth', authRouter)
  app.use('/api/platform', platformRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/projects/:projectId/compute', computeRouter)
  app.use('/api/projects/:projectId', enterpriseRouter)

  if (process.env.NODE_ENV === 'production' && process.env.SERVE_CLIENT !== 'false') {
    const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
    if (fs.existsSync(clientDir)) {
      app.use(express.static(clientDir))
      app.get(/^(?!\/api\/).*/, (_req, res) => {
        res.sendFile(path.join(clientDir, 'index.html'))
      })
    }
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const errorId = randomUUID()
    logger.error('unhandled route error', {
      errorId,
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'Internal server error', errorId })
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error', errorId })
  })

  return app
}
