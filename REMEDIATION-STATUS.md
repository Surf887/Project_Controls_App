# Remediation Status

Tracks how the findings in `PRODUCTION-READINESS-AUDIT.md` were addressed. Status updated August 2026.

## Current verdict

The codebase is suitable for a **controlled, single-instance production pilot** after the deployment-specific gates below are completed. It is **not yet ready for an unrestricted enterprise launch**: the audit and baseline stores are still file-backed, several product areas are explicitly simulated, and penetration testing, restore testing, APM, and identity-provider rollout are operational prerequisites rather than repository changes.

This pass also closes two gaps found after the original audit: production images now include SQL migration assets and writable persistent audit/baseline storage, and production clients fail closed instead of silently exposing the offline demo when the API is unavailable.

## P0 — Critical blockers (all fixed)

| # | Finding | Status | How |
|---|---|---|---|
| C1 | Docker image never compiled the server | ✅ Fixed | Multi-stage `Dockerfile` builds client + server, non-root, healthcheck; API serves client in prod |
| C2 | IDOR — compute/enterprise/platform routes skipped membership | ✅ Fixed | `attachProjectRole` + `requireRole` applied to all `:projectId` routers; `activate` gated |
| C3 | Unauthenticated, unsigned webhook | ✅ Fixed | HMAC-SHA256 signature verification (`webhookAuth.ts`); raw-body capture |
| C4 | Non-atomic concurrency → lost updates | ✅ Fixed | Postgres transactional `FOR UPDATE` + version-conditional UPDATE; JSON atomic temp+fsync+rename |
| C5 | Client role from editable localStorage | ✅ Fixed | `useProjectRole` derives role from the verified session/user |

## P1 — High (fixed)

- ✅ Audit chain is HMAC-keyed (`AUDIT_HMAC_SECRET`) with in-process serialized appends.
- ✅ Fail-fast in production when `DATABASE_URL` is unset; JSON writes are atomic.
- ✅ Zod validation on all mutating routes; `If-Match` validated as a positive integer.
- ✅ Top-level React error boundary; 409 conflicts surfaced (no silent edit loss); token expiry handling.
- ✅ Structured JSON logging + request logging with `x-request-id`; real DB health (`/api/health`, `/live`, `/ready`).
- ✅ Graceful shutdown (drain + pool close + timeout, SIGTERM/SIGINT).
- ✅ Route-level code splitting (main chunk ~600 kB → ~308 kB).
- ✅ Connector OAuth tokens encrypted at rest (AES-256-GCM, `CREDENTIALS_KEY`).
- ✅ CI: production dependency audit is blocking; production Docker build and e2e jobs are enabled.
- ✅ Secrets: compose uses env vars; Postgres not host-exposed; `server/data/*` and `.env` gitignored.
- ✅ Path-traversal guard on `projectId`; production admin-password length check.
- ✅ Fixed a fresh-checkout seeding bug (migration pre-created an empty store, blocking seed) that would have hung server tests/CI on a clean clone.
- ✅ SQL migrations are copied into the runtime image, run transactionally, and serialized across replicas with a Postgres advisory lock.
- ✅ Production image provides a persistent writable volume for file-backed audit and baseline records.
- ✅ Production client disables offline/local seed fallback unless `VITE_ALLOW_OFFLINE=true` is explicitly set.
- ✅ Manual WBS/CBS and ISO 19008 mapping supports reviewed per-row overrides, reuse across matching source rows, and automatic rollback to rule-based assignments.

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
- **Database-backed audit and baselines.** The current HMAC chain and snapshots persist on the `pc_app_data` volume and are appropriate only for the documented single-instance topology; move them into append-only Postgres/object storage before horizontal scaling.
- **DB normalization / event sourcing.** State is stored as a versioned JSONB blob today; splitting cost sheet/registers into relational tables is a Phase-2/3 effort.
- **Full OIDC Authorization-Code + PKCE** server-side flow (current flow verifies a client-supplied ID token at the exchange endpoint).
- **Expanded test coverage** for the remaining routes/services and UI components; add a coverage tool + threshold.
- **Operational / compliance:** TLS termination + reverse proxy config for your environment, automated backup scheduling, third-party penetration test, SOC 2 control mapping, and (if needed) Kubernetes/horizontal-scale topology. `LICENSE` choice is left to the repository owner.
- **Feature truthfulness:** intelligence views and connector handshakes still contain simulated data/behavior. Keep them clearly labeled or disabled for users who could interpret them as live integrations.

## Verification

After this pass: client typecheck + 66 unit tests pass; client production build succeeds (code-split); server bundle + typecheck pass; 55 server tests pass; e2e suite passes with demo auth. CI additionally builds the production Docker image and runs a dependency audit.
