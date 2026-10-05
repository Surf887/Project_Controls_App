# Remediation Status

Tracks how the findings in `PRODUCTION-READINESS-AUDIT.md` were addressed. Status as of this remediation pass.

### Code vs this document (verify before treating a ✅ as current)

Two items below drifted from the live tree and should not be taken at face value:

- **Audit HMAC / serialized appends.** `server/src/services/auditService.ts` still hashes with unkeyed SHA-256 and appends with `appendFileSync` (no mutex). Corrupt trailing lines are tolerated so a failed audit write cannot 500 an already-committed action. Postgres `audit_events` is still not the live writer.
- **Structured request logging / `x-request-id`.** `server/src/utils/logger.ts` exists but is unused. 500s and some route errors return `errorId` only; there is no request-id middleware.

Health probes (`/api/health`, `/live`, `/ready`), graceful shutdown, Zod on mutating routes, membership on `:projectId` routers, webhook HMAC, and encrypted connector tokens **do** match the current code.

Additional live-tree notes (not original audit findings):

- **`.env` path split.** `loadRootEnvFile()` walks `../..` from `import.meta.url`. Under `tsx` that is `server/.env`; the esbuild bundle (`server/dist/index.js`) resolves to the repo-root `.env`.
- **Compose env surface.** `CREDENTIALS_KEY` and `TRUST_PROXY` are not injected by `docker-compose.yml` today. Connector crypto falls back to `JWT_SECRET` when `CREDENTIALS_KEY` is unset.
- **C4 JSON store.** Postgres `FOR UPDATE` + version-conditional UPDATE **does** serialize writers. JSON `writeDb` is atomic rename only — **no mutex**. Concurrent omitted-`If-Match` JSON writes can still last-wins.
- **Export `scheduleCron`.** Stored, not executed. Hourly poll. `nextMonthlyRun()` is 1st-of-month **06:00 local** (not a UTC clock), then `toISOString()`. `packType` is ignored; the runner always generates a close-pack PDF.
- **JSON bootstrap migrations.** `runMigrations()` in `migrate.ts` **always** runs, including when `DATABASE_URL` is set. Compose has **no volume** for `/app/data`.
- **Forecast compute `rows` / EVM `accounts`.** `GET .../compute/forecast` `rows` and `GET .../compute/evm` `accounts` are **counts**, not payloads.
- **`If-Match`.** Parsed with `Number(...)` (no Zod positive-integer check). Omit the header → no conflict check. Non-numeric → `NaN` → 409.
- **Monthly close workflow id.** Published on `/workflows` but UI gates are sequential and data-derived (`monthlyCloseProgress.ts`), not `workflowEngine` assertions.
- **Import-time env.** `JWT_ISSUER` (`jwt.ts`), `SESSION_TTL_SEC` (`routes/auth.ts`), `DATABASE_PATH` (`jsonProjectStore.ts`), `USERS_PATH` and `BCRYPT_ROUNDS` (`userStore.ts`) are captured when the ESM graph loads, before `loadRootEnvFile()`. Compose/Docker inject `JWT_ISSUER` into the process, so that path is fine; a `.env`-only value is not.
- **Delegations.** `POST /api/platform/workflows/delegations` persists a row. `workflowEngine.ts` never reads it. `GET` returns all rows (Postgres `LIMIT 50`) to any viewer.
- **Project role replacement.** `effectiveRole` returns the project assignment when present, not `max(global, project)`.
- **SQL migrations.** `runSqlMigrations()` applies each file then inserts `schema_migrations` without a wrapping transaction.
- **Bundled filesystem.** `fileURLToPath(import.meta.url)` in the esbuild bundle is `server/dist/index.js`. JSON/audit/baseline writers therefore use repo-root `data/`. `runSqlMigrations()` reads `server/dist/migrations`; the Dockerfile does not COPY `server/src/db/migrations/*.sql` there.
- **`OIDC_CLIENT_SECRET`.** Present in `.env.example` / older docs; `oidc.ts` never reads it (JWKS ID-token verify only).
- **Demo identity default.** With demo auth on, a missing `x-pc-role` is **cost_controller**. The SPA auto-mints `/auth/token` when `demoAuthEnabled` is true. Vite `import.meta.env.DEV` shows demo chrome even if `VITE_DEMO_AUTH` is false.
- **Integrations.** `GET .../adapters` always `configured: false`. `sap-s4` sync uses hard-coded sample rows without requiring OAuth.
- **Action Zod.** Envelope + role; most register payloads `.passthrough()`.
- **CI docker job.** Builds the image only — does not start it or run SQL migrations.

## P0 — Critical blockers

| # | Finding | Status | How |
|---|---|---|---|
| C1 | Docker image never compiled the server | ✅ Fixed | Multi-stage `Dockerfile` builds client + server, non-root, healthcheck; API serves client in prod |
| C2 | IDOR — compute/enterprise/platform routes skipped membership | ✅ Fixed | `attachProjectRole` + `requireRole` applied to all `:projectId` routers; `activate` gated |
| C3 | Unauthenticated, unsigned webhook | ✅ Fixed | HMAC-SHA256 signature verification (`webhookAuth.ts`); raw-body capture |
| C4 | Non-atomic concurrency → lost updates | ⚠️ Postgres fixed; JSON residual | Postgres transactional `FOR UPDATE` + version-conditional UPDATE. JSON atomic temp+fsync+rename **without a writer mutex** — concurrent omitted-`If-Match` writes can still last-wins. |
| C5 | Client role from editable localStorage | ✅ Fixed | `useProjectRole` derives role from the verified session/user |

## P1 — High (fixed)

- ✅ Audit chain now HMAC-keyed (`AUDIT_HMAC_SECRET`) with serialized appends.
- ✅ Fail-fast in production when `DATABASE_URL` is unset; JSON writes are atomic.
- ✅ Zod validation on mutating platform/enterprise routes; `/actions` envelope + role. `If-Match` is still `Number(...)` (omit skips the check; non-numeric → 409) — not a Zod positive-integer.
- ✅ Top-level React error boundary; 409 conflicts surfaced (no silent edit loss); token expiry handling.
- ✅ Structured JSON logging + request logging with `x-request-id`; real DB health (`/api/health`, `/live`, `/ready`).
- ✅ Graceful shutdown (drain + pool close + timeout, SIGTERM/SIGINT).
- ✅ Route-level code splitting (main chunk ~600 kB → ~308 kB).
- ✅ Connector OAuth tokens encrypted at rest (AES-256-GCM, `CREDENTIALS_KEY` with `JWT_SECRET` fallback). Legacy plaintext decrypt still accepted.
- ✅ CI: added dependency audit + production Docker build jobs; e2e demo-auth fix.
- ✅ Secrets: compose uses env vars; Postgres not host-exposed; `server/data/*` and `.env` are gitignored.
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
