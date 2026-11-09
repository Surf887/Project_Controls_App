# Deployment & Operations Runbook

Operational guide for running the Project Controls Intelligence Platform in production.

## Architecture at a glance

A single container image (`Dockerfile`) builds and serves both the React client (static assets) and the Express/TypeScript API. State persists in PostgreSQL (required in production). See `ENTERPRISE-ARCHITECTURE.md` for the layering.

## Prerequisites

- Docker + Docker Compose (or any container runtime / Kubernetes)
- A PostgreSQL 14+ instance (managed service recommended)
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

## Run with Docker Compose

```bash
cp .env.example .env        # then edit secrets
# Compose requires POSTGRES_PASSWORD, JWT_SECRET (and reads the rest from .env)
docker compose up -d --build
```

- App: `http://localhost:3001` (put a TLS-terminating proxy in front for real deployments)
- Postgres runs internal-only (not published to the host).

## Database migrations

SQL migrations in `server/src/db/migrations/*.sql` run automatically at startup when `DATABASE_URL` is set. Review them before first deploy. Take a backup before deploying a release that adds migrations.

## Health checks

- `GET /api/health` — `{ ok, version, service, postgres }`. Probes the DB when Postgres is configured; **503** if the probe fails. There is **no** `ready` field on this payload (the image healthcheck should key off HTTP status / `ok`).
- `GET /api/health/live` — `{ ok, service }`. Process up. Use for container restart policy.
- `GET /api/health/ready` — `{ ok, postgres }`. Returns **503** `{ ok: false }` when the DB is unreachable. Use for load-balancer/ingress readiness gating.

## TLS / reverse proxy

Run the app behind a reverse proxy (nginx, Caddy, Traefik, or a cloud LB) that terminates TLS and forwards to port 3001. Recommended proxy settings: HSTS, HTTP→HTTPS redirect, and forwarding `X-Forwarded-*`. Set `CORS_ORIGIN` to your public client origin. Example nginx location:

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

## Graceful shutdown & scaling

The server handles `SIGTERM`/`SIGINT`: it stops accepting connections, drains in-flight requests, closes the DB pool, then exits (with a forced-exit timeout). This makes rolling deploys safe.

For horizontal scaling (multiple replicas): move the rate-limit store to a shared backend (e.g. Redis) — the default in-memory limiter is per-instance. Postgres handles shared state; the JSON file store is single-instance only.

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
| Scheduled export cron ignored | `scheduleCron` is stored only | Runner fires hourly and advances `next_run_at` to the 1st of next month 06:00 UTC. |

HTTP catalogue: `API.md`. Developer login pitfalls: `CONTRIBUTING.md`.

## Rollback

Redeploy the previous image tag. If a migration was applied, restore the pre-deploy database backup before rolling back code that expects the older schema.
