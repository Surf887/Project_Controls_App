import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'node:crypto'
import { computeRouter, projectsRouter } from './routes/projects.js'
import { enterpriseRouter } from './routes/enterprise.js'
import { platformRouter } from './routes/platform.js'
import { authRouter } from './routes/auth.js'
import { attachUser } from './middleware/auth.js'

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

  app.use(helmet())
  app.use(cors(corsOptions()))
  app.use(express.json({ limit: process.env.JSON_LIMIT ?? '10mb' }))

  // Baseline rate limit across the API (auth routes add a stricter limiter).
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_LIMIT_PER_MIN ?? 300),
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true',
    }),
  )

  app.use(attachUser)

  app.get('/api/health', async (_req, res) => {
    const { isUsingPostgres } = await import('./db/database.js')
    res.json({ ok: true, version: '1.0.0', service: 'project-controls-api', postgres: isUsingPostgres() })
  })

  app.use('/api/platform/auth', authRouter)
  app.use('/api/platform', platformRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/projects/:projectId/compute', computeRouter)
  app.use('/api/projects/:projectId', enterpriseRouter)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Don't leak internal error messages to clients in production — log with an
  // id the operator can correlate, return a generic message.
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const errorId = randomUUID()
    console.error(`[error ${errorId}]`, error)
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'Internal server error', errorId })
      return
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error', errorId })
  })

  return app
}
