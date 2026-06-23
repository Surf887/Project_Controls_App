# Remediation Status

Tracks how the findings in `PRODUCTION-READINESS-AUDIT.md` were addressed. Status as of this remediation pass.

## P0 — Critical blockers (all fixed)

| # | Finding | Status | How |
|---|---|---|---|
| C1 | Docker image never compiled the server | ✅ Fixed | Multi-stage `Dockerfile` builds client + server, non-root, healthcheck; API serves client in prod |
| C2 | IDOR — compute/enterprise/platform routes skipped membership | ✅ Fixed | `attachProjectRole` + `requireRole` applied to all `:projectId` routers; `activate` gated |
| C3 | Unauthenticated, unsigned webhook | ✅ Fixed | HMAC-SHA256 signature verification (`webhookAuth.ts`); raw-body capture |
| C4 | Non-atomic concurrency → lost updates | ✅ Fixed | Postgres transactional `FOR UPDATE` + version-conditional UPDATE; JSON atomic temp+fsync+rename |
| C5 | Client role from editable localStorage | ✅ Fixed | `useProjectRole` derives role from the verified session/user |

## P1 — High (fixed)

- ✅ Audit chain now HMAC-keyed (`AUDIT_HMAC_SECRET`) with serialized appends.
- ✅ Fail-fast in production when `DATABASE_URL` is unset; JSON writes are atomic.
- ✅ Zod validation on all mutating routes; `If-Match` validated as a positive integer.
- ✅ Top-level React error boundary; 409 conflicts surfaced (no silent edit loss); token expiry handling.
- ✅ Structured JSON logging + request logging with `x-request-id`; real DB health (`/api/health`, `/live`, `/ready`).
- ✅ Graceful shutdown (drain + pool close + timeout, SIGTERM/SIGINT).
- ✅ Route-level code splitting (main chunk ~600 kB → ~308 kB).
- ✅ Connector OAuth tokens encrypted at rest (AES-256-GCM, `CREDENTIALS_KEY`).
- ✅ CI: added dependency audit + production Docker build jobs; e2e demo-auth fix.
- ✅ Secrets: compose uses env vars; Postgres not host-exposed; `server/data/*` and `.env` gitignored.
- ✅ Path-traversal guard on `projectId`; production admin-password length check.
- ✅ Fixed a fresh-checkout seeding bug (migration pre-created an empty store, blocking seed) that would have hung server tests/CI on a clean clone.

## P2 — Medium/Low (addressed)

- ✅ Persisted client state schema-versioned + `QuotaExceededError` guard.
- ✅ Export/print path HTML-escaped (injection fix).
- ✅ Lower default JSON body limit (1 mb); `.env.example` completed (`AUDIT_HMAC_SECRET`, `CREDENTIALS_KEY`, `WEBHOOK_SECRET`, `JWT_ISSUER`, `DISABLE_RATE_LIMIT`, `SERVE_CLIENT`, `LOG_LEVEL`, `OIDC_CLIENT_SECRET`).
- ✅ Docs added: `DEPLOYMENT.md` (runbook), `SECURITY.md`, `CONTRIBUTING.md`, `scripts/backup.sh` (backup/DR).
- ✅ OIDC verification hardened to an explicit token-exchange endpoint.

## Deferred — recommended follow-ups

These are either operational (not code we can complete here) or larger initiatives:

- **ESLint/Prettier + coverage gates in CI.** Config and a baseline cleanup require adding devDependencies (a lockfile change) and fixing the existing lint backlog — do this as a dedicated pass, then flip the CI jobs to blocking.
- **Metrics, tracing, error tracking** (Prometheus/OpenTelemetry/Sentry). Hooks/log correlation are in place; wiring an APM/error SDK is the next step.
- **Shared-store rate limiting** (e.g. Redis) for multi-replica deployments — current limiter is per-instance.
- **DB normalization / event sourcing.** State is stored as a versioned JSONB blob today; splitting cost sheet/registers into relational tables is a Phase-2/3 effort.
- **Full OIDC Authorization-Code + PKCE** server-side flow (current flow verifies a client-supplied ID token at the exchange endpoint).
- **Expanded test coverage** for the remaining routes/services and UI components; add a coverage tool + threshold.
- **Operational / compliance:** TLS termination + reverse proxy config for your environment, automated backup scheduling, third-party penetration test, SOC 2 control mapping, and (if needed) Kubernetes/horizontal-scale topology. `LICENSE` choice is left to the repository owner.

## Verification

After this pass: client typecheck + 66 unit tests pass; client production build succeeds (code-split); server bundle + typecheck pass; 55 server tests pass; e2e suite passes with demo auth. CI additionally builds the production Docker image and runs a dependency audit.
