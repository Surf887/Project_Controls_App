# Deployment & Operations Runbook

Operational guide for running the Project Controls Intelligence Platform in production.

## Architecture at a glance

A single container image (`Dockerfile`) builds and serves both the React client (static assets) and the Express/TypeScript API. State persists in PostgreSQL (required in production). See `ENTERPRISE-ARCHITECTURE.md` for the layering.

## Prerequisites

- Docker + Docker Compose (or any container runtime / Kubernetes)
- Node **22** in the image (`Dockerfile` `FROM node:22-alpine`); CI uses the same
- A PostgreSQL instance (Compose uses **16-alpine**; bring-your-own 14+ is fine)
- TLS termination in front of the app (reverse proxy / load balancer / ingress)

## Required configuration

Copy `.env.example` to `.env`. The process **refuses to start** in production unless the fail-fast set is valid (`server/src/config/env.ts`, `getJwtSecret()`).

| Variable | Boot-time? | Why |
|---|---|---|
| `NODE_ENV=production` | yes | Enables prod guards (no demo auth, strict CORS, fail-fast). |
| `DATABASE_URL` | **required** | Server exits without it. JSON file store is dev-only. |
| `JWT_SECRET` | **required**, ≥16 chars | Session token HMAC key. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | recommended | First-run bootstrap admin (password ≥12 chars in prod). Ignored if users already exist. |
| `CORS_ORIGIN` | required for browsers | Comma-separated allowlist. Unset in prod **denies** all cross-origin. |
| `WEBHOOK_SECRET` | feature | Required to **accept** inbound webhooks in production. Optional per-connector `WEBHOOK_SECRET_<CONNECTOR>`. |
| `CREDENTIALS_KEY` | feature | AES-256-GCM key for connector tokens. If unset, encryption falls back to `JWT_SECRET`. |
| `AUDIT_HMAC_SECRET` | unused | Listed in `.env.example` for a planned HMAC audit chain. The writer currently SHA-256-hashes JSONL records with no secret. |
| `OIDC_ISSUER` + `OIDC_CLIENT_ID` | feature | Enables `POST /api/platform/auth/oidc`. Setting one without the other fails boot. |
| `DEMO_AUTH` / `DISABLE_RATE_LIMIT` / `USERS_PATH` | must stay off | Any of these in production fails boot. |

Generate strong secrets, e.g. `openssl rand -hex 32`. Store them in your platform's secret manager — never commit `.env`. Compose additionally requires `POSTGRES_PASSWORD` and `JWT_SECRET` (interpolation fails closed if they are empty).

`validateEnv()` does **not** require `CREDENTIALS_KEY`, `WEBHOOK_SECRET`, or `AUDIT_HMAC_SECRET`. Those fail later, at the feature that uses them (or never, for HMAC audit).

## Run with Docker Compose

```bash
cp .env.example .env        # then edit secrets
# Compose requires POSTGRES_PASSWORD, JWT_SECRET (and reads the rest from .env)
docker compose up -d --build
```

- App: `http://localhost:${APP_PORT:-3001}` (put a TLS-terminating proxy in front for real deployments)
- Postgres runs internal-only (not published to the host).
- Compose injects `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER`, `CORS_ORIGIN`, `ENFORCE_PROJECT_MEMBERSHIP`, `ADMIN_EMAIL` / `ADMIN_PASSWORD`, `WEBHOOK_SECRET`, `AUDIT_HMAC_SECRET`. It does **not** inject `CREDENTIALS_KEY` (encryption then falls back to `JWT_SECRET`), `TRUST_PROXY`, `AUDIT_DIR`, or OIDC vars.
- There is **no volume** for `/app/data`. Audit JSONL, baselines, export-job files, and connector creds that write relative to the bundle (`../../data` from `server/dist/index.js` → `/app/data`) are ephemeral. Postgres holds the project blob; filesystem artifacts need a bind mount or they vanish on recreate.

## Database migrations

Two migrators run at boot (`server/src/index.ts`):

1. **JSON** `runMigrations()` — always. Writes `../../data` relative to the compiled module (`/app/data` in the image). It only ensures `projects.json`. The image runs as `USER node` and `/app` is root-owned, so this mkdir can `EACCES` unless you mount a writable volume.
2. **SQL** `runSqlMigrations()` — when `DATABASE_URL` is set. Reads `migrations/*.sql` **next to the compiled module**. Under tsx that is `server/src/db/migrations/` (works). The production image copies only `server/dist` JS — it does **not** `COPY` `server/src/db/migrations/*.sql` into `server/dist/migrations`. Plan to copy those SQL files into the image (or run them out of band) before relying on Compose for a fresh database.

Take a backup before deploying a release that adds migrations. SQL `001_init.sql` is a `SELECT 1` no-op; real schema lives in `002_core_schema.sql` onward. Several tables (`audit_events`, `baseline_snapshots`, `integration_sync_jobs`, `workflow_definitions`) exist in SQL but are unused by the Node stores.

`pg.Pool` is constructed with the connection string only (library defaults: no explicit pool size / SSL).

## Health checks

- `GET /api/health` — `{ ok, version: "1.0.0", service, postgres }`. Probes the DB when Postgres is configured; **503** if the probe fails. There is **no** `ready` field on this payload. The Dockerfile `HEALTHCHECK` still tests `j.ready === false`; that branch never fires, so the check effectively keys off HTTP status (same as Compose).
- `GET /api/health/live` — `{ ok, service }`. Process up. Use for container restart policy.
- `GET /api/health/ready` — `{ ok, postgres }`. Returns **503** `{ ok: false }` when the DB is unreachable. Use for load-balancer/ingress readiness gating.

All three sit **behind the global in-memory rate limiter** (`RATE_LIMIT_PER_MIN`, default 300/min). A noisy replica can 429 its own probes.

## TLS / reverse proxy

Run the app behind a reverse proxy (nginx, Caddy, Traefik, or a cloud LB) that terminates TLS and forwards to port 3001. Recommended proxy settings: HSTS, HTTP→HTTPS redirect, and forwarding `X-Forwarded-*`. Set `CORS_ORIGIN` to your public client origin. `TRUST_PROXY=true` is hop count **1** (not boolean true); a number sets the hop count. Helmet is called with **library defaults** (`app.use(helmet())`) — no custom CSP. Example nginx location:

```nginx
location / {
    proxy_pass http://app:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Backups & disaster recovery

Use `scripts/backup.sh` (pg_dump + audit/baseline archive) on a schedule (cron/systemd timer). Test restores periodically. Retain per your data-retention policy. For the audit log specifically, treat backups as compliance artifacts.

```bash
DATABASE_URL=postgres://... ./scripts/backup.sh /var/backups/project-controls
```

Without an `/app/data` volume, `scripts/backup.sh` cannot see container-local JSONL/baselines after recreate — only Postgres dump contents survive.

## Graceful shutdown & scaling

The server handles `SIGTERM`/`SIGINT`: it stops accepting connections, drains in-flight requests, closes the DB pool, then exits (with a forced-exit timeout). This makes rolling deploys safe.

For horizontal scaling (multiple replicas): move the rate-limit store to a shared backend (e.g. Redis) — the default in-memory limiter is per-instance. Postgres handles shared state; the JSON file store is single-instance only (in-memory cache, no write mutex).

## Observability

A JSON logger exists at `server/src/utils/logger.ts` (`LOG_LEVEL` = `info` / `warn` / `error`) but **call sites still use `console.log` / `console.error`**. Unexpected 500s return `{ error, errorId }` in production (`errorId` is a UUID, not an inbound `x-request-id` header — that header is not set today). Ship stdout/stderr to your log platform. Metrics/tracing/error-tracking (Prometheus/OTel/Sentry) are not wired — see `REMEDIATION-STATUS.md`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Container exits immediately | Missing `DATABASE_URL` or `JWT_SECRET`, or `DEMO_AUTH=true` | Check compose env; secrets must be ≥16 chars; demo auth is illegal in prod. |
| `ADMIN_PASSWORD must be at least 12 characters` | Bootstrap password too short | Set a longer `ADMIN_PASSWORD` (only matters when no users exist yet). |
| Browser CORS errors | `CORS_ORIGIN` unset or wrong | Set it to the public origin(s), comma-separated, including scheme. |
| Login works, project APIs 403 | `ENFORCE_PROJECT_MEMBERSHIP=true` (prod default) and the user has no row in project roles | `POST /api/platform/projects/:id/roles` as admin, or use the bootstrap admin (admins bypass membership). |
| Webhooks 401 | Missing/invalid `x-webhook-signature` | HMAC-SHA256 of the **raw** body with `WEBHOOK_SECRET` (or per-connector override). |
| Healthcheck flapping | Keying off a `ready` field on `/api/health` | That body has `ok`, not `ready`. Prefer `/api/health/ready` for readiness. |
| Rolling deploy drops sessions | JWT is stateless; TTL is `SESSION_TTL_SEC` (default 3600) | Expected. There is no refresh endpoint; users sign in again after expiry. |
| Scheduled export cron ignored | `scheduleCron` is stored only | Runner fires hourly and advances `next_run_at` to the 1st of next month 06:00 **local** (`setHours(6,0,0,0)` then `toISOString()`). The PDF bytes from `generateClosePackPdfAsync` are discarded — only a console log is kept. |
| Fresh Compose DB has no schema | SQL files not in the image | Copy `server/src/db/migrations/*.sql` into `server/dist/migrations` in the Dockerfile, or apply them out of band. |
| Audit / baselines gone after recreate | No `/app/data` volume | Bind-mount `AUDIT_DIR` / data dir, or treat filesystem artifacts as ephemeral. |
| `smoke` green, prod env invalid | Smoke skips guards | `server/src/smoke.ts` does not call `validateEnv()`, `getJwtSecret()`, or `ensureBootstrapAdmin()`. It listens on port `0`. |
| Edits lag, then snap | SPA is not optimistic | Connected `dispatch` waits for POST `/actions` then hydrates. 409 reloads server state and asks the user to re-apply. |

HTTP catalogue: `API.md`. Developer login pitfalls: `CONTRIBUTING.md`.

## Rollback

Redeploy the previous image tag. If a migration was applied, restore the pre-deploy database backup before rolling back code that expects the older schema.
