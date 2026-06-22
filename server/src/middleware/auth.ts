import { verifySessionToken } from '../auth/jwt.js'
import { effectiveRole, getProjectRole } from '../auth/projectRoles.js'
import { canPerformAction, demoUserFromRole, hasRole, type AuthUser, type Role } from '../auth/rbac.js'
import { isBlockedClientAction, minimumRoleForAction } from '../auth/actionPolicy.js'
import { isOidcEnabled, verifyOidcIdToken, findOrProvisionOidcUser } from '../auth/oidc.js'
import { param } from '../utils/params.js'
import type { RequestHandler } from 'express'

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser | null
    globalRole?: Role
  }
}

/**
 * Whether per-project membership is enforced. Defaults ON in production so a
 * user can only reach projects they belong to (prevents the IDOR where any
 * viewer could read any project by id). Off by default in dev/demo.
 */
export function enforceProjectMembership(): boolean {
  const explicit = process.env.ENFORCE_PROJECT_MEMBERSHIP
  if (explicit != null) return explicit === 'true'
  return process.env.NODE_ENV === 'production'
}

/**
 * Establish req.user from, in order:
 *   1. A Bearer session token we signed (verified HMAC, not just decoded).
 *   2. If OIDC is configured, a Bearer ID token verified against the provider.
 *   3. The demo `x-pc-role` header — ONLY when DEMO_AUTH is on (never in prod).
 * Anything else leaves the request unauthenticated.
 */
export const attachUser: RequestHandler = async (req, _res, next) => {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim()

    const claims = await verifySessionToken(token)
    if (claims) {
      req.user = { id: claims.sub, name: claims.name, role: claims.role, email: claims.email }
      req.globalRole = claims.role
      return next()
    }

    if (isOidcEnabled()) {
      const profile = await verifyOidcIdToken(token)
      if (profile) {
        const user = await findOrProvisionOidcUser(profile)
        req.user = user.disabled ? null : { id: user.id, name: user.name, role: user.role, email: user.email }
        req.globalRole = req.user?.role
        return next()
      }
    }

    // Token present but invalid — do NOT fall back to any privileged identity.
    req.user = null
    req.globalRole = undefined
    return next()
  }

  const demo = demoUserFromRole(req.headers['x-pc-role']?.toString())
  req.user = demo
  req.globalRole = demo?.role
  next()
}

/**
 * Resolve the caller's effective role for the project in the route, and enforce
 * membership. Global admins bypass membership checks.
 */
export const attachProjectRole: RequestHandler = async (req, res, next) => {
  const projectId = param(req.params.projectId)
  if (!req.user || !projectId) {
    next()
    return
  }

  const globalRole = req.globalRole ?? req.user.role
  if (globalRole === 'admin') {
    req.user = { ...req.user, role: 'admin' }
    next()
    return
  }

  const projectRole = await getProjectRole(req.user.id, projectId)

  if (!projectRole && enforceProjectMembership()) {
    res.status(403).json({ error: 'You do not have access to this project' })
    return
  }

  req.user = { ...req.user, role: effectiveRole(globalRole, projectRole) }
  next()
}

export function requireRole(minimum: Role): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    if (!hasRole(req.user, minimum)) {
      res.status(403).json({ error: `Requires ${minimum} role` })
      return
    }
    next()
  }
}

export const guardProjectAction: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  const action = req.body as { type?: string }
  if (!action?.type) {
    res.status(400).json({ error: 'Action type is required' })
    return
  }
  if (isBlockedClientAction(action.type)) {
    res.status(403).json({ error: `Action ${action.type} is server-controlled` })
    return
  }
  const minimum = minimumRoleForAction(action.type)
  if (minimum === null) {
    res.status(400).json({ error: `Unknown action type: ${action.type}` })
    return
  }
  if (!canPerformAction(req.user, action.type)) {
    res.status(403).json({
      error: `Action ${action.type} requires ${minimum} (current: ${req.user?.role ?? 'anonymous'})`,
    })
    return
  }
  next()
}

export const requireAdmin: RequestHandler = requireRole('admin')
