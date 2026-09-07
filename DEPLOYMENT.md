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
| `DATABASE_URL` | **Required** — the server refuses to start without it (the JSON file store is not durable enough for production). |
| `JWT_SECRET` | **Required**, ≥16 chars. Session token signing key. |
| `AUDIT_HMAC_SECRET` | Passed through Compose today; **not read** by `auditService.ts` (the live chain is unkeyed SHA-256). Reserve a distinct key if you later HMAC the chain — do not reuse `JWT_SECRET` in that design. |
| `CREDENTIALS_KEY` | AES-256-GCM key for connector OAuth tokens at rest. If unset, `connectorCrypto.ts` falls back to `JWT_SECRET`. Compose does **not** currently pass `CREDENTIALS_KEY` into the app container — set it in `docker-compose.yml` if you need a key separate from `JWT_SECRET`. |
| `CORS_ORIGIN` | Allowlist of client origins; cross-origin is denied if unset in prod. |
| `WEBHOOK_SECRET` | Required to accept inbound webhooks (HMAC verification). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run bootstrap admin (password ≥12 chars in prod). Created only when the user store is empty. |
| `TRUST_PROXY` | Set `true` or a hop count when TLS terminates at a reverse proxy so rate-limit and `X-Forwarded-*` see the client correctly. |

Generate strong secrets, e.g. `openssl rand -hex 32`. Store them in your platform's secret manager — never commit `.env`. The API loads repo-root `.env` at process start and will not override variables already present in the environment.

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

- `GET /api/health` — process up; pings Postgres when configured. Body is `{ ok, version, service, postgres }` (no `ready` field). 503 if the ping fails. The image `HEALTHCHECK` treats a non-OK HTTP status as unhealthy.
- `GET /api/health/live` — liveness (process up). Use for container restart policy.
- `GET /api/health/ready` — readiness (DB reachable); returns 503 when not. Prefer this for load-balancer/ingress readiness gating.

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

For horizontal scaling (multiple replicas): move the rate-limit store to a shared backend (e.g. Redis) — the default in-memory limiter is per-instance. Postgres handles shared project state; audit JSONL, baselines, and the JSON file store are **not** multi-instance safe.

Scheduled close-pack jobs (`POST /api/platform/projects/:id/export-jobs`) are polled **hourly**. `scheduleCron` is persisted but the runner always sets the next run to 06:00 UTC on the first of next month.

## Observability

Unhandled errors and some route failures include a generated `errorId` in the JSON body and a matching `console.error` line. A structured `logger` helper exists (`server/src/utils/logger.ts`, honors `LOG_LEVEL`) but is **not** wired into request middleware — there is no per-request `x-request-id` today. Ship stdout/stderr to your log platform. Metrics/tracing/error-tracking (Prometheus/OTel/Sentry) are still recommended — see `REMEDIATION-STATUS.md`.

## Rollback

Redeploy the previous image tag. If a migration was applied, restore the pre-deploy database backup before rolling back code that expects the older schema.
