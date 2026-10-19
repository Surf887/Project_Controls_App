# Deployment & Operations Runbook

Operational guide for running the Project Controls Intelligence Platform in production.

## Architecture at a glance

A single container image (`Dockerfile`) builds and serves both the React client (static assets) and the Express/TypeScript API. State persists in PostgreSQL (required in production). See `ENTERPRISE-ARCHITECTURE.md` for the layering.

## Prerequisites

- Docker + Docker Compose (or any container runtime / Kubernetes)
- A PostgreSQL 14+ instance (managed service recommended)
- TLS termination in front of the app (reverse proxy / load balancer / ingress)

## Required configuration

Copy `.env.example` to `.env` and set, at minimum, for production:

| Variable | Why |
|---|---|
| `NODE_ENV=production` | Enables prod guards (no demo auth, strict CORS, fail-fast). |
| `DATABASE_URL` | **Required** — `validateEnv()` refuses to start without it (the JSON file store is not durable enough for production). |
| `JWT_SECRET` | **Required**, ≥16 chars. Session token signing key (`getJwtSecret()`). |
| `AUDIT_HMAC_SECRET` | Passed through Compose today; **not read** by `auditService.ts` (the live chain is unkeyed SHA-256). Reserve a distinct key if you later HMAC the chain — do not reuse `JWT_SECRET` in that design. |
| `CREDENTIALS_KEY` | AES-256-GCM key for connector OAuth tokens at rest. If unset, `connectorCrypto.ts` falls back to `JWT_SECRET`. Compose does **not** currently pass `CREDENTIALS_KEY` into the app container — add it to `docker-compose.yml` if you need a key separate from `JWT_SECRET`. |
| `CORS_ORIGIN` | Allowlist of client origins; cross-origin is denied if unset in prod. |
| `WEBHOOK_SECRET` | Required to accept inbound webhooks (HMAC verification). Unsigned webhooks are rejected in production when no secret is set. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run bootstrap admin (password ≥12 chars in prod). Created only when the user store is empty. `ADMIN_NAME` is optional (default `Administrator`). |
| `TRUST_PROXY` | Set `true` or a hop count when TLS terminates at a reverse proxy so rate-limit and `X-Forwarded-*` see the client correctly. Compose does not pass this unless you add it. |
| `JWT_ISSUER` | Session `iss` claim. Captured at **module import** in `jwt.ts`, so it must be in the process environment (Compose injects it). A `.env`-only value is ignored. |
| `SESSION_TTL_SEC` | Session lifetime (default 3600). Captured at **module import** in `auth.ts` — same import-order rule as `JWT_ISSUER`. Compose does not inject it. |

Production **fail-fast** (`server/src/config/env.ts` + `jwt.ts`):

- Missing `DATABASE_URL`
- Missing or `<16`-char `JWT_SECRET`
- `DEMO_AUTH=true`
- `DISABLE_RATE_LIMIT=true`
- `USERS_PATH` set (must use the Postgres users table)
- `ADMIN_PASSWORD` shorter than 12 characters (when set)
- `OIDC_ISSUER` / `OIDC_CLIENT_ID` set without its pair

Generate strong secrets, e.g. `openssl rand -hex 32`. Store them in your platform's secret manager — never commit `.env`. Compose injects selected variables into the container; the in-process file loader is a fallback (bundled `server/dist/index.js` looks for repo-root `.env`).

## Run with Docker Compose

```bash
cp .env.example .env        # then edit secrets
# Compose requires POSTGRES_PASSWORD, JWT_SECRET (and reads the rest from .env)
docker compose up -d --build
```

- App: `http://localhost:3001` (put a TLS-terminating proxy in front for real deployments)
- Postgres runs internal-only (not published to the host).

### What Compose injects vs what it does not

Passed into the `app` service today (`docker-compose.yml`): `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER`, `CORS_ORIGIN`, `ENFORCE_PROJECT_MEMBERSHIP`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WEBHOOK_SECRET`, `AUDIT_HMAC_SECRET`.

**Not** passed unless you add them: `CREDENTIALS_KEY`, `TRUST_PROXY`, `LOG_LEVEL`, `SESSION_TTL_SEC`, `OIDC_*`, `SERVE_CLIENT`, `JSON_LIMIT`, `RATE_LIMIT_PER_MIN`, `AUDIT_DIR`.

`AUDIT_HMAC_SECRET`, `CREDENTIALS_KEY`, and `WEBHOOK_SECRET` are **not** in `validateEnv()` fail-fast. Missing webhook secret is a **401 on inbound webhooks** in production, not a boot failure. Missing `CREDENTIALS_KEY` falls back to `JWT_SECRET` for connector encryption.

`OIDC_CLIENT_SECRET` is documented in `.env.example` for a future Authorization-Code flow. The live exchange (`server/src/auth/oidc.ts`) verifies an ID token against JWKS and never reads it.

## Filesystem layout (tsx vs bundle)

Every `fileURLToPath(import.meta.url)` path is relative to **the running module**. `tsx` keeps per-file URLs under `server/src/…`. The esbuild bundle is a single `server/dist/index.js`, so `../../data` is the **repo root** `data/` directory, not `server/data`.

| Artifact | `tsx` (`npm run dev:server`) | Bundled / Docker (`node server/dist/index.js`) |
|---|---|---|
| JSON project store, users, roles, filters, delegations, export jobs | `server/data/…` | `<repo>/data/…` (`/app/data` in the image) |
| Audit JSONL | `server/data/audit` (or `AUDIT_DIR`) | `<repo>/data/audit` |
| Baseline snapshots | `server/data/baselines` | `<repo>/data/baselines` |
| SQL migrations (`runSqlMigrations`) | `server/src/db/migrations` | `server/dist/migrations` |
| Client SPA assets | n/a (Vite dev server) | `<repo>/dist` (copied by the Dockerfile) |

The current `Dockerfile` copies `server/dist` JS and the client `dist/`. It does **not** COPY `server/src/db/migrations/*.sql` into `server/dist/migrations`. `initDatabase()` calls `runSqlMigrations()` whenever `DATABASE_URL` is set; `readdirSync` of a missing directory throws. Local `tsx` is unaffected. Until the image includes those `.sql` files (or the SQL is embedded), treat a fresh Compose Postgres volume as needing a documented workaround — do not assume boot applied `001_init.sql` … `004_users.sql`.

`index.ts` also runs JSON-store `runMigrations()` **unconditionally** (before `initDatabase()`), even in Postgres production. That path mkdir/writes the bundled `data/` directory (`/app/data` in the image) as `USER node`. Compose defines **no volume** (and no `chown`) for `/app/data`, so:

- a fresh container can throw `EACCES` on mkdir, or
- audit JSONL + baselines written there vanish when the container is recreated.

Mount a writable volume at `/app/data` (or set `AUDIT_DIR` to a writable mount) even when project state lives in Postgres. Set `DATA_DIR` for `scripts/backup.sh` to that same path, not `./server/data`.

CI’s `docker` job only **builds** the image; it does not start the container or apply migrations.

## Database migrations

SQL files live in `server/src/db/migrations/*.sql`. `runSqlMigrations()` runs at startup when `DATABASE_URL` is set, reading from `dirname(import.meta.url)/migrations`:

- `tsx` → `server/src/db/migrations` (local dev works)
- bundled `server/dist/index.js` → `server/dist/migrations` (not populated by the current Dockerfile)

Each `.sql` file is applied then recorded in `schema_migrations` as two separate statements (`postgres.ts`). There is **no wrapping transaction**: a failure mid-file can leave the schema half-applied with no row in `schema_migrations`. Review the SQL before first deploy. Take a backup before deploying a release that adds migrations. See [Filesystem layout](#filesystem-layout-tsx-vs-bundle).

| File | What it does |
|---|---|
| `001_init.sql` | **No-op** (`SELECT 1;`) — leftover placeholder. |
| `002_core_schema.sql` | `portfolios` (seeded `'default'` only), `projects`, `project_state` (JSONB blob). **Unused** (created, never written): `baseline_snapshots`, `audit_events`, `integration_sync_jobs`, `workflow_definitions`. Live baseline/audit writers are still filesystem (`baselineService.ts` / `auditService.ts`). |
| `003_platform.sql` | `user_project_roles`, `saved_filters`, `workflow_delegations`, `export_jobs`, `connector_credentials`, `webhook_deliveries`, `app_settings` (`active_project_id` **is** written). |
| `004_users.sql` | `users` (password + OIDC). Production identity lives here when `DATABASE_URL` is set. |

## Health checks

- `GET /api/health` — process up; pings Postgres when configured. Body is `{ ok, version, service, postgres }` (no `ready` field). 503 if the ping fails. The image `HEALTHCHECK` fails on a non-OK HTTP status; the extra `j.ready === false` comparison is a no-op because `ready` is not emitted. Compose uses HTTP status only. The global rate limiter (`RATE_LIMIT_PER_MIN`, default 300) **includes** `/api/health*` — aggressive probes from one NAT IP can 429 liveness. Login/OIDC have an extra 10 / 15 min limiter.
- `GET /api/health/live` — liveness (process up). Use for container restart policy.
- `GET /api/health/ready` — readiness (DB reachable); returns 503 when not. Prefer this for load-balancer/ingress readiness gating.

## TLS / reverse proxy

Run the app behind a reverse proxy (nginx, Caddy, Traefik, or a cloud LB) that terminates TLS and forwards to port 3001. Recommended proxy settings: HSTS, HTTP→HTTPS redirect, and forwarding `X-Forwarded-*`. Set `CORS_ORIGIN` to your public client origin and `TRUST_PROXY=true` (or a hop count). Example nginx location:

```nginx
location / {
    proxy_pass http://app:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Backups & disaster recovery

Use `scripts/backup.sh` (pg_dump custom format + audit/baseline archive) on a schedule (cron/systemd timer). Test restores periodically. Retain per your data-retention policy (`RETENTION_DAYS`, default 30). For the audit log specifically, treat backups as compliance artifacts.

```bash
DATABASE_URL=postgres://... ./scripts/backup.sh /var/backups/project-controls
```

Optional env: `DATA_DIR` (default `./server/data`), `RETENTION_DAYS`.

### Restore (manual)

Stop writers, then:

```bash
# 1) Database (custom-format dump from backup.sh)
pg_restore --clean --no-owner --dbname="$DATABASE_URL" /var/backups/project-controls/db-<timestamp>.dump

# 2) Filesystem audit / baselines / JSON store
tar -xzf /var/backups/project-controls/data-<timestamp>.tar.gz -C /path/to/parent-of-data
```

The tarball contains the `data` directory basename. After restore, confirm `GET /api/health/ready` and `GET /api/projects/:id/audit` (`integrity.ok`). That JSONL trail is **not** what the SPA `/audit` page shows — the UI reads in-state `state.auditLog` inside the project JSONB blob (`pg_restore` covers that; the tarball covers JSONL + baselines).

For a bundled/Docker process, archive the repo-root `data/` directory (or `AUDIT_DIR`), not `server/data`, or the restore will miss the live audit chain and baselines.

## Graceful shutdown & scaling

The server handles `SIGTERM`/`SIGINT`: it stops accepting connections, drains in-flight requests, closes the DB pool, then exits (10s forced-exit timeout). This makes rolling deploys safe.

For horizontal scaling (multiple replicas): move the rate-limit store to a shared backend (e.g. Redis) — the default in-memory limiter is per-instance. Postgres handles shared project state; audit JSONL, baselines, and the JSON file store are **not** multi-instance safe. Audit appends are also **not file-locked** on a single instance (`appendFileSync` in `auditService.ts`); concurrent actions on one project can interleave JSONL lines and fail `integrity.ok`.

Scheduled close-pack jobs (`POST /api/platform/projects/:id/export-jobs`) are polled **hourly**. `scheduleCron` and `packType` are persisted but **not honoured**: `nextMonthlyRun()` uses 06:00 **process-local** time on the 1st of next month (then `toISOString()`). The runner always calls `generateClosePackPdfAsync` and **discards the PDF Buffer** (`console.log` only — no file, mailbox, or object store). Interactive download remains `GET .../exports/close-pack.pdf`.

JSON-store `applyAction` is **not** mutexed, and `JsonProjectStore` caches `projects.json` in memory — disk edits while the process is up are ignored until restart. Postgres `applyActionAsync` takes `FOR UPDATE` inside a transaction, so omitted `If-Match` still serializes writers on Postgres. Do not run more than one JSON-store replica.

Persisted session identity is the **users** table/file, not the JWT `role` claim. Disabling a user takes effect on the next request without waiting for `SESSION_TTL_SEC`. There is no HTTP disable-user route.

## Observability

Unhandled errors and some route failures include a generated `errorId` in the JSON body and a matching `console.error` line. A structured `logger` helper exists (`server/src/utils/logger.ts`, honors `LOG_LEVEL`) but is **not** wired into request middleware — there is no per-request `x-request-id` today. Ship stdout/stderr to your log platform. Metrics/tracing/error-tracking (Prometheus/OTel/Sentry) are still recommended — see `REMEDIATION-STATUS.md`.

## Rollback

Redeploy the previous image tag. If a migration was applied, restore the pre-deploy database backup before rolling back code that expects the older schema.
