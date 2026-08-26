# Deployment & Operations Runbook

Operational guide for running the Project Controls Intelligence Platform in production.

## Architecture at a glance

A single container image (`Dockerfile`) builds and serves both the React client (static assets) and the Express/TypeScript API. Project state, immutable audit events, and baseline snapshots persist in PostgreSQL (required in production). See `ENTERPRISE-ARCHITECTURE.md` for the layering.

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
| `AUDIT_HMAC_SECRET` | **Required** — keys the tamper-evident audit chain. |
| `CREDENTIALS_KEY` | **Required** — AES-256-GCM key for connector OAuth tokens at rest. |
| `CORS_ORIGIN` | Allowlist of client origins; cross-origin is denied if unset in prod. |
| `WEBHOOK_SECRET` | Required to accept inbound webhooks (HMAC verification). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run bootstrap admin (password ≥12 chars in prod). |
| `BOOTSTRAP_PROJECT_NAME` | Creates one empty project when the production projects database is empty; demo data is never seeded in production. |
| `METRICS_TOKEN` | Optional ≥16-character bearer token enabling `GET /api/metrics`. |
| `TRUST_PROXY` | Trusted reverse-proxy hop count (normally `1`) for correct client IP/rate limiting. |
| `DOCUMENT_ENCRYPTION_KEY` | Dedicated source-document AES-256-GCM key. |
| `DOCUMENT_SCAN_ENDPOINT` | Private malware-scanning gateway; required before document ingestion is enabled. |

Generate strong secrets, e.g. `openssl rand -hex 32`. Store them in your platform's secret manager — never commit `.env`.

For managed PostgreSQL set `DATABASE_SSL=true` and retain certificate verification unless your platform explicitly requires otherwise. Pool size and connect/statement timeouts are configurable with `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, and `DB_STATEMENT_TIMEOUT_MS`.

## Run with Docker Compose

```bash
cp .env.example .env        # then edit secrets
# Compose also requires bootstrap admin credentials and BOOTSTRAP_PROJECT_NAME.
docker compose up -d --build
```

- App: `http://localhost:3001` (put a TLS-terminating proxy in front for real deployments)
- Postgres runs internal-only (not published to the host).
- Audit events and baseline snapshots are included in PostgreSQL backups.

## Database migrations

SQL migrations in `server/src/db/migrations/*.sql` run automatically at startup when `DATABASE_URL` is set. Review them before first deploy. Take a backup before deploying a release that adds migrations.

## First boot and project access

An empty production database creates one blank project from `BOOTSTRAP_PROJECT_NAME`; demo projects are never seeded. The bootstrap administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Every non-admin user—including newly provisioned OIDC users—must receive an explicit project membership through `POST /api/platform/projects/:projectId/roles` before project data is visible. This deny-by-default behavior is intentional.

## Enterprise SSO

Configure `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and the public HTTPS `OIDC_REDIRECT_URI` ending at `/api/platform/auth/oidc/callback`. Discovery resolves authorization/token endpoints unless explicit endpoints are supplied. The server generates PKCE verifier/challenge, signed state and nonce, performs the code exchange, verifies the ID token, provisions the local identity, and issues the HttpOnly application session. `OIDC_CLIENT_SECRET` is optional for public PKCE clients. The legacy client-posted ID-token endpoint is disabled in production.

## Health checks

- `GET /api/health` — overall status incl. `ready` (real DB probe).
- `GET /api/health/live` — liveness (process up). Use for container restart policy.
- `GET /api/health/ready` — readiness (DB reachable); returns 503 when not. Use for load-balancer/ingress readiness gating.

## TLS / reverse proxy

Run the app behind a reverse proxy (nginx, Caddy, Traefik, or a cloud LB) that terminates TLS and forwards to port 3001. Recommended proxy settings: HSTS, HTTP→HTTPS redirect, and forwarding `X-Forwarded-*`. Set `CORS_ORIGIN` to your public client origin. Example nginx location:

The supported production topology serves the SPA and `/api` on the same site so the Secure, HttpOnly, SameSite=Strict session cookie remains CSRF-resistant. A cross-site client/API split requires a separate cookie/CSRF design and is not enabled by default.

```nginx
location / {
    proxy_pass http://app:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Backups & disaster recovery

Use `scripts/backup.sh` (`pg_dump`, plus the JSON/file fallback directory when present) on a schedule. Test restores periodically and verify the audit chain after restoration. Retain backups per your data-retention policy.

```bash
DATABASE_URL=postgres://... ./scripts/backup.sh /var/backups/project-controls
```

## Graceful shutdown & scaling

The server handles `SIGTERM`/`SIGINT`: it stops accepting connections, drains in-flight requests, closes the DB pool, then exits (with a forced-exit timeout). This makes rolling deploys safe.

For horizontal scaling, configure `REDIS_URL` and set `APP_REPLICA_COUNT` to the deployed replica count; startup rejects multi-replica configuration without Redis. API and login rate limits then use shared Redis state. PostgreSQL handles shared project, audit, baseline, document, and ingestion-job state; workers use leased `SKIP LOCKED` claims. Scheduled exports use a PostgreSQL advisory leader lock so only one replica generates each due pack. The JSON file store remains development-only.

## Observability

Logs are structured JSON (one line per event) at `LOG_LEVEL` (`info`/`warn`/`error`); each request gets an `x-request-id` echoed in responses and used as the error correlation id. Ship stdout to your log platform. When `METRICS_TOKEN` is configured, scrape `GET /api/metrics` with `Authorization: Bearer <token>`. Distributed tracing and external error tracking remain deployment integrations.

## Supported production scope

Illustrative intelligence and simulated connector modules are excluded by default. Keep `VITE_ENABLE_SIMULATED_FEATURES=false` and `ENABLE_SIMULATED_INTEGRATIONS=false` in production. The supported ingestion scope is reviewed CSV/P6 CSV, manual mapping, and configured OCR providers; live SAP/P6 APIs remain excluded.

## OCR provider deployment

`OCR_DEFAULT_PROVIDER=local` is the privacy-first default. Text-layer PDFs, text, and CSV are processed in the application. For scanned PDFs/images, configure a private `OCR_LOCAL_ENDPOINT` (recommended) or mount local Tesseract language data with `OCR_LOCAL_TESSDATA_PATH`.

Azure Document Intelligence requires `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_KEY`. AWS Textract uses the standard AWS credential chain and `AWS_REGION`. Selecting either cloud provider sends document content to that provider; complete the relevant data-processing, residency, retention, and private-network review first.

Production requires `INGESTION_ASYNC=true`. Uploaded documents enqueue PostgreSQL jobs; workers claim jobs with `FOR UPDATE SKIP LOCKED`, hold expiring leases, retry with bounded backoff, and publish status through project-scoped job APIs. Multiple application replicas may run workers safely. Tune `INGESTION_WORKER_INTERVAL_MS` for the deployment.

## Snowflake cost integration

Configure a read-only Snowflake user/role, warehouse, database, and schema. OAuth or key-pair authentication is recommended; password authentication is blocked in production unless explicitly enabled. Mapping Studio stores the organization-specific column/value mapping, while the profile dataset must be a validated one-to-three-part table/view identifier such as `CURATED.PROJECT_CONTROLS.COST_VIEW`.

Snowflake rows are capped per query, deduplicated by external line ID, WBS/CBS reconciled, and staged for approver sign-off. Non-USD rows are blocked from posting until the curated view or mapping supplies reporting-currency values. Optional watermark fields support incremental reads.

## Planview governance integration

Set `PLANVIEW_PRODUCT` for Portfolios, ProjectPlace, or a generic GET-based REST deployment; configure the fixed base URL and OAuth/API credentials. The active `project_governance` mapping profile supplies the relative endpoint path and maps product/company fields into milestones, actions, issues, and decisions. AdaptiveWork entity-query POST support remains a separate adapter.

Responses are bounded and support offset/cursor continuation where exposed. External IDs deduplicate, milestones require control-account mapping, and all items stage for approver sign-off before posting to project registers or the integrated schedule.

## Rollback

Redeploy the previous image tag. If a migration was applied, restore the pre-deploy database backup before rolling back code that expects the older schema.
